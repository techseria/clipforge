/**
 * Analytics dashboard — PRD §7.2 (T5.7)
 * - Top-line totals (succeeded / failed / success rate / spend)
 * - Today's quota per provider
 * - Timeseries chart (last N days)
 * - Per-provider breakdown
 * - Recent generations
 * - Top regenerated scenes
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { PROVIDER_LABELS, type ProviderId } from '@clipforge/shared';

// ─── Types ────────────────────────────────────────────────────────────────

type Overview = {
  totals: {
    generations: number;
    succeeded: number;
    failed: number;
    successRate: number | null;
    totalSpendUsd: number;
    avgCostUsd: number;
  };
  today: {
    date: string;
    quota: Array<{
      provider: string;
      label: string;
      used: number;
      limit: number;
      remaining: number;
      isHardCap: boolean;
    }>;
  };
};

type TimeseriesPoint = { date: string; total: number; spendUsd: number };

type ByProvider = {
  byProvider: Array<{
    provider: string;
    label: string;
    total: number;
    succeeded: number;
    failed: number;
    successRate: number | null;
    avgDurationSec: number;
    totalSpendUsd: number;
  }>;
};

type MostRegenerated = {
  scenes: Array<{
    sceneId: number;
    projectId: number;
    projectTitle: string;
    prompt: string;
    attemptCount: number;
    succeeded: number;
  }>;
};

type Recent = {
  recent: Array<{
    id: number;
    sceneId: number;
    projectId: number;
    projectTitle: string;
    provider: string;
    providerLabel: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
    errorCode: string | null;
    errorMessage: string | null;
    durationSeconds: number | null;
    costUsd: number | null;
    createdAt: string;
    finishedAt: string | null;
  }>;
};

// ─── Reusable components ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    default: 'text-gray-900',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  }[tone];
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function QuotaBar({
  label,
  used,
  limit,
  isHardCap,
}: {
  label: string;
  used: number;
  limit: number;
  isHardCap: boolean;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const barColor = isHardCap && used >= limit
    ? 'bg-red-500'
    : used >= limit * 0.8
    ? 'bg-amber-500'
    : 'bg-emerald-500';
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-xs text-gray-500">
          {used} / {limit}
          {isHardCap && <span className="ml-1 text-amber-600" title="Hard cap">🔒</span>}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-gray-500">
        {Math.max(0, limit - used)} remaining today
      </div>
    </div>
  );
}

function SimpleBarChart({
  data,
  height = 120,
}: {
  data: Array<{ label: string; value: number; tone?: 'success' | 'danger' | 'info' }>;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 24);
        const color = d.tone === 'success' ? 'bg-emerald-500' : d.tone === 'danger' ? 'bg-red-500' : 'bg-brand-500';
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.label}: ${d.value}`}>
            <div className="text-xs font-medium text-gray-700">{d.value}</div>
            <div className={`w-full ${color} rounded-t`} style={{ height: `${h}px` }} />
            <div className="text-[10px] text-gray-500 text-center truncate w-full">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function SimpleLineChart({
  data,
  height = 180,
  metric = 'total',
}: {
  data: TimeseriesPoint[];
  height?: number;
  metric?: 'total' | 'spendUsd';
}) {
  const max = Math.max(1, ...data.map((d) => d[metric]));
  const width = 600; // viewBox width
  const padding = { top: 16, right: 8, bottom: 24, left: 32 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return <p className="text-sm text-gray-500 italic">No data in the selected range.</p>;
  }

  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + h - (d[metric] / max) * h;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const fillD = `${pathD} L ${padding.left + (data.length - 1) * stepX},${padding.top + h} L ${padding.left},${padding.top + h} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
        {/* y-axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = padding.top + h * p;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="2 2"
              />
              <text x={4} y={y + 3} fontSize="10" fill="#6b7280">
                {Math.round(max * (1 - p))}
              </text>
            </g>
          );
        })}
        {/* area */}
        <path d={fillD} fill="#8b5cf6" opacity="0.15" />
        {/* line */}
        <path d={pathD} fill="none" stroke="#7c3aed" strokeWidth="2" />
        {/* points */}
        {data.map((d, i) => {
          const x = padding.left + i * stepX;
          const y = padding.top + h - (d[metric] / max) * h;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="3" fill="#7c3aed" />
              <title>{`${d.date}: ${d[metric]}`}</title>
            </g>
          );
        })}
        {/* x-axis labels (every Nth) */}
        {data.map((d, i) => {
          if (data.length > 7 && i % Math.ceil(data.length / 7) !== 0) return null;
          const x = padding.left + i * stepX;
          return (
            <text
              key={i}
              x={x}
              y={height - 6}
              fontSize="9"
              fill="#6b7280"
              textAnchor="middle"
            >
              {d.date.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    queued: 'bg-blue-100 text-blue-700',
    running: 'bg-amber-100 text-amber-800',
    canceled: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`badge ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

// ─── Main page ──────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const overviewQ = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => api.get<Overview>('/api/v1/analytics/overview'),
  });
  const timeseriesQ = useQuery({
    queryKey: ['analytics-timeseries', days],
    queryFn: () => api.get<{ days: number; timeseries: TimeseriesPoint[] }>(`/api/v1/analytics/timeseries?days=${days}`),
  });
  const byProviderQ = useQuery({
    queryKey: ['analytics-by-provider'],
    queryFn: () => api.get<ByProvider>('/api/v1/analytics/by-provider'),
  });
  const mostQ = useQuery({
    queryKey: ['analytics-most-regen'],
    queryFn: () => api.get<MostRegenerated>('/api/v1/analytics/most-regenerated'),
  });
  const recentQ = useQuery({
    queryKey: ['analytics-recent'],
    queryFn: () => api.get<Recent>('/api/v1/analytics/recent'),
  });

  const loading = overviewQ.isLoading || timeseriesQ.isLoading;
  const error = overviewQ.error || timeseriesQ.error;

  const totals = overviewQ.data?.totals;
  const today = overviewQ.data?.today;
  const timeseries = timeseriesQ.data?.timeseries ?? [];
  const byProvider = byProviderQ.data?.byProvider ?? [];
  const most = mostQ.data?.scenes ?? [];
  const recent = recentQ.data?.recent ?? [];

  const totalUsdByProvider = useMemo(
    () => byProvider.map((p) => ({ label: p.label, value: p.totalSpendUsd, tone: 'info' as const })),
    [byProvider]
  );

  if (loading) {
    return (
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="card p-12 text-center text-gray-500">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="card p-6 border-red-200 bg-red-50 text-red-700">
          Failed to load analytics data. Make sure the API and worker are running.
        </div>
      </div>
    );
  }

  const successRate = totals?.successRate;
  const successTone =
    successRate == null
      ? 'default'
      : successRate >= 0.8
      ? 'success'
      : successRate >= 0.5
      ? 'warning'
      : 'danger';

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <label className="text-sm text-gray-600 flex items-center gap-2">
          Range
          <select
            className="input w-auto"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Time range"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      {/* ─── Top-line KPIs ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard
          label="Total generations"
          value={totals?.generations ?? 0}
          sub={`${(totals?.generations ?? 0) === 0 ? 'No data yet' : 'All time'}`}
        />
        <StatCard
          label="Succeeded"
          value={totals?.succeeded ?? 0}
          tone="success"
        />
        <StatCard
          label="Failed"
          value={totals?.failed ?? 0}
          tone={totals && totals.failed > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Success rate"
          value={successRate == null ? '—' : `${Math.round(successRate * 100)}%`}
          tone={successTone}
        />
        <StatCard
          label="Total spend"
          value={`$${(totals?.totalSpendUsd ?? 0).toFixed(2)}`}
          sub={totals && totals.generations > 0 ? `$${(totals.avgCostUsd ?? 0).toFixed(2)} avg / gen` : '—'}
        />
      </div>

      {/* ─── Today's quota ────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Today's quota</h2>
        {today && today.quota.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {today.quota.map((q) => (
              <QuotaBar
                key={q.provider}
                label={q.label}
                used={q.used}
                limit={q.limit}
                isHardCap={q.isHardCap}
              />
            ))}
          </div>
        ) : (
          <div className="card p-6 text-sm text-gray-500">No quota data available.</div>
        )}
      </div>

      {/* ─── Charts ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-3">Generations per day (last {days} days)</h2>
          <SimpleLineChart data={timeseries} metric="total" />
        </div>
        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-3">Spend per day (last {days} days)</h2>
          <SimpleLineChart data={timeseries} metric="spendUsd" />
        </div>
      </div>

      {/* ─── Per-provider breakdown ─────────────────────────────────── */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">By provider</h2>
        {byProvider.length === 0 ? (
          <p className="text-sm text-gray-500">No provider data yet — generate a clip to see stats here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-3 text-right">Succeeded</th>
                  <th className="py-2 px-3 text-right">Failed</th>
                  <th className="py-2 px-3 text-right">Success</th>
                  <th className="py-2 px-3 text-right">Avg duration</th>
                  <th className="py-2 pl-3 text-right">Total spend</th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((p) => (
                  <tr key={p.provider} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{p.label}</td>
                    <td className="py-2 px-3 text-right">{p.total}</td>
                    <td className="py-2 px-3 text-right text-emerald-700">{p.succeeded}</td>
                    <td className="py-2 px-3 text-right text-red-700">{p.failed}</td>
                    <td className="py-2 px-3 text-right">
                      {p.successRate == null ? '—' : `${Math.round(p.successRate * 100)}%`}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {p.avgDurationSec ? `${p.avgDurationSec.toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-2 pl-3 text-right font-medium">${p.totalSpendUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalUsdByProvider.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
              Spend distribution
            </h3>
            <SimpleBarChart data={totalUsdByProvider} height={100} />
          </div>
        )}
      </div>

      {/* ─── Recent activity ────────────────────────────────────────── */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">No generations yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="font-medium">{r.providerLabel}</span>
                    <span className="text-gray-500">in {r.projectTitle}</span>
                  </div>
                  {r.errorMessage && (
                    <p className="text-xs text-red-600 mt-1 line-clamp-1" title={r.errorMessage}>
                      {r.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                  {r.costUsd != null && <span>${r.costUsd.toFixed(2)}</span>}
                  {r.durationSeconds != null && <span>{r.durationSeconds}s</span>}
                  <span>{timeAgo(r.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Top regenerated scenes ─────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Top regenerated scenes</h2>
        {most.length === 0 ? (
          <p className="text-sm text-gray-500">No regenerations yet — quality signal needs at least 1 attempt.</p>
        ) : (
          <ol className="space-y-3 list-decimal pl-5">
            {most.map((s) => (
              <li key={s.sceneId} className="text-sm">
                <p className="line-clamp-1">{s.prompt}</p>
                <p className="text-xs text-gray-500">
                  {s.projectTitle} · {s.attemptCount} attempts · {s.succeeded} succeeded
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
