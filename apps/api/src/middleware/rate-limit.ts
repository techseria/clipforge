/**
 * Redis-backed rate limiter for auth endpoints.
 * Uses express-rate-limit + rate-limit-redis to share state across workers.
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
});

// Each limiter must have its own store instance (per express-rate-limit v7)
const buildStore = (prefix: string) =>
  new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as Promise<unknown>,
    prefix,
  });

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 attempts per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'rate_limited',
      message: 'Too many attempts. Please try again later.',
    },
  },
  store: buildStore('rl:auth:register:'),
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'rate_limited', message: 'Too many login attempts. Try again later.' },
  },
  store: buildStore('rl:auth:login:'),
});

export { redis };