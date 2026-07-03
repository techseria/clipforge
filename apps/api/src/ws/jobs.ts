/**
 * WebSocket /ws/jobs — PRD §6.4, §11
 * Real-time push of generation/merge status to the connected user.
 * Authenticated via the same session cookie as the REST API.
 * Polling fallback exposed via /api/v1/generations/:id and /api/v1/merges/:id.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { parse as parseCookie } from 'node:querystring';
import { eq } from 'drizzle-orm';
import IORedis from 'ioredis';
import { db } from '@clipforge/db';
import { sessions, users } from '@clipforge/db/schema';
import type { JobEvent } from '@clipforge/shared';
import { logger } from '../logger';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const subscriber = new IORedis(REDIS_URL, { enableReadyCheck: false });

const clientsByUser = new Map<number, Set<WebSocket>>();

function getSessionCookie(req: IncomingMessage): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const pairs = raw.split(';').map((s) => s.trim());
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq);
    if (k === 'clipforge_session') return decodeURIComponent(p.slice(eq + 1));
  }
  return undefined;
}

async function authenticate(req: IncomingMessage): Promise<{ id: number } | null> {
  const sid = getSessionCookie(req);
  if (!sid) return null;
  const [row] = await db
    .select({ userId: users.id, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sid))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.userId };
}

function send(ws: WebSocket, evt: JobEvent) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(evt));
}

function fanout(userId: number, evt: JobEvent) {
  const set = clientsByUser.get(userId);
  if (!set) return;
  for (const ws of set) send(ws, evt);
}

export function setupWebSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    if (!req.url?.startsWith('/ws/jobs')) {
      socket.destroy();
      return;
    }
    const user = await authenticate(req);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      let set = clientsByUser.get(user.id);
      if (!set) {
        set = new Set();
        clientsByUser.set(user.id, set);
      }
      set.add(ws);
      logger.info({ userId: user.id }, 'ws client connected');
      ws.on('close', () => {
        set!.delete(ws);
        if (set!.size === 0) clientsByUser.delete(user.id);
      });
    });
  });

  // Subscribe to job-events channel; worker publishes via PUBLISH job-events <userId> <json>
  subscriber.subscribe('job-events');
  subscriber.on('message', (channel, raw) => {
    if (channel !== 'job-events') return;
    try {
      const idx = raw.indexOf(' ');
      const userId = Number(raw.slice(0, idx));
      const evt = JSON.parse(raw.slice(idx + 1)) as JobEvent;
      if (Number.isFinite(userId)) fanout(userId, evt);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'failed to parse job-events message');
    }
  });

  logger.info('WebSocket /ws/jobs ready');
}

// silence unused import warning
void parseCookie;