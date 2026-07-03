/**
 * BullMQ queue definitions shared by the API (producer) and worker (consumer).
 */

import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

export const GENERATION_QUEUE = 'generation';
export const MERGE_QUEUE = 'merge';

export const generationQueue = new Queue(GENERATION_QUEUE, { connection });
export const mergeQueue = new Queue(MERGE_QUEUE, { connection });

export const generationQueueEvents = new QueueEvents(GENERATION_QUEUE, { connection });
export const mergeQueueEvents = new QueueEvents(MERGE_QUEUE, { connection });

export interface GenerationJobData {
  generationId: number;
  sceneId: number;
  userId: number;
  provider: 'gemini_veo_pro' | 'gemini_veo_flash' | 'minimax_hailuo_2_3';
  prompt: string;
  referenceImageUrl?: string | null;
  promptOptimizerEnabled: boolean;
  watermarkEnabled: boolean;
  includeAudio: boolean;
  aspectRatio: string;
}

export interface MergeJobData {
  mergeId: number;
  projectId: number;
  userId: number;
  selectedGenerationIds: number[];
  musicTrackKey?: string | null;
  musicVolumeDb?: number;
  captionsEnabled?: boolean;
  transitions?: Array<'cut' | 'fade_black' | 'crossfade_05' | 'crossfade_1'>;
}