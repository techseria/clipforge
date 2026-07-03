/**
 * ClipForge API — main entry point
 * Source: ClipForge_PRD.md §9, §11, §15
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Load .env from the repo root, regardless of cwd
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidates = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];
for (const p of candidates) {
  const r = dotenv.config({ path: p });
  if (r.parsed) {
    console.log(`[dotenv] loaded ${p}`);
    break;
  }
}
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { createServer } from 'node:http';
import { logger } from './logger';
import { errorHandler } from './middleware/error-handler';
import { requestId } from './middleware/request-id';
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { scenesRouter } from './routes/scenes';
import { generationsRouter } from './routes/generations';
import { mergesRouter } from './routes/merges';
import { usageRouter } from './routes/usage';
import { uploadsRouter } from './routes/uploads';
import { musicRouter } from './routes/music';
import { captionsRouter } from './routes/captions';
import { adminRouter } from './routes/admin';
import { analyticsRouter } from './routes/analytics';
import { setupWebSocket } from './ws/jobs';
import { authRateLimiter } from './middleware/rate-limit';
import { runBootstrap } from './bootstrap';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// ─── Core middleware ────────────────────────────────────────────────────
app.use(requestId());
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ─── Rate limiting on auth endpoints ────────────────────────────────────
app.use('/api/v1/auth/login', authRateLimiter);
app.use('/api/v1/auth/register', authRateLimiter);

// ─── Static file serving for stored clips (PRD: no S3 — local FS) ─────
import { absolutePath as storageAbsPath } from '@clipforge/storage';
import { createReadStream, statSync } from 'node:fs';
import { requireAuth } from './middleware/require-auth';

const MIME_BY_EXT: Record<string, string> = {
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.aac':  'audio/aac',
};
function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

app.get(/^\/api\/v1\/files\/(.+)$/, requireAuth, (req, res) => {
  const key = req.params[0];
  if (!key.startsWith(`clips/${req.user!.id}/`) &&
      !key.startsWith(`uploads/${req.user!.id}/`) &&
      !key.startsWith(`music/${req.user!.id}/`) &&
      !key.startsWith(`derived/${req.user!.id}/`) &&
      !key.startsWith(`merges/${req.user!.id}/`)) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Access denied' } });
  }
  if (key.includes('..') || key.startsWith('/')) {
    return res.status(400).json({ error: { code: 'validation_error', message: 'Invalid path' } });
  }
  const abs = storageAbsPath(key);
  try {
    const stat = statSync(abs);
    res.setHeader('Content-Type', mimeFor(abs));
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(abs).pipe(res);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return res.status(404).json({ error: { code: 'not_found', message: 'File not found' } });
    }
    return res.status(500).json({ error: { code: 'internal_error', message: 'Read failed' } });
  }
});

// ─── Health check ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'clipforge-api', time: new Date().toISOString() });
});

// ─── API routes (v1) ─────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1', scenesRouter);       // /projects/:id/scenes, /scenes/:id, /scenes/reorder
app.use('/api/v1', generationsRouter);  // /scenes/:id/generations, /generations/:id
app.use('/api/v1', mergesRouter);       // /projects/:id/merge, /merges/:id, /projects/:id/merges
app.use('/api/v1/usage', usageRouter);
app.use('/api/v1/uploads', uploadsRouter);
app.use('/api/v1/music', musicRouter);
app.use('/api/v1', captionsRouter);     // /generations/:id/captions
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/analytics', analyticsRouter);

// ─── Error handler (must be last) ────────────────────────────────────────
app.use(errorHandler);

// ─── HTTP + WebSocket server ─────────────────────────────────────────────
const httpServer = createServer(app);
setupWebSocket(httpServer);

httpServer.listen(PORT, async () => {
  logger.info({ port: PORT }, 'ClipForge API listening');
  // First-time bootstrap: seed admin user + provider config if DB is empty
  try {
    await runBootstrap();
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'bootstrap failed (continuing)');
  }
});

export { app, httpServer };