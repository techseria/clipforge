/**
 * Image upload endpoint — PRD §7.1, T4.2
 * POST /api/v1/uploads/reference-image
 *   - Accepts a multipart/form-data upload
 *   - Validates type (jpg/png/webp) and size (≤ 10MB)
 *   - Writes to S3 under uploads/{userId}/{uuid}.{ext}
 *   - Returns the public object key (caller stores on scene.reference_image_url)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '../middleware/require-auth';
import { ApiError } from '../middleware/error-handler';
import { API_ERROR_CODES } from '@clipforge/shared';
import { s3, bucket, uploadBuffer } from '@clipforge/storage';
import { db } from '@clipforge/db';
import { auditLog } from '@clipforge/db/schema';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_MEDIA_TYPE'));
    }
    cb(null, true);
  },
});

uploadsRouter.post(
  '/reference-image',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ApiError(400, API_ERROR_CODES.VALIDATION_ERROR, 'No file uploaded');
      }
      const ext = req.file.mimetype.split('/')[1] ?? 'bin';
      const key = `uploads/${req.user!.id}/${randomUUID()}.${ext}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );
      await db.insert(auditLog).values({
        userId: req.user!.id,
        action: 'upload.reference_image',
        entityType: 'object',
        metadata: { key, size: req.file.size, mime: req.file.mimetype },
        ipAddress: req.ip ?? null,
      });
      res.status(201).json({ key, url: `/api/v1/uploads/${encodeURIComponent(key)}` });
    } catch (err) {
      const e = err as Error;
      if (e.message === 'UNSUPPORTED_MEDIA_TYPE') {
        return next(
          new ApiError(
            415,
            API_ERROR_CODES.VALIDATION_ERROR,
            'Unsupported file type. Allowed: jpg, png, webp.'
          )
        );
      }
      next(err);
    }
  }
);