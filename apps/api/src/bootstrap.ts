/**
 * API-side bootstrap (importable). Runs on API startup.
 * Idempotent: only creates the admin user if no users exist.
 */

import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { db } from '@clipforge/db';
import { users, providerConfig } from '@clipforge/db/schema';
import { logger } from './logger';

export async function runBootstrap() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  if (count > 0) {
    logger.info({ userCount: count }, 'bootstrap: users exist, skipping admin creation');
    return;
  }

  const adminEmail = process.env.INITIAL_ADMIN_EMAIL ?? 'admin';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'Admin@123';
  const adminDisplay = process.env.INITIAL_ADMIN_DISPLAY ?? 'Admin';

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const [admin] = await db
    .insert(users)
    .values({
      email: adminEmail,
      passwordHash,
      displayName: adminDisplay,
      isAdmin: true,
      role: 'admin',
    })
    .returning({ id: users.id, email: users.email });

  // Seed provider_config (in case migrations ran but seed didn't)
  const provs = [
    { provider: 'gemini_veo_pro' as const, displayName: 'Gemini Veo Pro', description: 'Highest-fidelity hero shots, final deliverables', costIndicator: '$$$', modelId: 'veo-3.1-generate-preview', dailyLimit: 10, isHardCap: false },
    { provider: 'gemini_veo_flash' as const, displayName: 'Gemini Veo Flash', description: 'Fast, cheaper drafts and iteration', costIndicator: '$', modelId: 'veo-3.1-fast-generate-preview', dailyLimit: 20, isHardCap: false },
    { provider: 'minimax_hailuo_2_3' as const, displayName: 'MiniMax Hailuo 2.3', description: 'Expressive characters, strong prompt adherence, image-to-video', costIndicator: '$$', modelId: 'MiniMax-Hailuo-2.3', dailyLimit: 3, isHardCap: true },
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

  logger.warn(
    { email: admin!.email, password: adminPassword },
    '🚀 FIRST-RUN: initial admin user created. CHANGE THE PASSWORD AFTER FIRST LOGIN!'
  );
}