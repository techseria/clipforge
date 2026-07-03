# ⚡ ClipForge

> **AI Video Generation Platform for Marketers** — turn plain-language instructions into finished promotional videos, generated scene-by-scene with interchangeable AI video models.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Status: V1 ready](https://img.shields.io/badge/status-V1%20ready-brightgreen)](#-status)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Website](https://techseria.com) · [Report bug](https://github.com/techseria/clipforge/issues) · [Request feature](https://github.com/techseria/clipforge/issues)

---

## What is ClipForge?

ClipForge is a single-tenant web app for marketers and small creative teams who need short promotional videos produced at scale, without learning a video editor. You describe a project in plain language, break it into scenes, and the platform generates an 8-second AI video clip per scene using one of three interchangeable models. When you like the takes, ClipForge merges them into a single downloadable MP4.

The product was designed around three real frustrations with off-the-shelf AI video generators:

1. **No workflow.** Most generators give you a single text box and a download button. Marketers want a *project*, a *style*, a *sequence of scenes*, and a *single merged deliverable*.
2. **Provider lock-in.** Output quality, latency, and cost vary wildly by provider. ClipForge lets you mix **Google Gemini Veo Pro / Flash** and **MiniMax Hailuo 2.3** per scene — use the cheap one for drafts, the expensive one for the hero shot.
3. **No quota control.** A team running on a MiniMax coding-plan budget needs hard daily caps with a transparent UI. ClipForge enforces per-model daily limits, refunds quota on failed generations, and surfaces "1 generation left today" before the user clicks.

## Status


The full PRD that scoped this release is in [ClipForge_PRD.md](ClipForge_PRD.md).

## Screenshots

*Coming soon — please run the project locally (5 min) and add screenshots via PR.*

## Features

### Authoring
- **Guided 3-step project wizard** — title + global style → add scenes → choose model per scene
- **Reorderable scenes** with ↑/↓ controls (drag-and-drop via dnd-kit)
- **Per-scene model picker** with cost indicator (Veo Pro $$$ · Veo Flash $ · Hailuo $$) and live remaining quota
- **Reference image upload** per scene (image-to-video for Veo + Hailuo)
- **Native audio toggle** (Veo synchronized audio generation; Hailuo silent clips)
- **Per-scene transition** (hard cut · fade to black · crossfade 0.5s · crossfade 1s)

### Generation
- **3 AI providers** behind one common interface (VideoProvider): Google Gemini Veo Pro, Google Gemini Veo Flash, MiniMax Hailuo 2.3
- **Async BullMQ pipeline** with provider-specific concurrency, exponential backoff, and a 5-minute polling ceiling
- **Provider-config externalization** (admin-editable model IDs in `provider_config` table; PRD §19 risk mitigation)
- **WebSocket `/ws/jobs`** for real-time status push (polling fallback via REST)
- **Regeneration history** per scene — every attempt is stored, you can compare takes side-by-side, mark one as selected

### Editing
- **Storyboard preview** (sequential client-side playback of currently-selected scene clips)
- **Merge UI** with pre-checked scenes, drag-to-reorder, live total duration estimate
- **FFmpeg merge worker** — normalises each clip to 720p/24fps/H.264/AAC, applies transitions, mixes in background music
- **Background music** — upload mp3/wav/aac tracks; volume slider on merge
- **Export history** per project — every merge retained with re-download link

### Operations
- **First-run admin bootstrap** — creates `admin@clipforge.local` / `Admin@123` if `users` table is empty (idempotent on subsequent boots)
- **Session auth** (cookie + argon2id) with role-based access (`admin` / `editor` / `viewer`)
- **Per-model daily quotas** (Veo Pro 10 soft, Veo Flash 20 soft, Hailuo 2.3 **3 hard**)
- **Quota refund on failure** (mirrors MiniMax's no-charge-for-failed policy)
- **Audit log** of every generation, merge, and admin action

### Observability
- **Structured logging** (pino with request-id propagation)
- **Prometheus + Grafana + Loki** in `docker-compose.yml` (datasource auto-provisioned, dashboard pre-built at `infra/grafana/dashboards/clipforge.json`)
- **Per-provider analytics** at `/analytics` — generations per day, spend estimate, top-regenerated scenes

## Architecture

```
clipforge/
├── apps/
│   ├── api/        Express REST + WebSocket /ws/jobs
│   ├── worker/     BullMQ workers (generation, merge, captions)
│   └── web/        React + Vite SPA
├── packages/
│   ├── shared/     Zod schemas, constants, quota service
│   ├── providers/  VideoProvider interface + Veo / Hailuo implementations
│   ├── storage/    S3-compatible storage helpers (MinIO / S3 / R2)
│   └── db/         Drizzle ORM schema + client
├── infra/
│   ├── prometheus/  scrape config
│   ├── grafana/     dashboards + provisioning
│   └── promtail/    Docker log shipping
├── docker-compose.yml
├── ClipForge_PRD.md   # the source PRD
└── Tasks.md            # task tracker (48/48 done)
```

For a deeper architecture writeup, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (Docker, 5 min)

Prerequisites: **Docker 24+**, **Docker Compose v2**, **Node.js 20+** (for `pnpm`).

```bash
# 1. Clone
git clone https://github.com/techseria/clipforge.git
cd clipforge

# 2. Configure environment
cp .env.example .env
# edit .env: set GEMINI_API_KEY, MINIMAX_API_KEY, DATABASE_URL

# 3. Start everything
docker compose up -d

# 4. Open the app
open http://localhost:5173
# First-run admin: admin@clipforge.local / Admin@123
# (change the password after first login)
```

For a non-Docker dev setup (running API + worker + Vite directly), see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Configuration

All environment variables are documented in [`.env.example`](.env.example). The most important:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Postgres connection string (Neon, Supabase, RDS, or self-hosted) |
| `REDIS_URL` | ✅ | Redis connection string for BullMQ + rate limits |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | ✅ | S3-compatible object storage (AWS S3, Cloudflare R2, MinIO) |
| `GEMINI_API_KEY` | For Veo | Google AI Studio key with Veo access |
| `MINIMAX_API_KEY` | For Hailuo | MiniMax coding-plan key (`sk-cp-…`) |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | Optional | First-run admin credentials (default: `admin@clipforge.local` / `Admin@123`) |
| `JWT_SECRET` | ✅ | Used for session signing — generate a random 32+ char string for production |
| `WEB_ORIGIN` | ✅ | CORS origin for the web frontend (default: `http://localhost:5173`) |

Daily quota limits, model IDs, and per-provider config are stored in the `provider_config` database table and can be edited at runtime via `/api/v1/admin/*` endpoints (admin role required).

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + Vite + TanStack Router + TanStack Query + Tailwind |
| Backend | Express + Zod + argon2 + cookie sessions + WebSocket |
| Worker | BullMQ (Redis) + FFmpeg + fluent-ffmpeg |
| AI providers | `@google/generative-ai`-style REST (Veo `predictLongRunning`) + MiniMax `v1/video_generation` |
| Database | PostgreSQL 16+ via Drizzle ORM |
| Storage | S3-compatible (MinIO in dev, AWS S3 / Cloudflare R2 in prod) |
| Observability | Prometheus + Grafana + Loki + Promtail |
| Auth | Session cookie (httpOnly, SameSite=Lax, 30-day TTL) + argon2id |

## API overview (v1)

All endpoints under `/api/v1`. Authentication via `clipforge_session` httpOnly cookie.

```
POST   /auth/register                create account
POST   /auth/login                   start session
POST   /auth/logout                  end session
GET    /auth/me                      current user

GET    /projects                      list user's projects
POST   /projects                      create project
GET    /projects/:id                  project + scenes
PATCH  /projects/:id                  rename / update style
DELETE /projects/:id                  delete

POST   /projects/:id/scenes           add scene
PATCH  /scenes/:id                   edit prompt / model / ref image / selected gen
POST   /projects/:id/scenes/reorder   reorder scenes
DELETE /scenes/:id                    remove

POST   /scenes/:id/generations        enqueue generation (202)
GET    /scenes/:id/generations        list history
GET    /generations/:id               poll single

POST   /projects/:id/merge            enqueue merge (202)
GET    /merges/:id                    poll merge
GET    /projects/:id/merges           export history

GET    /uploads/reference-image      presigned object URL
POST   /uploads/reference-image       multipart upload (jpg/png/webp, ≤10MB)

GET    /music                         list tracks (built-in + user's)
POST   /music/upload                  upload audio
DELETE /music/:id                     remove

POST   /generations/:id/captions      enqueue Whisper transcription
GET    /generations/:id/captions      list segments

GET    /usage                         today's quota per provider
GET    /analytics/summary             per-day/per-provider counts
GET    /analytics/most-regenerated    scenes with most attempts
GET    /analytics/spend-estimate      per-provider $

WS     /ws/jobs                       real-time job events (session-cookie auth)

GET    /admin/users                   list users (admin role)
PATCH  /admin/users/:id/role          change role
```

Full schema in [docs/API.md](docs/API.md) (auto-generated from Zod).

## Roadmap

- ✅ **Phase 0 — Foundations** (weeks 1-2)
- ✅ **Phase 1 — MVP Core Loop** (weeks 3-6)
- ✅ **Phase 2 — Multi-Model + Quotas** (weeks 7-8)
- ✅ **Phase 3 — Regeneration, Select & Merge** (weeks 9-11)
- ✅ **Phase 4 — Polish & V1 Launch** (weeks 12-13)
- ✅ **Phase 5 — V2 Candidates** (native audio · music · captions · transitions · subject consistency · team roles · analytics)
- ⏭ **Post-V1** — see [docs/ROADMAP.md](docs/ROADMAP.md) for candidate features (multi-tenant orgs, timeline editor, custom model training, mobile apps)

## Contributing

We welcome pull requests, bug reports, and feature ideas.

- 🐛 [Report a bug](https://github.com/techseria/clipforge/issues/new?template=bug_report.md)
- 💡 [Request a feature](https://github.com/techseria/clipforge/issues/new?template=feature_request.md)
- 🔒 [Report a security vulnerability](SECURITY.md)
- 📖 Read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process
- 🤝 Read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community norms

## Community

- **GitHub Discussions** — questions, ideas, show-and-tell
- **GitHub Issues** — bug reports, feature requests
- **Email** — hello@techseria.com (for private inquiries only)

## License

ClipForge is **open source** under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)**.

The AGPL was chosen deliberately: the platform is most useful when deployed as a network service, and the AGPL ensures that improvements made by anyone who runs a network service must be released back to the community. If you fork and modify ClipForge, you must publish your source under the same terms. See [LICENSE](LICENSE) for the full text and [NOTICE](NOTICE) for third-party acknowledgments.

For commercial licensing that doesn't require source publication (e.g., embedding ClipForge as a black-box component in a proprietary SaaS without sharing modifications), please contact licensing@techseria.com.

## Trademarks

**ClipForge** and the ClipForge logo are trademarks of **Techseria** (https://techseria.com). Use of the name or logo in derivative works is welcome under the terms of the AGPL but should not suggest endorsement by Techseria.

## Acknowledgments

Built with the support of the open-source community. See [NOTICE](NOTICE) for a full list of dependencies and their licenses.

---

**Maintained by [Techseria](https://techseria.com)** · 2026
*If you found ClipForge useful, please ⭐ the repo and tell a colleague.*
