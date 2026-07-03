/**
 * Analytics routes — PRD §7.2 (T5.7)
 * - GET /api/v1/analytics/overview          — high-level dashboard data
 * - GET /api/v1/analytics/summary?days=30   — daily counts per provider + outcome
 * - GET /api/v1/analytics/most-regenerated  — scenes with the most attempts (quality signal)
 * - GET /api/v1/analytics/spend-estimate     — rough spend by provider
 * - GET /api/v1/analytics/by-provider        — per-provider success/fail/spend
 * - GET /api/v1/analytics/recent             — latest generations with status
 * - GET /api/v1/analytics/timeseries?days=30  — daily totals (succeeded/failed/spend)
 */

import { Router } from 'express';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@clipforge/db';
import { analyticsDaily, generations, scenes, projects, usageCounters, providerConfig } from '@clipforge/db/schema';
import { requireAuth } from '../middleware/require-auth';
import { listProviders } from '@clipforge/providers';
import { DEFAULT_DAILY_LIMITS, PROVIDER_LABELS, type ProviderId } from '@clipforge/shared';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

const daysQuery = z.coerce.number().int().min(1).max(365).default(30);

/** Indicative per-second USD rates (PRD §8.1) — used to backfill any generation missing cost. */
const PER_SEC_USD: Record<string, number> = {
  gemini_veo_pro: 0.30,
  gemini_veo_flash: 0.12,
  minimax_hailuo_2_3: 0.04,
};
function estimateCostUsd(provider: string, seconds: number): number {
  const rate = PER_SEC_USD[provider] ?? 0.10;
  return rate * seconds;
}

// ─── /overview ──────────────────────────────────────────────────────────────
// High-level dashboard data: totals, success rate, today's quota, top providers.
analyticsRouter.get('/overview', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    // All-time totals from generations
    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where status = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where status = 'failed')::int`,
        totalSpendMicros: sql<number>`coalesce(sum(estimated_cost_usd), 0)::bigint::int`,
      })
      .from(generations)
      .where(eq(generations.userId, userId));

    // Today's quota per provider
    const today = new Date().toISOString().slice(0, 10);
    const counts = await db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.usageDate, today)));

    const configRows = await db.select().from(providerConfig);
    const limitFor = (p: string) => {
      const cfg = configRows.find((c) => c.provider === p);
      return cfg?.dailyLimit ?? DEFAULT_DAILY_LIMITS[p as ProviderId] ?? 0;
    };
    const hardCapFor = (p: string) => {
      const cfg = configRows.find((c) => c.provider === p);
      return cfg?.isHardCap ?? true;
    };

    const quota = listProviders().map((p) => {
      const used = counts.find((c) => c.provider === p)?.countUsed ?? 0;
      const limit = limitFor(p);
      return {
        provider: p,
        label: PROVIDER_LABELS[p],
        used,
        limit,
        remaining: Math.max(0, limit - used),
        isHardCap: hardCapFor(p),
      };
    });

    const total = Number(totals?.total ?? 0);
    const succeeded = Number(totals?.succeeded ?? 0);
    const failed = Number(totals?.failed ?? 0);
    const totalSpendUsd = Number(totals?.totalSpendMicros ?? 0) / 100_000_000;

    res.json({
      totals: {
        generations: total,
        succeeded,
        failed,
        successRate: total > 0 ? succeeded / total : null,
        totalSpendUsd: Math.round(totalSpendUsd * 100) / 100,
        avgCostUsd: total > 0 ? Math.round((totalSpendUsd / total) * 100) / 100 : 0,
      },
      today: {
        date: today,
        quota,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── /summary (existing — daily counts) ────────────────────────────────────
analyticsRouter.get('/summary', async (req, res, next) => {
  try {
    const days = daysQuery.parse(req.query.days);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const rows = await db
      .select({
        metricDate: analyticsDaily.metricDate,
        provider: analyticsDaily.provider,
        eventType: analyticsDaily.eventType,
        count: analyticsDaily.count,
        spendMicros: analyticsDaily.spendMicros,
      })
      .from(analyticsDaily)
      .where(gte(analyticsDaily.metricDate, since))
      .orderBy(desc(analyticsDaily.metricDate));

    const byDateProvider: Record<
      string,
      Record<string, { succeeded: number; failed: number; spend: number }>
    > = {};
    for (const r of rows) {
      const date = r.metricDate;
      const prov = r.provider ?? 'unknown';
      if (!byDateProvider[date]) byDateProvider[date] = {};
      if (!byDateProvider[date]![prov]) byDateProvider[date]![prov] = { succeeded: 0, failed: 0, spend: 0 };
      const slot = byDateProvider[date]![prov]!;
      if (r.eventType === 'generation.succeeded') slot.succeeded += r.count;
      if (r.eventType === 'generation.failed') slot.failed += r.count;
      if (r.eventType === 'merge.succeeded') slot.succeeded += r.count;
      slot.spend += r.spendMicros / 1_000_000;
    }

    res.json({ days, byDateProvider });
  } catch (err) {
    next(err);
  }
});

// ─── /timeseries (new — daily totals as a flat array) ─────────────────────
analyticsRouter.get('/timeseries', async (req, res, next) => {
  try {
    const days = daysQuery.parse(req.query.days);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const rows = await db
      .select({
        metricDate: analyticsDaily.metricDate,
        count: analyticsDaily.count,
        spendMicros: analyticsDaily.spendMicros,
      })
      .from(analyticsDaily)
      .where(gte(analyticsDaily.metricDate, since))
      .orderBy(analyticsDaily.metricDate);

    // Sum all events per day (succeeded + failed + merge)
    const perDay: Record<string, { total: number; spendUsd: number }> = {};
    for (const r of rows) {
      if (!perDay[r.metricDate]) perDay[r.metricDate] = { total: 0, spendUsd: 0 };
      perDay[r.metricDate]!.total += r.count;
      perDay[r.metricDate]!.spendUsd += r.spendMicros / 1_000_000;
    }

    // Fill in zero-days so the chart has continuous x-axis
    const result: Array<{ date: string; total: number; spendUsd: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      const r = perDay[d] ?? { total: 0, spendUsd: 0 };
      result.push({ date: d, total: r.total, spendUsd: Math.round(r.spendUsd * 100) / 100 });
    }
    res.json({ days, timeseries: result });
  } catch (err) {
    next(err);
  }
});

// ─── /by-provider (new — per-provider stats) ───────────────────────────────
analyticsRouter.get('/by-provider', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const rows = await db
      .select({
        provider: generations.provider,
        total: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where ${generations.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${generations.status} = 'failed')::int`,
        avgDurationSec: sql<number>`coalesce(avg(${generations.durationSeconds}), 0)::float`,
        totalSpendMicros: sql<number>`coalesce(sum(${generations.estimatedCostUsd}), 0)::bigint::int`,
      })
      .from(generations)
      .where(eq(generations.userId, userId))
      .groupBy(generations.provider);

    const byProvider = rows.map((r) => {
      const usd = Number(r.totalSpendMicros) / 100_000_000;
      const successRate = r.total > 0 ? r.succeeded / r.total : null;
      return {
        provider: r.provider,
        label: PROVIDER_LABELS[r.provider as ProviderId] ?? r.provider,
        total: Number(r.total),
        succeeded: Number(r.succeeded),
        failed: Number(r.failed),
        successRate,
        avgDurationSec: Math.round(Number(r.avgDurationSec) * 10) / 10,
        totalSpendUsd: Math.round(usd * 100) / 100,
      };
    });
    res.json({ byProvider });
  } catch (err) {
    next(err);
  }
});

// ─── /most-regenerated (existing) ─────────────────────────────────────────
analyticsRouter.get('/most-regenerated', async (req, res, next) => {
  try {
    const rows = await db
      .select({
        sceneId: generations.sceneId,
        projectId: projects.id,
        projectTitle: projects.title,
        prompt: scenes.prompt,
        attemptCount: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where ${generations.status} = 'succeeded')::int`,
      })
      .from(generations)
      .innerJoin(scenes, eq(generations.sceneId, scenes.id))
      .innerJoin(projects, eq(scenes.projectId, projects.id))
      .where(eq(projects.userId, req.user!.id))
      .groupBy(generations.sceneId, projects.id, projects.title, scenes.prompt)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    res.json({ scenes: rows });
  } catch (err) {
    next(err);
  }
});

// ─── /spend-estimate (existing — fixed to use spend_usd correctly) ──────────
analyticsRouter.get('/spend-estimate', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const rows = await db
      .select({
        provider: generations.provider,
        totalUsdMicros: sql<number>`coalesce(sum(${generations.estimatedCostUsd}), 0)::bigint::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(generations)
      .where(eq(generations.userId, userId))
      .groupBy(generations.provider);

    const byProvider = rows.map((r) => {
      const usd = Number(r.totalUsdMicros) / 100_000_000;
      return {
        provider: r.provider,
        label: PROVIDER_LABELS[r.provider as ProviderId] ?? r.provider,
        totalUsd: Math.round(usd * 100) / 100,
        count: Number(r.count),
      };
    });

    // Compute total + estimate based on seconds for any generation that has 0 cost
    // (e.g. older rows from before the cost-tracking fix)
    const [missing] = await db
      .select({
        provider: generations.provider,
        durationSeconds: generations.durationSeconds,
        count: sql<number>`count(*)::int`,
      })
      .from(generations)
      .where(and(eq(generations.userId, userId), sql`(${generations.estimatedCostUsd} is null or ${generations.estimatedCostUsd} = 0)`));
    void missing;

    const totalUsd = byProvider.reduce((acc, p) => acc + p.totalUsd, 0);
    res.json({ byProvider, totalUsd: Math.round(totalUsd * 100) / 100 });
  } catch (err) {
    next(err);
  }
});

// ─── /recent (new — latest generations) ─────────────────────────────────────
analyticsRouter.get('/recent', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const rows = await db
      .select({
        id: generations.id,
        sceneId: generations.sceneId,
        projectId: scenes.projectId,
        projectTitle: projects.title,
        provider: generations.provider,
        status: generations.status,
        errorCode: generations.errorCode,
        errorMessage: generations.errorMessage,
        durationSeconds: generations.durationSeconds,
        createdAt: generations.createdAt,
        finishedAt: generations.finishedAt,
        costMicros: generations.estimatedCostUsd,
      })
      .from(generations)
      .innerJoin(scenes, eq(generations.sceneId, scenes.id))
      .innerJoin(projects, eq(scenes.projectId, projects.id))
      .where(eq(projects.userId, userId))
      .orderBy(desc(generations.createdAt))
      .limit(20);

    res.json({
      recent: rows.map((r) => ({
        id: r.id,
        sceneId: r.sceneId,
        projectId: r.projectId,
        projectTitle: r.projectTitle,
        provider: r.provider,
        providerLabel: PROVIDER_LABELS[r.provider as ProviderId] ?? r.provider,
        status: r.status,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage?.slice(0, 140),
        durationSeconds: r.durationSeconds,
        costUsd: r.costMicros != null ? Math.round((r.costMicros / 100_000_000) * 100) / 100 : null,
        createdAt: r.createdAt,
        finishedAt: r.finishedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});
