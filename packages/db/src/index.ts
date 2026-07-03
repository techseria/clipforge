/**
 * ClipForge — DB client
 * Exports a configured Drizzle ORM instance for use across the monorepo.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from repo root regardless of cwd (for cross-workspace imports)
const __dirname_db = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(__dirname_db, '../../../.env'), // packages/db/src -> repo root
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];
let loaded = false;
for (const p of candidates) {
  const r = dotenv.config({ path: p });
  if (r.parsed) {
    console.log(`[db] dotenv loaded from ${p}`);
    loaded = true;
    break;
  }
}
if (!loaded) {
  console.warn(`[db] no .env found in any of: ${candidates.join(', ')}`);
  console.warn(`[db] DATABASE_URL = ${process.env.DATABASE_URL ?? 'NOT SET'}`);
}

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ??
  'postgres://clipforge:clipforge_dev@localhost:5432/clipforge';

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { schema };
export type DB = typeof db;