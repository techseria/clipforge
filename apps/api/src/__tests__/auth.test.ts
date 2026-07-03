/**
 * Smoke tests for auth endpoints.
 * Run with: pnpm --filter @clipforge/api test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('auth', () => {
  let cookie: string;

  beforeAll(async () => {
    // Register a fresh user for the test
    const email = `test-${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse-battery' });
    expect(res.status).toBe(201);
    cookie = res.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    expect(cookie).toMatch(/^clipforge_session=/);
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('returns the current user from /me with a valid session', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: expect.stringMatching(/^test-/) });
  });

  it('rejects /me without a session', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects malformed JSON with a Zod validation error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});