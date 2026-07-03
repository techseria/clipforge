/**
 * Admin routes — PRD §7.2 (T5.6)
 * - GET    /api/v1/admin/users             — list all users (admin only)
 * - PATCH  /api/v1/admin/users/:id/role    — change a user's role
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@clipforge/db';
import { users, auditLog } from '@clipforge/db/schema';
import { requireAuth } from '../middleware/require-auth';
import { ApiError } from '../middleware/error-handler';
import { API_ERROR_CODES } from '@clipforge/shared';

export const adminRouter = Router();
adminRouter.use(requireAuth);

function requireAdmin(req: Express.Request, _res: Express.Response, next: Express.NextFunction) {
  if (!req.user?.isAdmin) {
    return next(new ApiError(403, API_ERROR_CODES.FORBIDDEN, 'Admin only'));
  }
  next();
}

adminRouter.get('/users', requireAdmin, async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt);
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

const roleSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
});

adminRouter.patch('/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = roleSchema.parse(req.body);
    const [updated] = await db
      .update(users)
      .set({ role: body.role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id, email: users.email, role: users.role });
    if (!updated) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'User not found');
    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'admin.role_change',
      entityType: 'user',
      entityId: id,
      metadata: { newRole: body.role },
      ipAddress: req.ip ?? null,
    });
    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});