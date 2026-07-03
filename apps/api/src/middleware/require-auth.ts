/**
 * Session-based authentication middleware.
 * Reads `clipforge_session` cookie, looks up session, attaches req.user.
 */

import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@clipforge/db';
import { sessions, users } from '@clipforge/db/schema';
import { ApiError } from './error-handler';
import { API_ERROR_CODES } from '@clipforge/shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        displayName: string | null;
        isAdmin: boolean;
        role: 'admin' | 'editor' | 'viewer';
      };
    }
  }
}

const SESSION_COOKIE = 'clipforge_session';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) {
      throw new ApiError(401, API_ERROR_CODES.UNAUTHORIZED, 'Authentication required');
    }
    const [row] = await db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        role: users.role,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sid))
      .limit(1);

    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new ApiError(401, API_ERROR_CODES.UNAUTHORIZED, 'Session expired');
    }

    req.user = {
      id: row.userId,
      email: row.email,
      displayName: row.displayName,
      isAdmin: row.isAdmin,
      role: (row.role as 'admin' | 'editor' | 'viewer') ?? 'editor',
    };
    next();
  } catch (err) {
    next(err);
  }
}