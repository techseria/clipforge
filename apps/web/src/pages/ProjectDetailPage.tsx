import { useState } from 'react';
import { Link, useParams, useRouter } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Project, type Scene, type Generation, type UsageEntry, ApiError, fileUrl } from '../api';
import { PROVIDER_LABELS } from '@clipforge/shared';
import { StoryboardPlayer } from './StoryboardPlayer';

const STATUS_BADGE: Record<string, string> = {
  not_generated: 'bg-gray-100 text-gray-700',
  queued: 'bg-blue-100 text-blue-700',
  generating: 'bg-amber-100 text-amber-800',
  running: 'bg-amber-100 text-amber-800',
  ready: 'bg-emerald-100 text-emerald-700',
  succeeded: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(projectId);

  const projectQ = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<{ project: Project; scenes: Scene[] }>(`/api/v1/projects/${id}`),
  });

  const usageQ = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get<{ usage: UsageEntry[] }>('/api/v1/usage'),
  });

  if (projectQ.isLoading) return <p>Loading…</p>;
  if (projectQ.isError || !projectQ.data) return <p className="text-red-600">Failed to load project.</p>;

  const { project, scenes } = projectQ.data;
  const usageByProvider = new Map(usageQ.data?.usage?.map((u) => [u.provider, u]) ?? []);

  async function generateScene(sceneId: number, model: Scene['defaultModel']) {
    try {
      await api.post(`/api/v1/scenes/${sceneId}/generations`, { model });
      qc.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Generation failed');
    }
  }

  const hasReady = scenes.some((s) => s.selectedGenerationId);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          {project.globalStylePrompt && (
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">{project.globalStylePrompt}</p>
          )}
        </div>
        <div className="flex gap-2">
          {hasReady && (
            <Link
              to="/projects/$projectId/merge"
              params={{ projectId: String(id) }}
              className="btn-primary"
            >
              Merge selected →
            </Link>
          )}
        </div>
      </div>

      {hasReady && (
        <div className="mb-6">
          <StoryboardPlayer scenes={scenes} />
        </div>
      )}

      <div className="space-y-4">
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            usage={usageByProvider.get(scene.defaultModel)}
            onGenerate={generateScene}
          />
        ))}
        {scenes.length === 0 && (
          <div className="card p-12 text-center text-gray-500">
            No scenes yet. Add scenes to start generating clips.
          </div>
        )}
      </div>
      <div className="mt-6">
        <button
          className="btn-secondary"
          onClick={async () => {
            const last = scenes[scenes.length - 1];
            await api.post(`/api/v1/projects/${id}/scenes`, {
              prompt: '',
              position: 0,
              defaultModel: last?.defaultModel ?? 'gemini_veo_flash',
              aspectRatio: '16:9',
              promptOptimizerEnabled: true,
              watermarkEnabled: true,
            });
            qc.invalidateQueries({ queryKey: ['project', id] });
          }}
        >
          + Add scene
        </button>
        <button
          className="btn-secondary ml-2"
          onClick={async () => {
            if (!confirm('Delete this project? This cannot be undone.')) return;
            await api.delete(`/api/v1/projects/${id}`);
            router.navigate({ to: '/' });
          }}
        >
          Delete project
        </button>
      </div>
    </div>
  );
}

function SceneCard({
  scene,
  usage,
  onGenerate,
}: {
  scene: Scene;
  usage?: UsageEntry;
  onGenerate: (sceneId: number, model: Scene['defaultModel']) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);

  const historyQ = useQuery({
    queryKey: ['scene-history', scene.id],
    queryFn: () => api.get<{ generations: Generation[]; selectedGenerationId: number | null }>(`/api/v1/scenes/${scene.id}/generations`),
    enabled: showHistory,
  });

  const qc = useQueryClient();

  async function markSelected(generationId: number) {
    try {
      await api.patch(`/api/v1/scenes/${scene.id}`, { selectedGenerationId: generationId });
      qc.invalidateQueries({ queryKey: ['project'] });
      qc.invalidateQueries({ queryKey: ['scene-history', scene.id] });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to mark as selected');
    }
  }

  async function uploadReferenceImage(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/v1/uploads/reference-image', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `Upload failed (${res.status})`);
    }
    const { key } = (await res.json()) as { key: string };
    await api.patch(`/api/v1/scenes/${scene.id}`, { referenceImageUrl: key });
    qc.invalidateQueries({ queryKey: ['project'] });
  }

  const quotaExceeded = usage?.remaining === 0;
  const isBusy = scene.status === 'queued' || scene.status === 'generating';

  return (
    <div className="card p-4">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <strong>Scene {scene.position + 1}</strong>
            <span className={`badge ${STATUS_BADGE[scene.status]}`}>{scene.status.replace('_', ' ')}</span>
            <span className="badge bg-gray-100 text-gray-700 text-xs">
              {PROVIDER_LABELS[scene.defaultModel]}
            </span>
            {usage && (
              <span className={`badge text-xs ${quotaExceeded ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                {usage.remaining}/{usage.limit} left today
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700">{scene.prompt}</p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={(scene as any).includeAudio ?? false}
                disabled={scene.defaultModel === 'minimax_hailuo_2_3'}
                onChange={async (e) => {
                  await api.patch(`/api/v1/scenes/${scene.id}`, { includeAudio: e.target.checked });
                  qc.invalidateQueries({ queryKey: ['project'] });
                }}
                aria-label="Include native audio (Veo only)"
              />
              <span className="text-gray-600">Audio</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-gray-600">Transition:</span>
              <select
                value={(scene as any).transitionToNext ?? 'cut'}
                onChange={async (e) => {
                  await api.patch(`/api/v1/scenes/${scene.id}`, { transitionToNext: e.target.value });
                  qc.invalidateQueries({ queryKey: ['project'] });
                }}
                aria-label="Transition to next scene"
                className="border rounded px-1 py-0.5"
              >
                <option value="cut">Hard cut</option>
                <option value="fade_black">Fade to black</option>
                <option value="crossfade_05">Crossfade (0.5s)</option>
                <option value="crossfade_1">Crossfade (1s)</option>
              </select>
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {scene.selectedGenerationId && (
            <video
              className="w-48 rounded border"
              src={fileUrl((historyQ.data?.generations.find(g => g.id === scene.selectedGenerationId) as any)?.resultUrl) ?? `/api/v1/generations/${scene.selectedGenerationId}/stream`}
              controls
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? 'Hide history' : 'History'}
            </button>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={isBusy || quotaExceeded}
              onClick={() => onGenerate(scene.id, scene.defaultModel)}
              title={quotaExceeded ? 'Daily quota exhausted for this model' : undefined}
            >
              {isBusy ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
        </div>
      </div>

      {showHistory && historyQ.data && (
        <div className="mt-4 border-t pt-3">
          <h4 className="text-sm font-medium mb-2">Generation history</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {historyQ.data.generations.map((g) => {
              const isSelected = historyQ.data!.selectedGenerationId === g.id;
              return (
                <div
                  key={g.id}
                  className={`border rounded p-2 text-xs ${isSelected ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge ${STATUS_BADGE[g.status]}`}>{g.status}</span>
                    <span className="text-gray-500">{PROVIDER_LABELS[g.provider as keyof typeof PROVIDER_LABELS]}</span>
                  </div>
                  {g.resultUrl && (
                    <video src={g.resultUrl} className="w-full rounded" controls preload="metadata" />
                  )}
                  {g.errorMessage && <p className="text-red-600">{g.errorMessage}</p>}
                  {g.status === 'succeeded' && !isSelected && (
                    <button
                      type="button"
                      onClick={() => markSelected(g.id)}
                      className="mt-1 w-full text-brand-700 underline"
                      aria-label={`Mark generation ${g.id} as selected for this scene`}
                    >
                      Mark as selected
                    </button>
                  )}
                  {isSelected && (
                    <p className="mt-1 text-brand-700 font-medium">✓ Selected</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reference image upload — T4.2 */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
        <label className="underline cursor-pointer">
          {scene.referenceImageUrl ? 'Replace reference image' : 'Upload reference image'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                await uploadReferenceImage(file);
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Upload failed');
              } finally {
                e.target.value = '';
              }
            }}
          />
        </label>
        {scene.referenceImageUrl && <span>✓ Image attached</span>}
      </div>
    </div>
  );
}