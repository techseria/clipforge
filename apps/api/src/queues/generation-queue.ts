/**
 * Queue instance used by the API (producer side only).
 * Mirrored by the worker (consumer side) in apps/worker.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const generationQueue = new Queue('generation', { connection });
export const mergeQueue = new Queue('merge', { connection });