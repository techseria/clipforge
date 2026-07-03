/**
 * Local filesystem storage helpers.
 *
 * Replaces the previous S3/MinIO implementation with a simple on-disk
 * directory layout under a configurable root (default: <cwd>/public/uploads).
 *
 * Layout (relative to CLIPS_DIR):
 *   clips/{userId}/{generationId}.mp4        — generated video clips
 *   derived/{userId}/{generationId}.jpg     — extracted first frames (T5.5)
 *   merges/{userId}/{mergeId}.mp4          — merged videos
 *   uploads/{userId}/{uuid}.{ext}           — reference images
 *   music/{userId}/{uuid}.{ext}            — uploaded music
 *
 * Each stored object has a public URL relative to the API base, e.g.
 *   `/clips/2/5.mp4`
 * served by the API at `GET /api/v1/files/*` (see apps/api/src/index.ts).
 *
 * The previous `resultUrl` values (S3 keys like `clips/2/5.mp4`) match the
 * new paths exactly, so no DB migration is required.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { request } from 'undici';

/** Root directory for all stored files. */
export const CLIPS_DIR = process.env.CLIPS_DIR
  ? path.resolve(process.env.CLIPS_DIR)
  : path.resolve(process.cwd(), 'public', 'uploads');

// Ensure the root exists on module load (deferred so this works under CJS)
ensureDirSync();

function ensureDirSync() {
  try {
    require('node:fs').mkdirSync(CLIPS_DIR, { recursive: true });
  } catch {
    // ignore — will be created on first write
  }
}

/** Returns the absolute path for a relative key, ensuring parent dirs exist. */
async function ensureDir(relKey: string): Promise<string> {
  const abs = path.join(CLIPS_DIR, relKey);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  return abs;
}

/** Public URL prefix served by the API. */
const PUBLIC_PREFIX = '/clips';

/**
 * Download a remote file (typically from a video provider CDN) and store it
 * locally under `key`. Returns the relative key.
 */
export async function downloadAndUpload(remoteUrl: string, key: string) {
  const { statusCode, body } = await request(remoteUrl);
  if (statusCode >= 400) {
    throw new Error(`Provider download failed: ${statusCode}`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return writeBuffer(key, buffer, 'video/mp4');
}

/** Write a Buffer to a relative key, returning the key and size. */
export async function writeBuffer(key: string, body: Buffer, _contentType: string) {
  const abs = await ensureDir(key);
  await fs.writeFile(abs, body);
  const stat = await fs.stat(abs);
  return { objectKey: key, sizeBytes: stat.size };
}

/** Read a stored file as a Buffer. */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const abs = path.join(CLIPS_DIR, key);
  return fs.readFile(abs);
}

/** Delete a stored file. Idempotent. */
export async function deleteObject(key: string): Promise<void> {
  const abs = path.join(CLIPS_DIR, key);
  try {
    await fs.unlink(abs);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') throw err;
  }
}

/** Public URL for a stored object — the web UI can use this directly as a `src=`. */
export function presignedDownloadUrl(key: string, _ttlSeconds = 3600): string {
  return `${PUBLIC_PREFIX}/${key}`;
}

/** Upload helper for in-memory buffers (e.g. reference images, music). */
export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string
): Promise<{ objectKey: string; sizeBytes: number }> {
  return writeBuffer(key, body, contentType);
}

/** Generate a unique key under a user-scoped prefix. */
export function uniqueKey(prefix: string, ext: string): string {
  return `${prefix}/${randomUUID()}.${ext.replace(/^\./, '')}`;
}

/** Resolve an absolute path for a key (read-only — for the API to serve). */
export function absolutePath(key: string): string {
  return path.join(CLIPS_DIR, key);
}

/** Sanity check at module load: confirm CLIPS_DIR is writable. */
function selfTest() {
  try {
    require('node:fs').accessSync(CLIPS_DIR, require('node:fs').constants.W_OK);
  } catch (err) {
    console.warn(`[storage] WARNING: CLIPS_DIR=${CLIPS_DIR} is not writable: ${(err as Error).message}`);
  }
}
selfTest();
