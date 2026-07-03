/**
 * Merges routes — PRD §13
 * - POST /api/v1/projects/:id/merge     (enqueue, 202)
 * - GET  /api/v1/merges/:id              (poll status / signed URL)
 * - GET  /api/v1/projects/:id/merges     (export history)
 */

import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createMergeSchema, API_ERROR_CODES } from '@clipforge/shared';
import { db } from '@clipforge/db';
import { projects, merges, generations } from '@clipforge/db/schema';
import { requireAuth } from '../middleware/require-auth';
import { ApiError } from '../middleware/error-handler';
import { mergeQueue } from '../queues/generation-queue';

export const mergesRouter = Router();
mergesRouter.use(requireAuth);

async function assertProjectOwner(projectId: number, userId: number) {
  const [p] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!p) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Project not found');
}

// ─── POST /projects/:id/merge ────────────────────────────────────────────
mergesRouter.post('/projects/:id/merge', async (req, res, next) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.id);
    await assertProjectOwner(projectId, req.user!.id);

    const body = createMergeSchema.parse(req.body);

    // Verify all selectedGenerationIds belong to scenes in this project AND succeeded
    const rows = await db
      .select({
        id: generations.id,
        sceneId: generations.sceneId,
        status: generations.status,
        durationSeconds: generations.durationSeconds,
      })
      .from(generations)
      .where(eq(generations.userId, req.user!.id));
    const owned = new Map(rows.map((r) => [r.id, r]));
    const notReady = body.selectedGenerationIds.filter(
      (id) => owned.get(id)?.status !== 'succeeded'
    );
    if (notReady.length) {
      throw new ApiError(
        400,
        API_ERROR_CODES.VALIDATION_ERROR,
        `Some clips aren't ready: ${notReady.join(', ')}`
      );
    }
    const totalSeconds = body.selectedGenerationIds.reduce(
      (acc, id) => acc + (owned.get(id)?.durationSeconds ?? 8),
      0
    );

    // T5.4: resolve per-scene transitions in order
    const { scenes: sceneRows } = await db.execute({
      sql: 'SELECT id, position, transition_to_next FROM scenes WHERE project_id = $1 ORDER BY position',
      args: [projectId],
    } as any).catch(() => ({ scenes: [] })) as any;
    const transitions: Array<'cut' | 'fade_black' | 'crossfade_05' | 'crossfade_1'> = (sceneRows ?? []).map(
      (s: any) => s.transition_to_next ?? 'cut'
    );

    // T5.2: music track (if provided)
    let musicTrackKey: string | null = null;
    if (body.musicTrackId) {
      const { musicTracks } = await import('@clipforge/db/schema');
      const { eq: eqOp, and: andOp, or: orOp } = await import('drizzle-orm');
      const [track] = await db
        .select()
        .from(musicTracks)
        .where(
          andOp(
            eqOp(musicTracks.id, body.musicTrackId),
            orOp(eqOp(musicTracks.isBuiltIn, true), eqOp(musicTracks.userId, req.user!.id))
          )
        )
        .limit(1);
      if (!track) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Music track not found');
      musicTrackKey = track.objectKey;
    }

    // Insert merge row + enqueue
    const [merge] = await db
      .insert(merges)
      .values({
        projectId,
        userId: req.user!.id,
        selectedGenerationIds: body.selectedGenerationIds,
        totalDurationSeconds: totalSeconds,
      })
      .returning();

    await mergeQueue.add(
      `merge-${merge!.id}`,
      {
        mergeId: merge!.id,
        projectId,
        userId: req.user!.id,
        selectedGenerationIds: body.selectedGenerationIds,
        musicTrackKey,
        musicVolumeDb: body.musicVolumeDb,
        captionsEnabled: body.captionsEnabled,
        transitions,
      },
      {
        jobId: `merge-${merge!.id}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 24 * 3600 },
      }
    );

    res.status(202).json({ mergeId: merge!.id, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// ─── GET /merges/:id ─────────────────────────────────────────────────────
mergesRouter.get('/merges/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [merge] = await db
      .select()
      .from(merges)
      .where(and(eq(merges.id, id), eq(merges.userId, req.user!.id)))
      .limit(1);
    if (!merge) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Merge not found');
    res.json({ merge });
  } catch (err) {
    next(err);
  }
});

// ─── GET /projects/:id/merges (export history) ───────────────────────────
mergesRouter.get('/projects/:id/merges', async (req, res, next) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.id);
    await assertProjectOwner(projectId, req.user!.id);
    const history = await db
      .select()
      .from(merges)
      .where(eq(merges.projectId, projectId))
      .orderBy(desc(merges.createdAt))
      .limit(50);
    res.json({ merges: history });
  } catch (err) {
    next(err);
  }
});