/**
 * Generations routes — PRD §6.4, §6.5
 * - POST /api/v1/scenes/:id/generations        (enqueue, returns 202)
 * - GET  /api/v1/scenes/:id/generations        (history)
 * - GET  /api/v1/generations/:id              (poll single)
 */

import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createGenerationSchema, API_ERROR_CODES } from '@clipforge/shared';
import { db } from '@clipforge/db';
import { scenes, projects, generations, auditLog } from '@clipforge/db/schema';
import { requireAuth } from '../middleware/require-auth';
import { ApiError } from '../middleware/error-handler';
import { enforceQuota, incrementQuota } from '@clipforge/shared/quota';
import { generationQueue } from '../queues/generation-queue';

export const generationsRouter = Router();
generationsRouter.use(requireAuth);

// ─── POST /scenes/:id/generations ────────────────────────────────────────
generationsRouter.post('/scenes/:id/generations', async (req, res, next) => {
  try {
    const sceneId = z.coerce.number().int().positive().parse(req.params.id);
    const body = createGenerationSchema.parse(req.body);

    // Verify ownership: scene → project → user
    const [scene] = await db
      .select({
        id: scenes.id,
        projectId: scenes.projectId,
        prompt: scenes.prompt,
        defaultModel: scenes.defaultModel,
        promptOptimizerEnabled: scenes.promptOptimizerEnabled,
        watermarkEnabled: scenes.watermarkEnabled,
        aspectRatio: scenes.aspectRatio,
        referenceImageUrl: scenes.referenceImageUrl,
        includeAudio: scenes.includeAudio,
      })
      .from(scenes)
      .innerJoin(projects, eq(scenes.projectId, projects.id))
      .where(and(eq(scenes.id, sceneId), eq(projects.userId, req.user!.id)))
      .limit(1);

    if (!scene) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Scene not found');

    // Quota check (throws 429 if hard cap reached)
    await enforceQuota(req.user!.id, body.model);

    // Prepend global style if present (PRD §6.2)
    const [project] = await db
      .select({ globalStylePrompt: projects.globalStylePrompt })
      .from(projects)
      .where(eq(projects.id, scene.projectId))
      .limit(1);

    const finalPrompt = project?.globalStylePrompt
      ? `${project.globalStylePrompt}\n\n${body.promptOverride ?? scene.prompt}`
      : body.promptOverride ?? scene.prompt;

    // T5.5: If the scene has a subjectReferenceId, derive a reference image
    // from that prior generation's first frame (extract happens in worker).
    const sceneMeta = scene as unknown as { subjectReferenceId?: number | null };
    const subjectRefId = sceneMeta.subjectReferenceId ?? null;
    let effectiveRefUrl = body.referenceImageUrl ?? scene.referenceImageUrl;
    if (subjectRefId && !effectiveRefUrl) {
      const [refGen] = await db
        .select({ id: generations.id, resultUrl: generations.resultUrl, status: generations.status })
        .from(generations)
        .where(eq(generations.id, subjectRefId))
        .limit(1);
      if (refGen?.status === 'succeeded' && refGen.resultUrl) {
        effectiveRefUrl = `derived:${refGen.resultUrl}`; // sentinel — worker resolves
      }
    }

    // Atomic: insert generation row + increment quota + enqueue, all in one tx
    let generationId: number;
    await db.transaction(async (tx) => {
      const [gen] = await tx
        .insert(generations)
        .values({
          sceneId,
          userId: req.user!.id,
          provider: body.model,
          prompt: finalPrompt,
          referenceImageUrl: effectiveRefUrl,
          countedAgainstQuota: true,
        })
        .returning({ id: generations.id });
      generationId = gen!.id;
      await incrementQuota(req.user!.id, body.model, tx);
      await tx.update(scenes).set({ status: 'queued' }).where(eq(scenes.id, sceneId));
    });

    // Enqueue job (BullMQ; idempotent on the same generationId)
    await generationQueue.add(
      `gen-${generationId}`,
      {
        generationId,
        sceneId,
        userId: req.user!.id,
        provider: body.model,
        prompt: finalPrompt,
        referenceImageUrl: effectiveRefUrl,
        promptOptimizerEnabled: scene.promptOptimizerEnabled,
        watermarkEnabled: scene.watermarkEnabled,
        includeAudio: body.includeAudio ?? scene.includeAudio,
        aspectRatio: scene.aspectRatio ?? '16:9',
      },
      {
        jobId: `gen-${generationId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
      }
    );

    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'generation.enqueue',
      entityType: 'generation',
      entityId: generationId!,
      metadata: { provider: body.model, sceneId },
      ipAddress: req.ip ?? null,
    });

    res.status(202).json({
      generationId,
      status: 'queued',
      message: 'Generation enqueued. Subscribe to /ws/jobs for status updates.',
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /scenes/:id/generations (history) ──────────────────────────────
generationsRouter.get('/scenes/:id/generations', async (req, res, next) => {
  try {
    const sceneId = z.coerce.number().int().positive().parse(req.params.id);

    // Verify ownership
    const [scene] = await db
      .select({ id: scenes.id, selectedGenerationId: scenes.selectedGenerationId })
      .from(scenes)
      .innerJoin(projects, eq(scenes.projectId, projects.id))
      .where(and(eq(scenes.id, sceneId), eq(projects.userId, req.user!.id)))
      .limit(1);
    if (!scene) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Scene not found');

    const history = await db
      .select()
      .from(generations)
      .where(eq(generations.sceneId, sceneId))
      .orderBy(desc(generations.createdAt));

    res.json({ generations: history, selectedGenerationId: scene.selectedGenerationId });
  } catch (err) {
    next(err);
  }
});

// ─── GET /generations/:id ────────────────────────────────────────────────
generationsRouter.get('/generations/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [gen] = await db
      .select()
      .from(generations)
      .where(and(eq(generations.id, id), eq(generations.userId, req.user!.id)))
      .limit(1);
    if (!gen) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Generation not found');
    res.json({ generation: gen });
  } catch (err) {
    next(err);
  }
});