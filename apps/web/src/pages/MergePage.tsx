import { useEffect, useState } from 'react';
import { useParams, useRouter } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Merge, type Project, type Scene, ApiError, fileUrl } from '../api';

type MusicTrack = {
  id: number;
  title: string;
  artist: string | null;
  durationSeconds: number;
  isBuiltIn: boolean;
};

/**
 * Merge screen — PRD §13
 * - Lists scenes with ready clips, pre-checked, drag to reorder
 * - Live total duration
 * - "Merge selected" enqueues merge job
 * - Polls /merges/:id until succeeded
 */
export function MergePage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(projectId);

  const projectQ = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<{ project: Project; scenes: Scene[] }>(`/api/v1/projects/${id}`),
  });

  const historyQ = useQuery({
    queryKey: ['merge-history', id],
    queryFn: () => api.get<{ merges: Merge[] }>(`/api/v1/projects/${id}/merges`),
  });

  const musicQ = useQuery({
    queryKey: ['music'],
    queryFn: () => api.get<{ tracks: MusicTrack[] }>('/api/v1/music'),
  });

  const readyScenes = (projectQ.data?.scenes ?? []).filter((s) => s.selectedGenerationId);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(readyScenes.map((s) => s.selectedGenerationId!))
  );
  const [orderedScenes, setOrderedScenes] = useState<Scene[]>(readyScenes);
  const [activeMergeId, setActiveMergeId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // V2 merge options
  const [musicTrackId, setMusicTrackId] = useState<number | null>(null);
  const [musicVolumeDb, setMusicVolumeDb] = useState(-12);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);

  useEffect(() => {
    if (projectQ.data) {
      setOrderedScenes(projectQ.data.scenes.filter((s) => s.selectedGenerationId));
    }
  }, [projectQ.data]);

  const mergeQ = useQuery({
    queryKey: ['merge', activeMergeId],
    queryFn: () => api.get<{ merge: Merge }>(`/api/v1/merges/${activeMergeId}`),
    enabled: !!activeMergeId,
    refetchInterval: (q) => {
      const m = q.state.data?.merge;
      if (m && (m.status === 'succeeded' || m.status === 'failed')) return false;
      return 2000;
    },
  });

  const totalDuration = orderedScenes
    .filter((s) => selectedIds.has(s.selectedGenerationId!))
    .reduce((acc) => acc + 8, 0); // PRD: max 8s per clip

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function move(idx: number, dir: -1 | 1) {
    setOrderedScenes((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j]!, next[idx]!];
      return next;
    });
  }

  async function startMerge() {
    setError(null);
    setSubmitting(true);
    try {
      const orderedIds = orderedScenes
        .map((s) => s.selectedGenerationId!)
        .filter((id) => selectedIds.has(id));
      const { mergeId } = await api.post<{ mergeId: number }>(`/api/v1/projects/${id}/merge`, {
        selectedGenerationIds: orderedIds,
        musicTrackId: musicTrackId ?? undefined,
        musicVolumeDb,
        captionsEnabled,
      });
      setActiveMergeId(mergeId);
      qc.invalidateQueries({ queryKey: ['merge-history', id] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Merge failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (projectQ.isLoading) return <p>Loading…</p>;

  const currentMerge = mergeQ.data?.merge;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Merge scenes</h1>
          <p className="text-sm text-gray-600 mt-1">
            Total: <strong>{totalDuration}s</strong> · {selectedIds.size} of {orderedScenes.length} scenes selected
          </p>
        </div>
        <button
          onClick={() => router.navigate({ to: '/projects/$projectId', params: { projectId: String(id) } })}
          className="btn-secondary"
        >
          ← Back to project
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2 mb-6">
        {orderedScenes.map((scene, i) => (
          <div key={scene.id} className="card p-3 flex items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selectedIds.has(scene.selectedGenerationId!)}
              onChange={() => toggle(scene.selectedGenerationId!)}
              aria-label={`Include scene ${i + 1}`}
            />
            <div className="flex-1">
              <strong>Scene {scene.position + 1}</strong>
              <p className="text-xs text-gray-500 line-clamp-1">{scene.prompt}</p>
            </div>
            <div className="flex gap-1">
              <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => move(i, 1)} disabled={i === orderedScenes.length - 1}>↓</button>
            </div>
          </div>
        ))}
      </div>

      <details className="card p-4 mb-4">
        <summary className="font-medium cursor-pointer">V2 options: music, captions, transitions</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <label className="label" htmlFor="music-track">Background music</label>
            <select
              id="music-track"
              className="input"
              value={musicTrackId ?? ''}
              onChange={(e) => setMusicTrackId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {musicQ.data?.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.isBuiltIn ? '⭐ ' : ''}{t.title}
                  {t.artist ? ` — ${t.artist}` : ''} ({t.durationSeconds}s)
                </option>
              ))}
            </select>
            {musicTrackId && (
              <label className="block mt-2">
                <span className="text-xs text-gray-500">Music volume ({musicVolumeDb} dB)</span>
                <input
                  type="range"
                  min={-30}
                  max={0}
                  value={musicVolumeDb}
                  onChange={(e) => setMusicVolumeDb(Number(e.target.value))}
                  className="w-full"
                  aria-label="Music volume in decibels"
                />
              </label>
            )}
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={captionsEnabled}
              onChange={(e) => setCaptionsEnabled(e.target.checked)}
            />
            <span>Burn in auto-captions (requires OPENAI_API_KEY in worker; runs Whisper per clip)</span>
          </label>

          <p className="text-xs text-gray-500">
            Per-scene transitions are configured on each scene (default: hard cut).
            Available: hard cut, fade to black, crossfade 0.5s, crossfade 1s.
          </p>
        </div>
      </details>

      <button
        className="btn-primary"
        disabled={submitting || selectedIds.size === 0}
        onClick={startMerge}
      >
        {submitting ? 'Enqueuing…' : `Merge ${selectedIds.size} scene${selectedIds.size === 1 ? '' : 's'}`}
      </button>

      {currentMerge && (
        <div className="card p-4 mt-6">
          <h3 className="font-semibold mb-2">
            Merge #{currentMerge.id} · <span className={`badge ${currentMerge.status === 'succeeded' ? 'bg-emerald-100 text-emerald-700' : currentMerge.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{currentMerge.status}</span>
          </h3>
          {currentMerge.status === 'succeeded' && currentMerge.resultUrl && (
            <div>
              <video className="w-full rounded mb-3" src={fileUrl(currentMerge.resultUrl)} controls />
              <a href={fileUrl(currentMerge.resultUrl)} download className="btn-primary">
                Download MP4
              </a>
            </div>
          )}
          {currentMerge.status === 'failed' && (
            <p className="text-sm text-red-600">Merge failed. Please retry.</p>
          )}
        </div>
      )}

      {historyQ.data && historyQ.data.merges.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-3">Export history</h2>
          <div className="space-y-2">
            {historyQ.data.merges.map((m) => (
              <div key={m.id} className="card p-3 flex items-center justify-between text-sm">
                <div>
                  <strong>Merge #{m.id}</strong>{' '}
                  <span className="text-gray-500">· {new Date(m.createdAt).toLocaleString()}</span>{' '}
                  <span className="badge bg-gray-100">{m.status}</span>
                </div>
                {m.status === 'succeeded' && m.resultUrl && (
                  <a href={fileUrl(m.resultUrl)} download className="text-brand-700 underline text-sm">
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}