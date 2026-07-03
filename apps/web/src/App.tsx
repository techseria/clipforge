import { Outlet, Link, useRouter } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type UsageEntry } from './api';
import { PROVIDER_LABELS } from '@clipforge/shared';
import { SkipLink } from './a11y';

export function App() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const hideChrome = path === '/login' || path === '/register';

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: { id: number; email: string; displayName: string | null } }>('/api/v1/auth/me'),
    retry: false,
  });

  const usageQuery = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get<{ usage: UsageEntry[] }>('/api/v1/usage'),
    enabled: !hideChrome && !!meQuery.data,
  });

  const lowQuota = usageQuery.data?.usage?.find((u) => u.remaining === 1);

  if (hideChrome) return <Outlet />;

  if (meQuery.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">ClipForge</h1>
          <p className="text-gray-600 mb-6">Sign in to start forging clips.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/login" className="btn-primary">Log in</Link>
            <Link to="/register" className="btn-secondary">Register</Link>
          </div>
        </div>
      </div>
    );
  }

  if (meQuery.isLoading) return <div className="p-8">Loading…</div>;

  return (
    <div className="min-h-screen flex flex-col">
      <SkipLink to="#main" />
      <header className="border-b bg-white" role="banner">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-brand-700">⚡ ClipForge</Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-gray-700 hover:text-brand-700" activeProps={{ className: 'text-brand-700 font-medium' }}>
              Dashboard
            </Link>
            <Link to="/analytics" className="text-gray-700 hover:text-brand-700" activeProps={{ className: 'text-brand-700 font-medium' }}>
              Analytics
            </Link>
            <Link to="/account" className="text-gray-700 hover:text-brand-700" activeProps={{ className: 'text-brand-700 font-medium' }}>
              Account
            </Link>
            <button
              onClick={async () => {
                await api.post('/api/v1/auth/logout');
                router.navigate({ to: '/login' });
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              Log out
            </button>
          </nav>
        </div>
      </header>

      {lowQuota && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-6xl mx-auto px-6 py-2 text-sm text-amber-800 flex items-center justify-between">
            <span>
              ⚠️ Heads up: you have <strong>1 {PROVIDER_LABELS[lowQuota.provider as keyof typeof PROVIDER_LABELS]}</strong> generation left today.
            </span>
            <Link to="/account" className="underline">View quota</Link>
          </div>
        </div>
      )}

      <main id="main" className="flex-1 max-w-6xl w-full mx-auto px-6 py-8" role="main">
        <Outlet />
      </main>

      <footer className="border-t bg-white text-xs text-gray-500" role="contentinfo">
        <div className="max-w-6xl mx-auto px-6 py-4">
          ClipForge — single-tenant · {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}