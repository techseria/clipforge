import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type Project } from '../api';

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<{ projects: Project[] }>('/api/v1/projects'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Your projects</h1>
        <Link to="/new" className="btn-primary">+ New project</Link>
      </div>

      {isLoading && <p>Loading…</p>}
      {error && <p className="text-red-600">Failed to load projects.</p>}

      {data?.projects.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-gray-600 mb-4">No projects yet.</p>
          <Link to="/new" className="btn-primary">Create your first project</Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.projects.map((p) => (
          <Link
            key={p.id}
            to="/projects/$projectId"
            params={{ projectId: String(p.id) }}
            className="card p-4 hover:border-brand-500 transition group"
          >
            <div className="aspect-video rounded-md bg-gradient-to-br from-brand-100 to-brand-50 mb-3 flex items-center justify-center text-brand-700">
              {p.thumbnailClipId ? '▶' : '🎬'}
            </div>
            <h2 className="font-semibold group-hover:text-brand-700">{p.title}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {p.sceneCount ?? 0} scene{p.sceneCount === 1 ? '' : 's'} ·{' '}
              <span className="badge bg-gray-100 text-gray-700">{p.status}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Updated {new Date(p.updatedAt).toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}