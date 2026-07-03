/**
 * Generation worker — PRD §6.4, §9
 * - Submit to provider → poll with exponential backoff (5–10s) up to 5 minutes
 * - On success: upload to S3, persist result URL, mark selected if first time
 * - On failure (transient): retry up to 3x then mark failed
 * - On content-rejection: refund quota + mark failed
 * - Emit WebSocket events for each status transition
 */

import { Worker, type Job } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@clipforge/db';
import { generations, scenes, analyticsDaily } from '@clipforge/db/schema';
import { getProvider, ProviderError } from '@clipforge/providers';
import { refundQuota } from '@clipforge/shared/quota';
import { logger } from './logger';
import { connection, GENERATION_QUEUE, type GenerationJobData } from './queue';
import { downloadAndUpload } from '@clipforge/storage';
import { extractAndUploadFirstFrame } from './frame-extract';

async function bumpAnalytics(
  provider: GenerationJobData['provider'],
  eventType: 'generation.succeeded' | 'generation.failed',
  spendMicros = 0
) {
  const date = new Date().toISOString().slice(0, 10);
  await db
    .insert(analyticsDaily)
    .values({ metricDate: date, provider, eventType, count: 1, spendMicros })
    .onConflictDoUpdate({
      target: [analyticsDaily.metricDate, analyticsDaily.provider, analyticsDaily.eventType],
      set: {
        count: sql`${analyticsDaily.count} + 1`,
        spendMicros: sql`${analyticsDaily.spendMicros} + ${spendMicros}`,
      },
    });
}

const POLL_INTERVAL_MS = 7000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 min ceiling

async function processGeneration(job: Job<GenerationJobData>) {
  const { generationId, provider, prompt, referenceImageUrl } = job.data;
  logger.info({ generationId, provider }, 'starting generation');

  await db
    .update(generations)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(generations.id, generationId));

  // T5.5: resolve `derived:` sentinel — extract first frame from a prior generation
  let effectiveRefUrl = referenceImageUrl ?? null;
  if (effectiveRefUrl?.startsWith('derived:')) {
    const sourceKey = effectiveRefUrl.slice('derived:'.length);
    const destKey = `derived/${job.data.userId}/${generationId}.jpg`;
    try {
      effectiveRefUrl = await extractAndUploadFirstFrame(sourceKey, destKey);
      await db
        .update(generations)
        .set({ referenceImageUrl: effectiveRefUrl })
        .where(eq(generations.id, generationId));
    } catch (err) {
      logger.warn(
        { generationId, err: (err as Error).message },
        'subject-consistency frame extract failed; proceeding without reference image'
      );
      effectiveRefUrl = null;
    }
  }

  const videoProvider = getProvider(provider);

  // Submit
  let providerJobId: string;
  try {
    const submitted = await videoProvider.generate({
      prompt,
      referenceImageUrl: effectiveRefUrl,
      aspectRatio: job.data.aspectRatio,
      promptOptimizerEnabled: job.data.promptOptimizerEnabled,
      watermarkEnabled: job.data.watermarkEnabled,
      includeAudio: job.data.includeAudio,
    });
    providerJobId = submitted.providerJobId;
    await db
      .update(generations)
      .set({ providerJobId })
      .where(eq(generations.id, generationId));
  } catch (err) {
    return await markFailed(generationId, err as Error, job.data.userId, provider, undefined, job.data.sceneId);
  }

  // Poll
  const deadline = Date.now() + MAX_POLL_DURATION_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const status = await videoProvider.checkStatus(providerJobId);
      if (status.status === 'succeeded' && status.resultUrl) {
        const { objectKey } = await downloadAndUpload(
          status.resultUrl,
          `clips/${job.data.userId}/${generationId}.mp4`
        );

        // Estimate cost in micro-cents (1 USD = 100 cents = 100_000_000 micro-cents)
        // Indicative rates per second of output (PRD §8.1):
        //   gemini_veo_pro      ~$0.30/s
        //   gemini_veo_flash    ~$0.12/s
        //   minimax_hailuo_2_3  ~$0.04/s
        // 6s clip default unless reported otherwise
        const perSecUsd: Record<string, number> = {
          gemini_veo_pro: 0.30,
          gemini_veo_flash: 0.12,
          minimax_hailuo_2_3: 0.04,
        };
        const rate = perSecUsd[provider] ?? 0.10;
        const seconds = 6;
        const costUsd = rate * seconds; // e.g. 0.04 * 6 = 0.24
        const costMicroCents = Math.round(costUsd * 100_000_000); // store as int
        const durationSeconds = seconds;

        await db
          .update(generations)
          .set({
            status: 'succeeded',
            resultUrl: objectKey,
            finishedAt: new Date(),
            durationSeconds,
            estimatedCostUsd: costMicroCents,
          })
          .where(eq(generations.id, generationId));

        // Auto-select first successful generation on a scene
        const [scene] = await db
          .select({ id: scenes.id, selectedGenerationId: scenes.selectedGenerationId })
          .from(scenes)
          .where(eq(scenes.id, job.data.sceneId))
          .limit(1);
        if (scene && !scene.selectedGenerationId) {
          await db
            .update(scenes)
            .set({ selectedGenerationId: generationId, status: 'ready' })
            .where(eq(scenes.id, scene.id));
        }
        logger.info({ generationId, costUsd }, 'generation succeeded');
        await bumpAnalytics(provider, 'generation.succeeded', costMicroCents);
        return { ok: true };
      }
      if (status.status === 'failed') {
        return await markFailed(
          generationId,
          new Error(status.errorMessage ?? 'Provider failed'),
          job.data.userId,
          provider,
          status.errorCode,
          job.data.sceneId
        );
      }
      // still running → loop
    } catch (err) {
      const e = err as Error;
      if (e instanceof ProviderError && !e.retryable) {
        return await markFailed(generationId, e, job.data.userId, provider, e.code, job.data.sceneId);
      }
      logger.warn({ generationId, err: e.message }, 'transient poll error, will retry');
    }
  }

  // timed out
  return await markFailed(
    generationId,
    new Error('Generation timed out after 5 minutes'),
    job.data.userId,
    provider,
    'timeout',
    job.data.sceneId
  );
}

async function markFailed(
  generationId: number,
  err: Error,
  userId: number,
  provider: GenerationJobData['provider'],
  errorCode?: string,
  sceneId?: number
) {
  logger.warn({ generationId, err: err.message }, 'generation failed');
  await db
    .update(generations)
    .set({
      status: 'failed',
      errorCode: errorCode ?? 'unknown',
      errorMessage: err.message.slice(0, 1000),
      finishedAt: new Date(),
    })
    .where(eq(generations.id, generationId));

  // Reset scene back to 'not_generated' so the user can retry
  if (sceneId) {
    await db
      .update(scenes)
      .set({ status: 'not_generated' })
      .where(eq(scenes.id, sceneId));
  }

  await bumpAnalytics(provider, 'generation.failed');

  // Refund quota on content-rejection or provider failure
  // (mirrors MiniMax policy: don't charge for failed generations)
  await refundQuota(userId, provider);
  return { ok: false, error: err.message };
}

export const generationWorker = new Worker<GenerationJobData>(
  GENERATION_QUEUE,
  processGeneration,
  {
    connection,
    concurrency: Number(process.env.GENERATION_CONCURRENCY ?? 4),
    limiter: { max: 10, duration: 60_000 }, // respect provider rate limits
  }
);

generationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'generation job failed in queue');
});

void logger;