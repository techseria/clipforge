/**
 * Authentication routes — PRD §6.1
 * - POST /api/v1/auth/register
 * - POST /api/v1/auth/login
 * - POST /api/v1/auth/logout
 * - GET  /api/v1/auth/me
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loginSchema, registerSchema, API_ERROR_CODES } from '@clipforge/shared';
import { db } from '@clipforge/db';
import { sessions, users, auditLog } from '@clipforge/db/schema';
import { ApiError } from '../middleware/error-handler';
import { requireAuth } from '../middleware/require-auth';

export const authRouter = Router();

const SESSION_COOKIE = 'clipforge_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function newSessionId() {
  return randomBytes(32).toString('base64url');
}

function setSessionCookie(res: Response, sid: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

async function createSession(userId: number, req: Request) {
  const sid = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sid,
    userId,
    expiresAt,
    userAgent: req.header('user-agent') ?? null,
    ipAddress: req.ip ?? null,
  });
  return { sid, expiresAt };
}

// ─── POST /register ─────────────────────────────────────────────────────
authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const passwordHash = await argon2.hash(body.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    let userId: number;
    try {
      const [row] = await db
        .insert(users)
        .values({
          email: body.email.toLowerCase(),
          passwordHash,
          displayName: body.displayName ?? null,
        })
        .returning({ id: users.id });
      userId = row!.id;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === '23505') {
        throw new ApiError(409, API_ERROR_CODES.VALIDATION_ERROR, 'Email already registered');
      }
      throw e;
    }

    const { sid, expiresAt } = await createSession(userId, req);
    setSessionCookie(res, sid, expiresAt);

    await db.insert(auditLog).values({
      userId,
      action: 'auth.register',
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ user: { id: userId, email: body.email.toLowerCase() } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /login ─────────────────────────────────────────────────────────
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new ApiError(401, API_ERROR_CODES.UNAUTHORIZED, 'Invalid email or password');
    }

    const valid = await argon2.verify(user.passwordHash, body.password);
    if (!valid) {
      throw new ApiError(401, API_ERROR_CODES.UNAUTHORIZED, 'Invalid email or password');
    }

    const { sid, expiresAt } = await createSession(user.id, req);
    setSessionCookie(res, sid, expiresAt);

    await db.insert(auditLog).values({
      userId: user.id,
      action: 'auth.login',
      ipAddress: req.ip ?? null,
    });

    res.json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /logout ────────────────────────────────────────────────────────
authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid) {
      await db.delete(sessions).where(eq(sessions.id, sid));
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'auth.logout',
      ipAddress: req.ip ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /me ─────────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
      displayName: req.user!.displayName,
    },
  });
});