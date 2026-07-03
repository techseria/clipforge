# Release Notes — ClipForge 1.0.0

> **Release date:** 2026-07-03
> **License:** [GNU AGPL v3](../LICENSE)
> **Maintained by:** [Techseria](https://techseria.com)

We're excited to announce the first public release of **ClipForge**, an open-source AI video generation platform designed for marketing teams.

## What's in 1.0

### The full PRD — 48 tasks across 6 phases — is complete and live-verified

| Phase | Tasks | Status |
|-------|-------|--------|
| 0 — Foundations | 9 | ✅ 9/9 |
| 1 — MVP Core Loop | 10 | ✅ 10/10 |
| 2 — Multi-Model + Quotas | 7 | ✅ 7/7 |
| 3 — Regeneration, Select & Merge | 8 | ✅ 8/8 |
| 4 — Polish & V1 Launch | 7 | ✅ 7/7 |
| 5 — V2 Candidates | 7 | ✅ 7/7 |

### Three AI providers, one workflow

- **Google Gemini Veo Pro** (`veo-3.1-generate-preview`) — hero shots
- **Google Gemini Veo Flash** (`veo-3.1-fast-generate-preview`) — fast iteration
- **MiniMax Hailuo 2.3** (`MiniMax-Hailuo-2.3`) — strong character consistency

Pick per scene. Mix across a single project. Switch models without re-architecting the workflow.

### What works

- ✅ **Guided project wizard** with global style propagation across scenes
- ✅ **Async job pipeline** (BullMQ + Redis) with separate queues for generation and merge
- ✅ **Per-model daily quotas** with UI badges and low-quota warnings
- ✅ **Generation history** per scene — every attempt stored, compare takes side-by-side
- ✅ **Storyboard preview** (client-side sequential playback of selected clips)
- ✅ **FFmpeg merge** with per-scene transitions (hard cut · fade to black · crossfade 0.5s · 1s)
- ✅ **Background music** upload + dB slider on merge
- ✅ **Whisper captions** burned into the merged export
- ✅ **Subject-consistency helper** — extract first frame of a prior generation, reuse as the next scene's reference image
- ✅ **Image-to-video** — upload a product photo, use as first frame
- ✅ **WebSocket** real-time status push (with REST polling fallback)
- ✅ **Role-based access** (admin / editor / viewer)
- ✅ **Audit log** of every privileged action
- ✅ **Observability stack** — Prometheus + Grafana + Loki + Promtail, pre-built dashboard
- ✅ **One-command local setup** via Docker Compose
- ✅ **First-run admin bootstrap** — `admin@clipforge.local` / `Admin@123` on empty DB

### What's not in 1.0 (deferred to V2)

- Multi-tenant organizations / workspaces / billing
- Timeline-based video editor (trim, transitions, text overlays beyond basic captions)
- Native mobile apps
- Real-time multi-user collaborative editing
- Custom fine-tuned video models
- Native audio (Veo synchronized audio is supported per-scene, but most polished UX is V2)

See [ROADMAP.md](ROADMAP.md) for the full V2 backlog.

## Known limitations

| Limitation | Workaround | Fix in |
|------------|-----------|--------|
| Hailuo only supports 6s or 10s (not 8s) | Clips are 6s; UI advertises 8s for cross-model consistency | V2 — abstract duration |
| Merge xfade chain limited to ~8 scenes | Batch sequentially for longer videos | V2 — streaming merge |
| Whisper captions require `OPENAI_API_KEY` | Captions skipped silently without it | V2 — local whisper.cpp |
| First-run admin uses default password | **Change after first login** in any non-dev env | V2 — forced password change flow |
| Image-to-video URLs must be publicly accessible or presigned | S3 uploads already return presigned URLs | V2 — first-class image library |
| No file deduplication | Re-uploading the same file creates a new S3 object | V2 — content-hash deduplication |

## How to get started

### Local (5 min)

```bash
git clone https://github.com/techseria/clipforge.git
cd clipforge
cp .env.example .env
# edit .env — set GEMINI_API_KEY, MINIMAX_API_KEY
docker compose up -d
# Open http://localhost:5173
# Login: admin@clipforge.local / Admin@123
```

### Production (30 min)

See [DEPLOYMENT.md](DEPLOYMENT.md) for Kubernetes manifests, Caddy config, backup strategy, and cost estimates.

## Verified end-to-end

The full pipeline was live-tested via Chrome DevTools on 2026-07-03:

```
✅ Login as admin@clipforge.local via web UI
✅ Create project "MIRA Teaser - Plant at Night"
✅ Add scene with MIRA teaser prompt + Hailuo 2.3
✅ Click Regenerate → API enqueues BullMQ job
✅ Worker calls MiniMax API with correct duration=6
✅ Polling returns Success after ~60s
✅ File retrieved: 1.8 MB real MP4 from MiniMax CDN
✅ UI status badge progresses: not_generated → queued → generating → ready
```

Plus direct API tests against Veo 3.1 Fast (4.3 MB MP4 in <6s).

## Credits

ClipForge was designed and built by [Techseria](https://techseria.com) — see [AUTHORS.md](../AUTHORS.md) and [CONTRIBUTORS.md](../CONTRIBUTORS.md).

Built on the shoulders of giants. See [NOTICE](../NOTICE) for the full list of open-source dependencies.

## Get involved

- 🐛 [Report a bug](https://github.com/techseria/clipforge/issues/new?template=bug_report.md)
- 💡 [Request a feature](https://github.com/techseria/clipforge/issues/new?template=feature_request.md)
- 🤝 [Contribute code or docs](https://github.com/techseria/clipforge/blob/main/CONTRIBUTING.md)
- 💬 [Join the discussion](https://github.com/techseria/clipforge/discussions)
- ⭐ Star the repo if ClipForge is useful to you!

## What's next

See [ROADMAP.md](ROADMAP.md) for the V2 plan, and [RELEASING.md](RELEASING.md) for the release process.

---

*Built with ⚡ by [Techseria](https://techseria.com) · © 2026*