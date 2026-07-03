/**
 * Gemini Veo Flash (3.1 Fast) provider — PRD §8
 * Specs: 8s max, 720p/1080p, optional native audio, image-to-video,
 * soft cap (cost-based alerting).
 *
 * API: https://generativelanguage.googleapis.com/v1beta
 *   POST  /models/{model}:predictLongRunning   → returns operation name
 *   GET   /{operation}                        → poll until done: true
 *   On success: response.generateVideoResponse.generatedSamples[0].video.uri
 *   Download URL requires the API key as a query param.
 */

import { request } from 'undici';
import {
  type VideoProvider,
  type GenerateRequest,
  type GenerateResponse,
  type CheckStatusResponse,
  ProviderError,
} from './types';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiOperation {
  name: string;
  done?: boolean;
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string; gcsUri?: string };
      }>;
    };
  };
  error?: { code: number; message: string };
}

export class VeoFlashProvider implements VideoProvider {
  readonly id = 'gemini_veo_flash' as const;

  constructor(
    private readonly apiKey: string = process.env.GEMINI_API_KEY ?? '',
    private readonly modelId: string = process.env.VEO_FLASH_MODEL ?? 'veo-3.1-fast-generate-preview'
  ) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for VeoFlashProvider');
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const body = {
      instances: [
        {
          prompt: req.prompt,
          image: req.referenceImageUrl ? { gcsUri: req.referenceImageUrl } : undefined,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: req.aspectRatio ?? '16:9',
        // T5.1: Veo synchronized audio generation
        ...(req.includeAudio ? { audioTimestamp: 'enabled' } : {}),
      },
    };

    const url = `${GEMINI_BASE}/models/${this.modelId}:predictLongRunning?key=${this.apiKey}`;
    const { statusCode, body: resBody } = await request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (statusCode >= 400) {
      const text = await resBody.text();
      throw this.mapError(statusCode, text);
    }

    const op = (await resBody.json()) as GeminiOperation;
    if (!op.name) {
      throw new ProviderError('unknown', `Veo did not return operation name: ${JSON.stringify(op)}`, false);
    }
    return { providerJobId: op.name };
  }

  async checkStatus(providerJobId: string): Promise<CheckStatusResponse> {
    const url = `${GEMINI_BASE}/${providerJobId}?key=${this.apiKey}`;
    const { statusCode, body: resBody } = await request(url, { method: 'GET' });
    if (statusCode >= 400) {
      const text = await resBody.text();
      throw this.mapError(statusCode, text);
    }
    const op = (await resBody.json()) as GeminiOperation;

    if (op.error) {
      return {
        status: 'failed',
        errorCode: `gemini_${op.error.code}`,
        errorMessage: op.error.message,
      };
    }
    if (!op.done) return { status: 'running' };

    const sample = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
    let uri = sample?.uri ?? sample?.gcsUri;
    if (!uri) {
      return {
        status: 'failed',
        errorCode: 'no_video_in_response',
        errorMessage: 'Provider returned no video in response',
      };
    }
    // Gemini file download URLs require the API key as a query param
    if (uri.includes('generativelanguage.googleapis.com') && !uri.includes('key=')) {
      const sep = uri.includes('?') ? '&' : '?';
      uri = `${uri}${sep}key=${this.apiKey}`;
    }
    return {
      status: 'succeeded',
      resultUrl: uri,
    };
  }

  async cancel(providerJobId: string): Promise<void> {
    // Gemini does not expose a cancel endpoint for Veo ops; no-op for now.
    void providerJobId;
  }

  private mapError(status: number, text: string): ProviderError {
    if (status === 429) {
      return new ProviderError('rate_limited', `Gemini rate limit: ${text}`, true);
    }
    if (status === 400 && /safety|policy|blocked|not supported/i.test(text)) {
      return new ProviderError('content_rejected', `Gemini content policy: ${text}`, false);
    }
    if (status >= 500) {
      return new ProviderError('transient_failure', `Gemini 5xx: ${text}`, true);
    }
    return new ProviderError('unknown', `Gemini error ${status}: ${text}`, false);
  }
}