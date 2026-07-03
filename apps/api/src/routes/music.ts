/**
 * Music library routes — PRD §7.2 (T5.2)
 * - GET    /api/v1/music                       — list built-in + user's tracks
 * - POST   /api/v1/music/upload                — upload custom track
 * - DELETE /api/v1/music/:id                   — remove user-uploaded track
 */

import { Router } from 'express';
import { and, desc, eq, or } from 'drizzle-orm';
import multer from 'multer';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@clipforge/db';
import { musicTracks, auditLog } from '@clipforge/db/schema';
import { requireAuth } from '../middleware/require-auth';
import { ApiError } from '../middleware/error-handler';
import { API_ERROR_CODES } from '@clipforge/shared';
import { s3, bucket, uploadBuffer, deleteObject } from '@clipforge/storage';

export const musicRouter = Router();
musicRouter.use(requireAuth);

const ALLOWED_MIME = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac']);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('UNSUPPORTED_MEDIA_TYPE'));
    cb(null, true);
  },
});

musicRouter.get('/', async (req, res, next) => {
  try {
    const tracks = await db
      .select()
      .from(musicTracks)
      .where(or(eq(musicTracks.userId, req.user!.id), eq(musicTracks.isBuiltIn, true)))
      .orderBy(desc(musicTracks.isBuiltIn), desc(musicTracks.createdAt))
      .limit(100);
    res.json({ tracks });
  } catch (err) {
    next(err);
  }
});

musicRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, API_ERROR_CODES.VALIDATION_ERROR, 'No file uploaded');
    const ext = req.file.mimetype.includes('wav') ? 'wav' : 'mp3';
    const key = `music/${req.user!.id}/${randomUUID()}.${ext}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );
    const title = (req.body?.title as string | undefined) ?? req.file.originalname;
    const [track] = await db
      .insert(musicTracks)
      .values({
        userId: req.user!.id,
        title,
        objectKey: key,
        durationSeconds: Number(req.body?.duration ?? 0),
        isBuiltIn: false,
      })
      .returning();
    await db.insert(auditLog).values({
      userId: req.user!.id,
      action: 'music.upload',
      entityType: 'music_track',
      entityId: track!.id,
      metadata: { key, size: req.file.size, mime: req.file.mimetype },
      ipAddress: req.ip ?? null,
    });
    res.status(201).json({ track });
  } catch (err) {
    const e = err as Error;
    if (e.message === 'UNSUPPORTED_MEDIA_TYPE') {
      return next(
        new ApiError(415, API_ERROR_CODES.VALIDATION_ERROR, 'Unsupported file type. Allowed: mp3, wav, aac.')
      );
    }
    next(err);
  }
});

musicRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [track] = await db
      .select()
      .from(musicTracks)
      .where(and(eq(musicTracks.id, id), eq(musicTracks.userId, req.user!.id)))
      .limit(1);
    if (!track) throw new ApiError(404, API_ERROR_CODES.NOT_FOUND, 'Track not found');
    if (track.isBuiltIn) throw new ApiError(403, API_ERROR_CODES.FORBIDDEN, 'Cannot delete built-in track');

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: track.objectKey }));
    await db.delete(musicTracks).where(eq(musicTracks.id, id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});