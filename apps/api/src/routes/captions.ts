/**
 * Captions routes — PRD §7.2 (T5.3)
 * - POST /api/v1/generations/:id/captions      — enqueue auto-captioning
 * - GET  /api/v1/generations/:id/captions      — list caption segments
 *
 * The captions worker downloads the generation's MP4, extracts audio, sends it
 * to OpenAI Whisper (or a local whisper.cpp) for transcription, persists the
 * segments, and (during a merge with captionsEnabled=true) the merge worker
 * renders them as burned-in subtitles via ffmpeg's drawtext filter.
 */

import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@clipforge/db';
import { generations, captionSegments, auditLog } from '@clipforge/db/schema';
import { requireAuth } from '../middleware/require-auth';
import { ApiError } from '../middleware/error-handler';
import { API_ERROR_CODES } from '@clipforge/shared';
import { captionsQueue } from '../queues/captions-queue';

export const captionsRouter = Router();
captionsRouter.use(requireAuth);

captionsRouter.get('/generations/:id/captions', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [gen] = await db
      .select()
      .from(generations)
      .where(and(eq(generations.id, id), eq(generations.userId, req.user!.id)))
      .limit(1);
    if (!gen) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Generation not found');
    const segs = await db
      .select()
      .from(captionSegments)
      .where(eq(captionSegments.generationId, id))
      .orderBy(asc(captionSegments.startMs));
    res.json({ captions: segs });
  } catch (err) {
    next(err);
  }
});

captionsRouter.post('/generations/:id/captions', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [gen] = await db
      .select()
      .from(generations)
      .where(and(eq(generations.id, id), eq(generations.userId, req.user!.id)))
      .limit(1);
    if (!gen) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Generation not found');
    if (gen.status !== 'succeeded') {
      throw new ApiError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Generation must be succeeded first');
    }

    // Enqueue captioning job
    await captionsQueue.add(
      `captions-${id}`,
      { generationId: id, userId: req.user!.id },
      { jobId: `captions-${id}`, attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
    );

    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'captions.enqueue',
      entityType: 'generation',
      entityId: id,
      ipAddress: req.ip ?? null,
    });

    res.status(202).json({ generationId: id, status: 'queued' });
  } catch (err) {
    next(err);
  }
});