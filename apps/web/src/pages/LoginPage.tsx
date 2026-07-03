import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { api, ApiError } from '../api';

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/v1/auth/login', { email, password });
      router.navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="card p-8 max-w-sm w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Log in to ClipForge</h1>
        {error && (
          <div role="alert" className="mb-4 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          className="input mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="input mb-6"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Log in'}
        </button>
        <p className="mt-4 text-sm text-center text-gray-600">
          No account? <Link to="/register" className="text-brand-700 underline">Register</Link>
        </p>
      </form>
    </div>
  );
}