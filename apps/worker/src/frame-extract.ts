/**
 * Subject-consistency helper — PRD §7.2 (T5.5)
 *
 * Given a generation ID, extract its first frame as a JPEG and upload it to S3
 * so it can be reused as `referenceImageUrl` for subsequent generations to keep
 * a character/product consistent across scenes.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, bucket, getObjectBuffer } from '@clipforge/storage';

export async function extractAndUploadFirstFrame(
  sourceObjectKey: string,
  destObjectKey: string
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipforge-frame-'));
  try {
    const inPath = path.join(tmpDir, 'in.mp4');
    const outPath = path.join(tmpDir, 'frame.jpg');
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: sourceObjectKey }));
    await fs.writeFile(inPath, obj.Body as Buffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'ffmpeg',
        [
          '-y',
          '-ss', '00:00:00.5', // ~half a second in — avoid black opening frames
          '-i', inPath,
          '-frames:v', '1',
          '-q:v', '3',
          outPath,
        ],
        { stdio: ['ignore', 'inherit', 'inherit'] }
      );
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    });

    const buf = await fs.readFile(outPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: destObjectKey,
        Body: buf,
        ContentType: 'image/jpeg',
      })
    );
    return destObjectKey;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}