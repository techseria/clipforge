/**
 * Scenes routes — PRD §6.2
 * Mounted under /api/v1 with full nested paths
 * - POST   /api/v1/projects/:projectId/scenes
 * - PATCH  /api/v1/scenes/:id
 * - DELETE /api/v1/scenes/:id
 */

import { Router } from 'express';
import { and, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { createSceneSchema, updateSceneSchema, API_ERROR_CODES } from '@clipforge/shared';
import { db } from '@clipforge/db';
import { projects, scenes, auditLog } from '@clipforge/db/schema';
import { requireAuth } from '../middleware/require-auth';
import { ApiError } from '../middleware/error-handler';

export const scenesRouter = Router();
scenesRouter.use(requireAuth);

async function assertProjectOwner(projectId: number, userId: number) {
  const [p] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!p) {
    throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Project not found');
  }
}

// ─── POST /projects/:projectId/scenes ────────────────────────────────────
scenesRouter.post('/projects/:projectId/scenes', async (req, res, next) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    await assertProjectOwner(projectId, req.user!.id);
    const body = createSceneSchema.parse(req.body);

    // Compute next position
    const [{ nextPos }] = await db
      .select({ nextPos: max(scenes.position) })
      .from(scenes)
      .where(eq(scenes.projectId, projectId));

    const [scene] = await db
      .insert(scenes)
      .values({
        projectId,
        position: (nextPos ?? -1) + 1,
        prompt: body.prompt,
        defaultModel: body.defaultModel,
        referenceImageUrl: body.referenceImageUrl ?? null,
        aspectRatio: body.aspectRatio,
        promptOptimizerEnabled: body.promptOptimizerEnabled,
        watermarkEnabled: body.watermarkEnabled,
        includeAudio: body.includeAudio,
        transitionToNext: body.transitionToNext,
        transitionSeconds: body.transitionSeconds ?? null,
        subjectReferenceId: body.subjectReferenceId ?? null,
      })
      .returning();

    res.status(201).json({ scene });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /scenes/:id ───────────────────────────────────────────────────
scenesRouter.patch('/scenes/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = updateSceneSchema.parse(req.body);

    // Verify ownership via scene → project → user
    const [scene] = await db
      .select({ id: scenes.id, projectId: scenes.projectId })
      .from(scenes)
      .where(eq(scenes.id, id))
      .limit(1);
    if (!scene) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Scene not found');
    await assertProjectOwner(scene.projectId, req.user!.id);

    const [updated] = await db
      .update(scenes)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(scenes.id, id))
      .returning();

    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'scene.update',
      entityType: 'scene',
      entityId: id,
      metadata: body as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });

    res.json({ scene: updated });
  } catch (err) {
    next(err);
  }
});

// ─── POST /projects/:projectId/scenes/reorder ────────────────────────────
scenesRouter.post('/projects/:projectId/scenes/reorder', async (req, res, next) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    await assertProjectOwner(projectId, req.user!.id);
    const body = z.object({ orderedIds: z.array(z.number().int().positive()) }).parse(req.body);

    // Update positions in a single transaction
    await db.transaction(async (tx) => {
      for (let i = 0; i < body.orderedIds.length; i++) {
        await tx
          .update(scenes)
          .set({ position: i })
          .where(and(eq(scenes.id, body.orderedIds[i]!), eq(scenes.projectId, projectId)));
      }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /scenes/:id ──────────────────────────────────────────────────
scenesRouter.delete('/scenes/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [scene] = await db
      .select({ id: scenes.id, projectId: scenes.projectId })
      .from(scenes)
      .where(eq(scenes.id, id))
      .limit(1);
    if (!scene) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Scene not found');
    await assertProjectOwner(scene.projectId, req.user!.id);

    await db.delete(scenes).where(eq(scenes.id, id));

    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'scene.delete',
      entityType: 'scene',
      entityId: id,
      ipAddress: req.ip ?? null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});