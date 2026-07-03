/**
 * First-run bootstrap — creates the initial admin user if no users exist.
 * Run via: `pnpm bootstrap` (or auto-invoked on API startup)
 *
 * Idempotent: safe to run on every boot; only acts when users table is empty.
 */

import 'dotenv/config';
import argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { db } from './index';
import { users, providerConfig } from './schema';

const ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? 'admin';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'Admin@123';
const ADMIN_DISPLAY = process.env.INITIAL_ADMIN_DISPLAY ?? 'Admin';

async function main() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  if (count > 0) {
    console.log(`[bootstrap] ${count} user(s) exist — skipping admin creation.`);
    process.exit(0);
  }

  const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const [admin] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      passwordHash,
      displayName: ADMIN_DISPLAY,
      isAdmin: true,
      role: 'admin',
    })
    .returning({ id: users.id, email: users.email });

  // Ensure provider_config is seeded (in case the initial migration hasn't run)
  const provs: Array<typeof providerConfig.$inferInsert> = [
    {
      provider: 'gemini_veo_pro',
      displayName: 'Gemini Veo Pro',
      description: 'Highest-fidelity hero shots, final deliverables',
      costIndicator: '$$$',
      modelId: 'veo-3.1-generate-preview',
      dailyLimit: 10,
      isHardCap: false,
    },
    {
      provider: 'gemini_veo_flash',
      displayName: 'Gemini Veo Flash',
      description: 'Fast, cheaper drafts and iteration',
      costIndicator: '$',
      modelId: 'veo-3.1-fast-generate-preview',
      dailyLimit: 20,
      isHardCap: false,
    },
    {
      provider: 'minimax_hailuo_2_3',
      displayName: 'MiniMax Hailuo 2.3',
      description: 'Expressive characters, strong prompt adherence, image-to-video',
      costIndicator: '$$',
      modelId: 'MiniMax-Hailuo-2.3',
      dailyLimit: 3,
      isHardCap: true,
    },
  ];
  for (const p of provs) {
    await db
      .insert(providerConfig)
      .values(p)
      .onConflictDoUpdate({
        target: providerConfig.provider,
        set: { displayName: p.displayName, modelId: p.modelId, dailyLimit: p.dailyLimit, isHardCap: p.isHardCap, updatedAt: new Date() },
      });
  }

  console.log(`[bootstrap] ✅ Created initial admin user:`);
  console.log(`           email:    ${admin!.email}`);
  console.log(`           password: ${ADMIN_PASSWORD}`);
  console.log(`           (CHANGE THIS AFTER FIRST LOGIN)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[bootstrap] ❌', err);
  process.exit(1);
});