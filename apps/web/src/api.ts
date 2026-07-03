/**
 * Typed fetch wrapper. Throws ApiError with machine-readable code.
 */

import { API_ERROR_CODES, type ApiErrorCode } from '@clipforge/shared';

export class ApiError extends Error {
  constructor(public status: number, public code: ApiErrorCode | string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let body: any = {};
    try {
      body = await res.json();
    } catch {
      // ignore non-JSON
    }
    throw new ApiError(res.status, body?.error?.code ?? 'unknown', body?.error?.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};

export type Project = {
  id: number;
  title: string;
  globalStylePrompt: string;
  status: 'draft' | 'generating' | 'ready_to_merge' | 'exported';
  thumbnailClipId: number | null;
  createdAt: string;
  updatedAt: string;
  sceneCount?: number;
};

export type Scene = {
  id: number;
  projectId: number;
  position: number;
  prompt: string;
  defaultModel: 'gemini_veo_pro' | 'gemini_veo_flash' | 'minimax_hailuo_2_3';
  selectedGenerationId: number | null;
  status: 'not_generated' | 'queued' | 'generating' | 'ready' | 'failed';
  referenceImageUrl: string | null;
  aspectRatio: string;
  promptOptimizerEnabled: boolean;
  watermarkEnabled: boolean;
  includeAudio?: boolean;
  transitionToNext?: 'cut' | 'fade_black' | 'crossfade_05' | 'crossfade_1';
  transitionSeconds?: number | null;
  subjectReferenceId?: number | null;
};

export type Generation = {
  id: number;
  sceneId: number;
  provider: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  resultUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type Merge = {
  id: number;
  projectId: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  resultUrl: string | null;
  totalDurationSeconds: number;
  createdAt: string;
  finishedAt: string | null;
};

export type UsageEntry = {
  provider: string;
  remaining: number;
  limit: number;
  used: number;
};

/**
 * Build the URL the web UI uses to stream a stored clip / upload / merged file.
 * The API stores these as relative keys (e.g. `clips/2/5.mp4`) and serves
 * them at `GET /api/v1/files/<key>` after auth-checking the user.
 *
 * Pass an already-absolute URL (e.g. a provider's CDN) through unchanged.
 */
export function fileUrl(resultUrl: string | null | undefined): string | undefined {
  if (!resultUrl) return undefined;
  if (/^https?:\/\//.test(resultUrl)) return resultUrl;
  if (resultUrl.startsWith('/')) return resultUrl;
  return `/api/v1/files/${resultUrl}`;
}

// silence unused
void API_ERROR_CODES;