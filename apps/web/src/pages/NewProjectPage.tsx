import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { api, ApiError, type Project, type Scene } from '../api';
import { PROVIDER_LABELS, PROVIDER_COST } from '@clipforge/shared';

type DraftScene = { prompt: string; defaultModel: keyof typeof PROVIDER_LABELS };

export function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [scenes, setScenes] = useState<DraftScene[]>([{ prompt: '', defaultModel: 'gemini_veo_flash' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateScene(i: number, patch: Partial<DraftScene>) {
    setScenes((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addScene() {
    setScenes((prev) => [...prev, { prompt: '', defaultModel: 'gemini_veo_flash' }]);
  }

  function removeScene(i: number) {
    setScenes((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveScene(i: number, dir: -1 | 1) {
    setScenes((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const { project } = await api.post<{ project: Project }>('/api/v1/projects', {
        title,
        globalStylePrompt: stylePrompt,
      });
      for (const s of scenes) {
        await api.post<{ scene: Scene }>(`/api/v1/projects/${project.id}/scenes`, {
          prompt: s.prompt,
          position: 0,
          defaultModel: s.defaultModel,
          aspectRatio: '16:9',
          promptOptimizerEnabled: true,
          watermarkEnabled: true,
        });
      }
      router.navigate({ to: '/projects/$projectId', params: { projectId: String(project.id) } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">New project</h1>
      <p className="text-gray-600 mb-6">
        Step {step} of 2: {step === 1 ? 'Style' : 'Scenes'}
      </p>

      {error && (
        <div role="alert" className="mb-4 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="card p-6 space-y-4">
          <div>
            <label className="label" htmlFor="title">Project title</label>
            <input
              id="title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q3 product launch teaser"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="style">
              Global style
              <span className="text-xs text-gray-500 ml-1">
                (prepended to every scene prompt — keep tone consistent)
              </span>
            </label>
            <textarea
              id="style"
              className="input min-h-[100px]"
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              placeholder="Bright, energetic product ad. Handheld camera. Warm color grade. 35mm lens."
            />
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary"
              disabled={!title.trim()}
              onClick={() => setStep(2)}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Describe subject, action, camera movement, and mood for each scene.
          </p>
          {scenes.map((s, i) => (
            <div key={i} className="border rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between">
                <strong>Scene {i + 1}</strong>
                <div className="flex gap-1">
                  <button type="button" className="text-xs text-gray-500 hover:text-gray-700" onClick={() => moveScene(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className="text-xs text-gray-500 hover:text-gray-700" onClick={() => moveScene(i, 1)} disabled={i === scenes.length - 1}>↓</button>
                  <button type="button" className="text-xs text-red-500 hover:text-red-700" onClick={() => removeScene(i)} disabled={scenes.length === 1}>Remove</button>
                </div>
              </div>
              <textarea
                className="input min-h-[80px]"
                placeholder="A coffee cup steaming on a wooden desk, morning light through blinds, slow dolly in."
                value={s.prompt}
                onChange={(e) => updateScene(i, { prompt: e.target.value })}
              />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Model:</span>
                <select
                  className="input flex-1"
                  value={s.defaultModel}
                  onChange={(e) => updateScene(i, { defaultModel: e.target.value as DraftScene['defaultModel'] })}
                >
                  {(Object.keys(PROVIDER_LABELS) as Array<keyof typeof PROVIDER_LABELS>).map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p]} — {PROVIDER_COST[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={addScene}>
            + Add scene
          </button>
          <div className="flex justify-between pt-2">
            <button className="btn-secondary" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button
              className="btn-primary"
              onClick={submit}
              disabled={submitting || scenes.some((s) => !s.prompt.trim())}
            >
              {submitting ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}