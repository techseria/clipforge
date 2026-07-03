/**
 * VideoProvider interface — PRD §8.3
 * All three models (Veo Pro, Veo Flash, Hailuo 2.3) implement this.
 * Provider-specific quirks are normalized at this layer.
 */

import type { ProviderId } from '@clipforge/shared';

export interface GenerateRequest {
  prompt: string;
  referenceImageUrl?: string | null;
  aspectRatio?: string; // e.g. "16:9"
  promptOptimizerEnabled?: boolean;
  watermarkEnabled?: boolean;
  includeAudio?: boolean; // T5.1: Veo synchronized audio generation
}

export interface GenerateResponse {
  providerJobId: string;
}

export type ProviderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface CheckStatusResponse {
  status: ProviderJobStatus;
  progress?: number; // 0..1
  resultUrl?: string; // remote URL of finished asset
  errorCode?: string;
  errorMessage?: string;
}

export interface VideoProvider {
  readonly id: ProviderId;
  /** Submit a generation job. */
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  /** Poll a previously-submitted job. */
  checkStatus(providerJobId: string): Promise<CheckStatusResponse>;
  /** Request cancellation (best-effort). */
  cancel(providerJobId: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    public code: 'content_rejected' | 'transient_failure' | 'rate_limited' | 'unknown',
    message: string,
    public retryable: boolean
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}