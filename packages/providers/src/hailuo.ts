/**
 * MiniMax Hailuo 2.3 provider — PRD §8
 * Specs: 6s or 10s (capped at 8s by UI), 768p/1080p, image-to-video,
 * Subject-Reference mode, prompt_optimizer, aigc_watermark.
 * Hard cap of 3 generations/user/day.
 *
 * API docs: https://platform.MiniMax.io/docs/guides/video-generation
 *   Base URL: https://api.minimax.io
 *   Workflow: POST /v1/video_generation → poll /v1/query/video_generation →
 *             GET /v1/files/retrieve?file_id=... → download_url
 */

import { request } from 'undici';
import {
  type VideoProvider,
  type GenerateRequest,
  type GenerateResponse,
  type CheckStatusResponse,
  ProviderError,
} from './types';

const HAILUO_BASE = process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io';

interface HailuoSubmitResponse {
  task_id?: string;
  base_resp?: { status_code: number; status_msg: string };
}

interface HailuoQueryResponse {
  status?: 'Queueing' | 'Running' | 'Success' | 'Fail' | 'Failed' | string;
  progress?: number;
  file_id?: string;
  video_url?: string; // some endpoints return this directly
  base_resp?: { status_code: number; status_msg: string };
}

interface HailuoFileRetrieveResponse {
  file?: {
    download_url?: string;
    url?: string;
  };
  download_url?: string;
}

export class HailuoProvider implements VideoProvider {
  readonly id = 'minimax_hailuo_2_3' as const;

  constructor(
    private readonly apiKey: string = process.env.MINIMAX_API_KEY ?? '',
    private readonly modelId: string = process.env.MINIMAX_MODEL ?? 'MiniMax-Hailuo-2.3'
  ) {
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY is required for HailuoProvider');
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const body = {
      model: this.modelId,
      prompt: req.prompt,
      duration: 6, // MiniMax only supports 6s or 10s; UI still advertises 8s (clips will be 6s)
      resolution: '768P',
      prompt_optimizer: req.promptOptimizerEnabled ?? true,
      aigc_watermark: req.watermarkEnabled ?? true,
      first_frame_image: req.referenceImageUrl ?? undefined,
    };

    const url = `${HAILUO_BASE}/v1/video_generation`;
    const { statusCode, body: resBody } = await request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await resBody.json()) as HailuoSubmitResponse;
    if (statusCode >= 400 || (json.base_resp?.status_code !== undefined && json.base_resp.status_code !== 0)) {
      throw this.mapError(statusCode, JSON.stringify(json));
    }
    if (!json.task_id) {
      throw new ProviderError('unknown', `MiniMax did not return task_id: ${JSON.stringify(json)}`, false);
    }
    return { providerJobId: json.task_id };
  }

  async checkStatus(providerJobId: string): Promise<CheckStatusResponse> {
    const url = `${HAILUO_BASE}/v1/query/video_generation?task_id=${encodeURIComponent(providerJobId)}`;
    const { statusCode, body: resBody } = await request(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    const json = (await resBody.json()) as HailuoQueryResponse;

    if (statusCode >= 400) {
      throw this.mapError(statusCode, JSON.stringify(json));
    }

    switch (json.status) {
      case 'Success':
      case 'succeeded': {
        // Some endpoints return video_url directly, others require a file retrieve
        if (json.video_url) {
          return { status: 'succeeded', resultUrl: json.video_url };
        }
        if (json.file_id) {
          const dl = await this.retrieveFile(json.file_id);
          if (dl) return { status: 'succeeded', resultUrl: dl };
        }
        return {
          status: 'failed',
          errorCode: 'no_url',
          errorMessage: 'MiniMax reported success but returned no video_url or file_id',
        };
      }
      case 'Fail':
      case 'Failed':
      case 'failed':
        return {
          status: 'failed',
          errorCode: 'hailuo_failed',
          errorMessage: json.base_resp?.status_msg ?? 'Hailuo generation failed',
        };
      case 'Queueing':
      case 'queued':
        return { status: 'queued' };
      default:
        return {
          status: 'running',
          progress: typeof json.progress === 'number' ? json.progress / 100 : undefined,
        };
    }
  }

  private async retrieveFile(fileId: string): Promise<string | null> {
    const url = `${HAILUO_BASE}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`;
    const { statusCode, body: resBody } = await request(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    if (statusCode >= 400) return null;
    const json = (await resBody.json()) as HailuoFileRetrieveResponse;
    return json.file?.download_url ?? json.file?.url ?? json.download_url ?? null;
  }

  async cancel(providerJobId: string): Promise<void> {
    // MiniMax does not currently expose a cancel endpoint.
    void providerJobId;
  }

  private mapError(status: number, text: string): ProviderError {
    if (status === 429) return new ProviderError('rate_limited', text, true);
    if (status === 401 || /invalid api key|unauthor/i.test(text)) {
      return new ProviderError('unknown', `MiniMax auth failed (${status}): ${text}`, false);
    }
    if (/policy|safety|rejected/i.test(text)) {
      return new ProviderError('content_rejected', text, false);
    }
    if (status >= 500) return new ProviderError('transient_failure', text, true);
    return new ProviderError('unknown', text, false);
  }
}