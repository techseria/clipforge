/**
 * QuotaService — PRD §12
 * Centralized quota enforcement. Increment + enqueue happen in the same DB
 * transaction so a crash can never enqueue an uncounted job.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@clipforge/db';
import { usageCounters, providerConfig } from '@clipforge/db/schema';
import { DEFAULT_DAILY_LIMITS, type ProviderId } from './index';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface QuotaCheckResult {
  remaining: number;
  limit: number;
}

export async function getQuota(userId: number, provider: ProviderId): Promise<QuotaCheckResult> {
  // Look up admin-configurable limit, fall back to hard-coded default
  const [config] = await db
    .select({ dailyLimit: providerConfig.dailyLimit, isHardCap: providerConfig.isHardCap })
    .from(providerConfig)
    .where(eq(providerConfig.provider, provider))
    .limit(1);
  const limit = config?.dailyLimit ?? DEFAULT_DAILY_LIMITS[provider];

  const [row] = await db
    .select({ countUsed: usageCounters.countUsed })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.provider, provider),
        eq(usageCounters.usageDate, todayUtc())
      )
    )
    .limit(1);

  return { remaining: Math.max(0, limit - (row?.countUsed ?? 0)), limit };
}

/**
 * Increment quota for a user/model/date. Must be called inside the same
 * transaction as the job enqueue, OR before enqueueing if you accept the
 * "best-effort" trade-off.
 */
export async function incrementQuota(
  userId: number,
  provider: ProviderId,
  tx?: typeof db
) {
  const client = tx ?? db;
  const date = todayUtc();

  // Upsert: insert with count=1 or increment existing row
  await client
    .insert(usageCounters)
    .values({
      userId,
      provider,
      usageDate: date,
      countUsed: 1,
      dailyLimit: DEFAULT_DAILY_LIMITS[provider],
    })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.provider, usageCounters.usageDate],
      set: {
        countUsed: sql`${usageCounters.countUsed} + 1`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Refund quota (called when a generation is rejected for content policy
 * or fails transiently — mirrors MiniMax's no-charge-for-failed policy).
 */
export async function refundQuota(
  userId: number,
  provider: ProviderId,
  tx?: typeof db
) {
  const client = tx ?? db;
  await client
    .update(usageCounters)
    .set({
      countUsed: sql`GREATEST(0, ${usageCounters.countUsed} - 1)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.provider, provider),
        eq(usageCounters.usageDate, todayUtc())
      )
    );
}

import { ApiError } from './api-error';

export async function enforceQuota(userId: number, provider: ProviderId) {
  const [config] = await db
    .select({ isHardCap: providerConfig.isHardCap })
    .from(providerConfig)
    .where(eq(providerConfig.provider, provider))
    .limit(1);
  const isHardCap = config?.isHardCap ?? true;

  const { remaining, limit } = await getQuota(userId, provider);
  if (remaining <= 0) {
    if (isHardCap) {
      throw new ApiError(429, 'quota_exceeded', 'Daily quota exceeded', {
        provider,
        limit,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }
}