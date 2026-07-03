/**
 * ClipForge — Shared types, Zod schemas, constants
 * Used by both the React frontend and the Express backend.
 */

import { z } from 'zod';

// ─── Provider Constants ──────────────────────────────────────────────────

export const PROVIDER_IDS = [
  'gemini_veo_pro',
  'gemini_veo_flash',
  'minimax_hailuo_2_3',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini_veo_pro: 'Gemini Veo Pro',
  gemini_veo_flash: 'Gemini Veo Flash',
  minimax_hailuo_2_3: 'MiniMax Hailuo 2.3',
};

export const PROVIDER_COST: Record<ProviderId, '$' | '$$' | '$$$'> = {
  gemini_veo_pro: '$$$',
  gemini_veo_flash: '$',
  minimax_hailuo_2_3: '$$',
};

export const DEFAULT_DAILY_LIMITS: Record<ProviderId, number> = {
  gemini_veo_pro: 10,
  gemini_veo_flash: 20,
  minimax_hailuo_2_3: 3,
};

// ─── Zod Schemas (request validation) ───────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  globalStylePrompt: z.string().max(4000).default(''),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  globalStylePrompt: z.string().max(4000).optional(),
});

export const createSceneSchema = z.object({
  prompt: z.string().min(1).max(4000),
  position: z.number().int().min(0),
  defaultModel: z.enum(PROVIDER_IDS).default('gemini_veo_flash'),
  referenceImageUrl: z.string().url().optional(),
  aspectRatio: z.string().regex(/^\d+:\d+$/).default('16:9'),
  promptOptimizerEnabled: z.boolean().default(true),
  watermarkEnabled: z.boolean().default(true),
  includeAudio: z.boolean().default(false),
  transitionToNext: z.enum(['cut', 'fade_black', 'crossfade_05', 'crossfade_1']).default('cut'),
  transitionSeconds: z.number().int().min(0).max(3).nullable().optional(),
  subjectReferenceId: z.number().int().positive().nullable().optional(),
});

export const updateSceneSchema = createSceneSchema.partial().extend({
  selectedGenerationId: z.number().int().positive().nullable().optional(),
});

export const createGenerationSchema = z.object({
  model: z.enum(PROVIDER_IDS),
  promptOverride: z.string().min(1).max(4000).optional(),
  referenceImageUrl: z.string().url().optional(),
  includeAudio: z.boolean().optional(),
});

export const createMergeSchema = z.object({
  selectedGenerationIds: z.array(z.number().int().positive()).min(1),
  musicTrackId: z.number().int().positive().optional(),
  musicVolumeDb: z.number().min(-30).max(0).default(-12),
  captionsEnabled: z.boolean().default(false),
});

// ─── API Error Codes (PRD §12.2 — machine-readable) ─────────────────────

export const API_ERROR_CODES = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  VALIDATION_ERROR: 'validation_error',
  QUOTA_EXCEEDED: 'quota_exceeded',
  CONTENT_REJECTED: 'content_rejected',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  INTERNAL: 'internal_error',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

// ─── WebSocket Job Event Types ──────────────────────────────────────────

export type JobEvent =
  | { type: 'generation.queued'; generationId: number; sceneId: number }
  | { type: 'generation.running'; generationId: number }
  | { type: 'generation.progress'; generationId: number; progress: number }
  | { type: 'generation.succeeded'; generationId: number; resultUrl: string }
  | { type: 'generation.failed'; generationId: number; errorCode: string; errorMessage: string }
  | { type: 'merge.queued'; mergeId: number }
  | { type: 'merge.running'; mergeId: number; progress: number }
  | { type: 'merge.succeeded'; mergeId: number; resultUrl: string }
  | { type: 'merge.failed'; mergeId: number; errorMessage: string };