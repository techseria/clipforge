import { useQuery } from '@tanstack/react-query';
import { api, type UsageEntry } from '../api';
import { PROVIDER_LABELS, PROVIDER_COST } from '@clipforge/shared';

export function AccountPage() {
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: { id: number; email: string; displayName: string | null } }>('/api/v1/auth/me'),
  });
  const usageQ = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get<{ usage: UsageEntry[] }>('/api/v1/usage'),
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Account</h1>

      {meQ.data && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-3">Profile</h2>
          <dl className="text-sm grid grid-cols-[120px_1fr] gap-y-2">
            <dt className="text-gray-500">Email</dt><dd>{meQ.data.user.email}</dd>
            <dt className="text-gray-500">Display name</dt><dd>{meQ.data.user.displayName ?? '—'}</dd>
          </dl>
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-semibold mb-3">Daily quota usage</h2>
        {usageQ.data && (
          <div className="space-y-3">
            {usageQ.data.usage.map((u) => {
              const pct = u.limit > 0 ? ((u.limit - u.remaining) / u.limit) * 100 : 0;
              return (
                <div key={u.provider}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>
                      <strong>{PROVIDER_LABELS[u.provider as keyof typeof PROVIDER_LABELS]}</strong>{' '}
                      <span className="text-gray-400">({PROVIDER_COST[u.provider as keyof typeof PROVIDER_COST]})</span>
                    </span>
                    <span className="text-gray-600">
                      {u.used} / {u.limit} used today
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                      aria-label={`${Math.round(pct)}% of daily quota used`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}