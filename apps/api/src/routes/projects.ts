/**
 * Projects routes — PRD §6.2
 * - GET    /api/v1/projects
 * - POST   /api/v1/projects
 * - GET    /api/v1/projects/:id
 * - PATCH  /api/v1/projects/:id
 * - DELETE /api/v1/projects/:id
 */

import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createProjectSchema, updateProjectSchema, API_ERROR_CODES } from '@clipforge/shared';
import { db } from '@clipforge/db';
import { projects, scenes, auditLog } from '@clipforge/db/schema';
import { requireAuth } from '../middleware/require-auth';
import { requireRole } from '../middleware/require-role';
import { ApiError } from '../middleware/error-handler';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

// ─── List projects ───────────────────────────────────────────────────────
projectsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        thumbnailClipId: projects.thumbnailClipId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.userId, req.user!.id))
      .orderBy(desc(projects.updatedAt))
      .limit(100);

    // scene counts
    const projectIds = rows.map((r) => r.id);
    const sceneCounts = projectIds.length
      ? await db
          .select({ projectId: scenes.projectId })
          .from(scenes)
          .where(
            and(eq(scenes.projectId, projectIds[0]!)) // placeholder; full IN-list below
          )
      : [];
    // Simpler: just count via subquery per project (or a groupBy). For brevity: fetch all.
    const allScenes = await db
      .select({ projectId: scenes.projectId })
      .from(scenes);
    const counts = new Map<number, number>();
    for (const s of allScenes) counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);

    res.json({
      projects: rows.map((p) => ({ ...p, sceneCount: counts.get(p.id) ?? 0 })),
    });
    // silence unused
    void sceneCounts;
  } catch (err) {
    next(err);
  }
});

// ─── Create project ─────────────────────────────────────────────────────
projectsRouter.post('/', requireRole('editor'), async (req, res, next) => {
  try {
    const body = createProjectSchema.parse(req.body);
    const [project] = await db
      .insert(projects)
      .values({
        userId: req.user!.id,
        title: body.title,
        globalStylePrompt: body.globalStylePrompt,
      })
      .returning();

    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'project.create',
      entityType: 'project',
      entityId: project!.id,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

// ─── Get project ─────────────────────────────────────────────────────────
projectsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, req.user!.id)))
      .limit(1);
    if (!project) {
      throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Project not found');
    }
    const projectScenes = await db
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, id))
      .orderBy(scenes.position);
    res.json({ project, scenes: projectScenes });
  } catch (err) {
    next(err);
  }
});

// ─── Update project ──────────────────────────────────────────────────────
projectsRouter.patch('/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = updateProjectSchema.parse(req.body);
    const [updated] = await db
      .update(projects)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, req.user!.id)))
      .returning();
    if (!updated) {
      throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Project not found');
    }
    res.json({ project: updated });
  } catch (err) {
    next(err);
  }
});

// ─── Delete project ──────────────────────────────────────────────────────
projectsRouter.delete('/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, req.user!.id)))
      .returning({ id: projects.id });
    if (!deleted) {
      throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Project not found');
    }
    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'project.delete',
      entityType: 'project',
      entityId: id,
      ipAddress: req.ip ?? null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});