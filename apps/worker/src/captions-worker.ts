/**
 * Captions worker — PRD §7.2 (T5.3)
 * - Downloads the generation's MP4 from S3
 * - Extracts audio (mono, 16kHz WAV) via ffmpeg
 * - Sends to OpenAI Whisper API for transcription
 * - Persists caption_segments (startMs/endMs/text) for downstream merge workers
 */

import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db } from '@clipforge/db';
import { generations, captionSegments } from '@clipforge/db/schema';
import { logger } from './logger';
import { connection } from './queue';
import { GetObjectCommand, s3, bucket, getObjectBuffer } from '@clipforge/storage';

interface CaptionsJobData {
  generationId: number;
  userId: number;
}

async function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

async function transcribeWithWhisper(audioPath: string): Promise<Array<{ start: number; end: number; text: string }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for captions');

  // Node 20+ has native FormData + fetch
  const fd = new FormData();
  const fileBuf = await fs.readFile(audioPath);
  fd.append('file', new Blob([fileBuf]), 'audio.wav');
  fd.append('model', 'whisper-1');
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'segment');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!res.ok) {
    throw new Error(`Whisper API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { segments?: Array<{ start: number; end: number; text: string }> };
  return json.segments ?? [];
}

async function processCaptions(job: Job<CaptionsJobData>) {
  const { generationId, userId } = job.data;
  logger.info({ generationId }, 'starting caption extraction');

  const [gen] = await db
    .select()
    .from(generations)
    .where(eq(generations.id, generationId))
    .limit(1);
  if (!gen?.resultUrl) throw new Error('Generation has no resultUrl');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `clipforge-cap-${generationId}-`));
  try {
    // 1. Fetch MP4 from S3
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: gen.resultUrl }));
    const mp4Path = path.join(tmpDir, 'in.mp4');
    await fs.writeFile(mp4Path, obj.Body as Buffer);

    // 2. Extract mono 16kHz audio
    const wavPath = path.join(tmpDir, 'audio.wav');
    await runFfmpeg([
      '-y',
      '-i', mp4Path,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-f', 'wav',
      wavPath,
    ]);

    // 3. Send to Whisper
    const segments = await transcribeWithWhisper(wavPath);

    // 4. Replace existing caption segments for this generation
    await db.delete(captionSegments).where(eq(captionSegments.generationId, generationId));
    if (segments.length) {
      await db.insert(captionSegments).values(
        segments.map((s) => ({
          generationId,
          startMs: Math.round(s.start * 1000),
          endMs: Math.round(s.end * 1000),
          text: s.text.trim(),
        }))
      );
    }
    logger.info({ generationId, count: segments.length }, 'captions done');
    return { ok: true, count: segments.length };
  } catch (err) {
    logger.error({ generationId, err: (err as Error).message }, 'captions failed');
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export const captionsWorker = new Worker<CaptionsJobData>(
  'captions',
  processCaptions,
  { connection, concurrency: Number(process.env.CAPTIONS_CONCURRENCY ?? 2) }
);

captionsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'captions job failed');
});