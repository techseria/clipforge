/**
 * StoryboardPlayer — PRD §6.6, T3.4
 * Plays currently-selected scene clips sequentially without running a merge job.
 * Uses a hidden HTML5 <video> per clip and advances on `ended`.
 */

import { useEffect, useRef, useState } from 'react';
import type { Scene } from '../api';
import { fileUrl } from '../api';

export function StoryboardPlayer({ scenes }: { scenes: Scene[] }) {
  const ready = scenes.filter((s) => s.selectedGenerationId);
  const [idx, setIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Restart from beginning when scene list shrinks below current idx
    if (idx >= ready.length) setIdx(0);
  }, [ready.length, idx]);

  if (ready.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-gray-500">
        Generate at least one scene to preview the storyboard.
      </div>
    );
  }

  const current = ready[idx]!;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Storyboard preview</h3>
        <span className="text-xs text-gray-500">
          Scene {idx + 1} / {ready.length}
        </span>
      </div>
      <video
        ref={videoRef}
        key={current.id}
        className="w-full rounded border bg-black"
        controls
        autoPlay
        onEnded={() => setIdx((i) => (i + 1 < ready.length ? i + 1 : i))}
        aria-label={`Storyboard preview, scene ${idx + 1} of ${ready.length}`}
      >
        <source src={fileUrl((current as any).resultUrl) ?? `/api/v1/generations/${current.selectedGenerationId}/stream`} type="video/mp4" />
      </video>
      <div className="mt-3 flex flex-wrap gap-1">
        {ready.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`Jump to scene ${i + 1}`}
            aria-current={i === idx}
            className={`w-2 h-2 rounded-full ${i === idx ? 'bg-brand-600' : 'bg-gray-300'}`}
          />
        ))}
      </div>
    </div>
  );
}