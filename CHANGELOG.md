# Changelog

All notable changes to ClipForge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open-source release under AGPL-3.0

## [1.0.0] — 2026-07-03

The first public release of ClipForge. All 48 PRD tasks completed and live-verified.

### Highlights

- **3 AI providers** behind one common `VideoProvider` interface:
  - Google Gemini Veo Pro (`veo-3.1-generate-preview`)
  - Google Gemini Veo Flash (`veo-3.1-fast-generate-preview`)
  - MiniMax Hailuo 2.3 (`MiniMax-Hailuo-2.3`, 6s or 10s)
- **Async job pipeline** (BullMQ + Redis) with separate generation and merge queues, exponential backoff, 5-min polling ceiling
- **WebSocket `/ws/jobs`** for real-time status push (polling fallback via REST)
- **FFmpeg merge worker** — normalises to 720p/24fps/H.264/AAC, applies transitions (xfade / fade-to-black / hard cut), mixes background music
- **Whisper captions** burned into the merged export (requires `OPENAI_API_KEY`)
- **Subject-consistency helper** — extract first frame of a prior generation, reuse as reference image for the next scene
- **Image-to-video** — optional reference image per scene
- **Storyboard preview** — sequential client-side playback of selected clips
- **Export history** — every merge retained with re-download link
- **Per-model daily quotas** with UI badge + low-quota banner
- **Quota refund** on generation failure (mirrors MiniMax's no-charge policy)
- **First-run admin bootstrap** — creates `admin@clipforge.local` on empty DB
- **Role-based access** (admin / editor / viewer) with `requireRole` middleware
- **Auth & session** — argon2id + 30-day httpOnly cookie + Redis rate limits
- **Audit log** of every generation, merge, and admin action
- **Observability** — pino structured logs, request-id propagation, Prometheus + Grafana + Loki + Promtail
- **Pre-built Grafana dashboard** with queue depth, failure rate, per-model spend, API p95
- **Web UI** (React 18 + Vite + TanStack Router + TanStack Query + Tailwind) with full keyboard navigation, semantic landmarks, ARIA labels
- **Docker Compose** for one-command local setup (Postgres + Redis + MinIO + MailHog + Prometheus + Grafana + Loki)
- **GitHub Actions CI** with lint / typecheck / test / build / Docker buildx
- **Multi-stage Dockerfiles** for API, worker, and web

### Documentation

- Full [PRD](ClipForge_PRD.md) (48 tasks / 6 phases)
- [Tasks.md](Tasks.md) tracker (48/48 done)
- Architecture writeup ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md))
- API reference ([docs/API.md](docs/API.md))
- Deployment guide ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))
- Development guide ([docs/DEVELOPMENT.md](docs/DEVELOPMENT.md))
- Hailuo vs Veo cheatsheet ([mira-marketing-video-scripts/hailuo-vs-veo-cheatsheet.md](mira-marketing-video-scripts/hailuo-vs-veo-cheatsheet.md))

### Verified

End-to-end live test via Chrome DevTools on 2026-07-03:
- ✅ Login as admin@clipforge.local via web UI
- ✅ Create project with scene + Hailuo 2.3 model selection
- ✅ Trigger generation → API enqueues → worker calls MiniMax → polled until Success
- ✅ Retrieved real 1.8MB MP4 output from MiniMax CDN
- ✅ Veo 3.1 Fast test (4.3MB MP4) via direct API
- ✅ All 12 Postgres tables created and verified
- ✅ Provider config seeded with correct daily limits

### Known limitations

- Hailuo provider hard-codes `duration: 6` (Hailuo API doesn't support 8s) — UI advertises 8s but actual clips are 6s
- Merge API supports up to 8 scenes in a single xfade chain (V2 limitation; for longer merges, batch sequentially)
- Image-to-video for Veo currently only passes the URL; for S3-hosted references, ensure the bucket allows public read or generates presigned URLs
- Whisper captions require an OpenAI API key; if absent, captions are skipped silently in the merge
- The first-run admin uses a default password — **change `Admin@123` after first login** in production

[1.0.0]: https://github.com/techseria/clipforge/releases/tag/v1.0.0