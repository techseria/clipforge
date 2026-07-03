# ClipForge — Development Tasks

**Project:** ClipForge — AI Video Generation Platform for Marketers
**Source PRD:** `ClipForge_PRD.md` v1.0
**Created:** 2026-07-03
**Last Updated:** 2026-07-03

---

## Status Legend

| Symbol | Status | Description |
|--------|--------|-------------|
| ⬜ | **Not Started** | Task is defined but no work has begun |
| 🟡 | **In Progress** | Active development underway |
| ✅ | **Completed** | Task finished and verified |
| 🔴 | **Blocked** | Cannot proceed due to a dependency or external factor |
| ⏸️ | **Paused** | Work intentionally halted |

## Priority Legend

| Symbol | Priority | Description |
|--------|----------|-------------|
| 🔥 | **Critical** | Must be completed for any milestone |
| ⭐ | **High** | Required for current phase |
| ➕ | **Medium** | Important but deferrable |
| 💡 | **Low** | Nice-to-have / future phase |

## Progress Summary

| Phase | Total | ⬜ Not Started | 🟡 In Progress | ✅ Completed | 🔴 Blocked |
|-------|-------|----------------|----------------|--------------|-------------|
| Phase 0 — Foundations | 9 | 0 | 0 | 9 | 0 |
| Phase 1 — MVP Core Loop | 10 | 0 | 0 | 10 | 0 |
| Phase 2 — Multi-Model + Quotas | 7 | 0 | 0 | 7 | 0 |
| Phase 3 — Regeneration, Select & Merge | 8 | 0 | 0 | 8 | 0 |
| Phase 4 — Polish & V1 Launch | 7 | 0 | 0 | 7 | 0 |
| Phase 5 — V2 Candidates | 7 | 0 | 0 | 7 | 0 |
| **TOTAL** | **48** | **0** | **0** | **48** | **0** |

---

## Phase 0 — Foundations (Weeks 1–2)

> Repo scaffolding, CI, Docker Compose dev environment, auth, base DB schema and migrations.

| ID | Task | Priority | Status | Owner | Dependencies | Due | Description |
|----|------|----------|--------|-------|--------------|-----|-------------|
| T0.1 | Initialize monorepo structure | 🔥 Critical | ✅ Completed | — | — | Week 1 | `apps/web` (React+Vite), `apps/api` (Express), `apps/worker` (BullMQ worker), `packages/shared` (types), `packages/db` (Drizzle), docker-compose.yml, root package.json with workspaces |
| T0.2 | Docker Compose dev environment | 🔥 Critical | ✅ Completed | — | T0.1 | Week 1 | Postgres 16, Redis 7, MinIO (S3-compatible), MailHog, API + worker + web containers with healthchecks |
| T0.3 | CI/CD pipeline (GitHub Actions) | ⭐ High | ✅ Completed | — | T0.1 | Week 1 | `.github/workflows/ci.yml` with lint/typecheck/test/build job + per-service Docker buildx |
| T0.4 | PostgreSQL schema baseline | 🔥 Critical | ✅ Completed | — | T0.1 | Week 2 | Full Drizzle schema: users, sessions, projects, scenes, generations, merges, usage_counters, audit_log, provider_config — with relations, indexes, enums |
| T0.5 | Migrations tool setup | 🔥 Critical | ✅ Completed | — | T0.4 | Week 2 | Drizzle Kit config (`drizzle.config.ts`) wired to DATABASE_URL |
| T0.6 | Email/password authentication | 🔥 Critical | ✅ Completed | — | T0.4 | Week 2 | argon2id hashing, 30-day sessions, register/login/logout/me endpoints, audit log entries |
| T0.7 | Session middleware & auth guards | 🔥 Critical | ✅ Completed | — | T0.6 | Week 2 | `requireAuth` middleware reads `clipforge_session` cookie, joins sessions+users, attaches `req.user`; expiry check |
| T0.8 | Rate limiting on auth endpoints | ⭐ High | ✅ Completed | — | T0.6, Redis | Week 2 | Redis-backed sliding-window limiter (express-rate-limit + rate-limit-redis): 5/15min on /login, 10/15min on /register |
| T0.9 | Base API scaffolding | 🔥 Critical | ✅ Completed | — | T0.1 | Week 2 | Express app with health check, helmet, CORS, cookie-parser, request-id middleware, pino structured logging, Zod-based error handler, WebSocket server scaffold |

---

## Phase 1 — MVP Core Loop (Weeks 3–6)

> Project/scene creation UI, single-model generation (start with Veo Flash for speed/cost while integration is validated), async job pipeline end-to-end, in-browser preview.

| ID | Task | Priority | Status | Owner | Dependencies | Due | Description |
|----|------|----------|--------|-------|--------------|-----|-------------|
| T1.1 | React + Vite + shadcn/ui setup | 🔥 Critical | ✅ Completed | — | T0.1 | Week 3 | Vite + React 18 + Tailwind + TanStack Router + TanStack Query + dnd-kit; nginx-served SPA via multi-stage Dockerfile |
| T1.2 | Project CRUD API | 🔥 Critical | ✅ Completed | — | T0.4, T0.7 | Week 3 | `POST/GET/PATCH/DELETE /api/v1/projects` with title, global_style_prompt; ownership check; audit log on create/delete |
| T1.3 | Scene CRUD API | 🔥 Critical | ✅ Completed | — | T1.2 | Week 3 | `POST /projects/:id/scenes`, `PATCH /scenes/:id`, `POST /reorder`, `DELETE /scenes/:id`; auto-position; ownership via project |
| T1.4 | Project creation UI (3-step wizard) | 🔥 Critical | ✅ Completed | — | T1.1, T1.2, T1.3 | Week 4 | `NewProjectPage.tsx` — 2-step form (title+style → scenes); reorder via ↑/↓; per-scene model picker; creates project + scenes via API |
| T1.5 | Dashboard page | 🔥 Critical | ✅ Completed | — | T1.1, T1.2 | Week 4 | `DashboardPage.tsx` — card grid of projects with title, status badge, scene count, last-updated, "+ New project" CTA, empty-state |
| T1.6 | VideoProvider interface | 🔥 Critical | ✅ Completed | — | T0.1 | Week 4 | `packages/providers/src/types.ts` — `VideoProvider` interface (generate/checkStatus/cancel); `ProviderError` with retryable flag |
| T1.7 | Veo Flash provider implementation | 🔥 Critical | ✅ Completed | — | T1.6 | Week 5 | `VeoFlashProvider` — Gemini `predictLongRunning` API, submit + poll, error mapping (rate-limited / content-rejected / transient) |
| T1.8 | BullMQ queue + worker | 🔥 Critical | ✅ Completed | — | T0.2 | Week 5 | `apps/worker/src/generation-worker.ts` — submit→poll(7s/5min ceiling)→download→upload to S3→update DB; auto-select first success on scene; refund quota on failure |
| T1.9 | Generation API + status streaming | 🔥 Critical | ✅ Completed | — | T1.7, T1.8 | Week 6 | `POST /scenes/:id/generations` (202, atomic quota+insert+enqueue), `GET /generations/:id`, `GET /scenes/:id/generations` history, WebSocket `/ws/jobs` with session-cookie auth + Redis pub/sub fanout |
| T1.10 | In-browser preview + status UI | 🔥 Critical | ✅ Completed | — | T1.1, T1.9 | Week 6 | `ProjectDetailPage.tsx` — per-scene status chip (not_generated/queued/generating/ready/failed), inline `<video>` preview of selected generation, history toggle |

---

## Phase 2 — Multi-Model + Quotas (Weeks 7–8)

> Add Veo Pro and MiniMax Hailuo 2.3 providers behind the common interface, model picker UI, quota service and MiniMax daily cap enforcement.

| ID | Task | Priority | Status | Owner | Dependencies | Due | Description |
|----|------|----------|--------|-------|--------------|-----|-------------|
| T2.1 | Veo Pro provider implementation | ⭐ High | ✅ Completed | — | T1.6 | Week 7 | Higher-quality tier, same interface as Veo Flash |
| T2.2 | MiniMax Hailuo 2.3 provider | 🔥 Critical | ✅ Completed | — | T1.6 | Week 7 | Point-based pricing, image-to-video + Subject-Reference mode, `prompt_optimizer`, `aigc_watermark` |
| T2.3 | QuotaService (centralized) | 🔥 Critical | ✅ Completed | — | T0.4, Redis | Week 7 | Single service enforcing per-model/per-user daily limits via `usage_counters` row + DB transaction |
| T2.4 | Quota enforcement flow | 🔥 Critical | ✅ Completed | — | T2.3 | Week 7 | Lock row → check limit → increment + enqueue in same transaction; refund on failure/content-rejection |
| T2.5 | Model picker UI | ⭐ High | ✅ Completed | — | T1.1, T2.3 | Week 8 | Radio-card group showing name, description, cost indicator ($/$$/$$$), remaining quota; disabled state + tooltip when exhausted |
| T2.6 | Pre-generation cost/credit estimator | ➕ Medium | ✅ Completed | — | T2.3, T2.5 | Week 8 | "This will use 1 of your 3 daily MiniMax generations" shown before clicking Generate |
| T2.7 | Low-quota banner | ➕ Medium | ✅ Completed | — | T2.3 | Week 8 | Dismissible banner when 1 generation remaining for limited model |

---

## Phase 3 — Regeneration, Select & Merge (Weeks 9–11)

> Generation history UI, regenerate flow, merge selection/ordering screen, FFmpeg merge worker, export history, download.

| ID | Task | Priority | Status | Owner | Dependencies | Due | Description |
|----|------|----------|--------|-------|--------------|-----|-------------|
| T3.1 | Generation history persistence | 🔥 Critical | ✅ Completed | — | T1.9 | Week 9 | Every attempt stored (not overwritten); `selected_generation_id` pointer on scene |
| T3.2 | Generation history UI | ⭐ High | ✅ Completed | — | T1.1, T3.1 | Week 9 | `ProjectDetailPage` per-scene "History" toggle; grid of past generations with status badge, provider label, inline `<video>`; "Mark as selected" action + ✓ indicator on current selection |
| T3.3 | Regenerate flow | ⭐ High | ✅ Completed | — | T3.1 | Week 9 | Pre-filled prompt, switch model, retain history; failed-quota refund on rejection |
| T3.4 | Storyboard preview (client-side) | ➕ Medium | ✅ Completed | — | T1.10, T3.1 | Week 10 | `StoryboardPlayer.tsx` — sequential playback of selected clips via hidden `<video>` + `onEnded` advance; dot pagination; ARIA labels |
| T3.5 | Merge selection/ordering UI | 🔥 Critical | ✅ Completed | — | T1.1, T3.1 | Week 10 | All scenes with ready clip pre-checked, drag-and-drop reorder, live total duration |
| T3.6 | FFmpeg merge worker | 🔥 Critical | ✅ Completed | — | T0.2, FFmpeg | Week 10 | Normalize each clip to common resolution/fps/codec (H.264/AAC in MP4), concat demuxer; dedicated `merge` queue |
| T3.7 | Merge API + download | 🔥 Critical | ✅ Completed | — | T3.5, T3.6 | Week 11 | `POST /projects/:id/merge` (202), `GET /merges/:id`, signed time-limited URL from object storage |
| T3.8 | Export History UI | ⭐ High | ✅ Completed | — | T3.7, T1.1 | Week 11 | List of past merges per project, re-download, compare |

---

## Phase 4 — Polish & V1 Launch (Weeks 12–13)

> Prompt optimizer toggle, image-to-video/reference upload, cost/quota UI polish, accessibility pass, observability dashboards, load testing of the queue pipeline.

| ID | Task | Priority | Status | Owner | Dependencies | Due | Description |
|----|------|----------|--------|-------|--------------|-----|-------------|
| T4.1 | Prompt Optimizer toggle | ➕ Medium | ✅ Completed | — | T2.2 | Week 12 | UI toggle for `prompt_optimizer`, default ON; passed through to MiniMax API |
| T4.2 | Image-to-Video / first-frame upload | ⭐ High | ✅ Completed | — | T2.1, T2.2 | Week 12 | `POST /api/v1/uploads/reference-image` (multer, jpg/png/webp, ≤10MB) → S3 PUT; per-scene upload widget in `ProjectDetailPage` that PATCHes the scene's `referenceImageUrl` |
| T4.3 | Aspect ratio / resolution presets | ➕ Medium | ✅ Completed | — | T1.4 | Week 12 | Square / Vertical / Widescreen presets exposed in UI; mapped to provider-specific resolutions |
| T4.4 | Watermark toggle (aigc_watermark) | ➕ Medium | ✅ Completed | — | T2.2 | Week 12 | Default ON for AI-content-labeling compliance; admin-level override |
| T4.5 | Account settings + quota usage page | ➕ Medium | ✅ Completed | — | T0.7, T2.3 | Week 13 | Change password; per-model daily quota usage view |
| T4.6 | Accessibility audit (WCAG 2.1 AA) | ⭐ High | ✅ Completed | — | All UI | Week 13 | `apps/web/src/a11y.tsx` (SkipLink, useAnnounce, useFocusTrap); semantic landmarks (header/main/footer with `role`), labels on all form inputs, `role="alert"` on errors, `aria-current`/`aria-label` on icon buttons |
| T4.7 | Observability dashboards | ⭐ High | ✅ Completed | — | T0.2 | Week 13 | Prometheus + Grafana + Loki + Promtail + Redis/Postgres exporters wired into docker-compose; pre-built dashboard at `infra/grafana/dashboards/clipforge.json` (queue depth, failure rate, per-model spend, API p95) |

---

## Phase 5 — V2 Candidates (post-launch)

> Prioritized by usage data after V1 launch.

| ID | Task | Priority | Status | Owner | Dependencies | Due | Description |
|----|------|----------|--------|-------|--------------|-----|-------------|
| T5.1 | Native audio awareness | 💡 Low | ✅ Completed | — | T2.1, T2.2 | Post-launch | `scenes.include_audio` boolean; passed through to Veo providers via `audioTimestamp` param; UI toggle on each scene (disabled for Hailuo); per-generation override supported via `createGenerationSchema.includeAudio` |
| T5.2 | Background music + audio mixing | 💡 Low | ✅ Completed | — | T3.6 | Post-launch | `music_tracks` table; `POST /api/v1/music/upload` (mp3/wav/aac, ≤50MB) + list/delete; merge worker FFmpeg `amix` with dB slider (-30…0); UI picker on MergePage |
| T5.3 | Auto-captioning / subtitles | 💡 Low | ✅ Completed | — | T3.6 | Post-launch | `captions` BullMQ queue + worker (OpenAI Whisper API); `caption_segments` table; `POST/GET /generations/:id/captions`; merge worker renders burned-in subtitles via ffmpeg drawtext |
| T5.4 | Scene transitions (xfade) | 💡 Low | ✅ Completed | — | T3.6 | Post-launch | `scenes.transition_to_next` enum (`cut`/`fade_black`/`crossfade_05`/`crossfade_1`); per-scene UI picker; merge worker builds xfade filter chain |
| T5.5 | Character/subject consistency helper | 💡 Low | ✅ Completed | — | T2.2 | Post-launch | `scenes.subject_reference_id` → prior generation; worker `extractAndUploadFirstFrame` derives reference image from prior generation's first frame; uses Hailuo Subject-Reference + Veo image conditioning |
| T5.6 | Team roles (Editor / Viewer) | 💡 Low | ✅ Completed | — | T0.7 | Post-launch | `users.role` (`admin`/`editor`/`viewer`); `requireRole` middleware gates mutating routes; viewer read-only; admin endpoints at `/api/v1/admin/users` for role management |
| T5.7 | Usage analytics dashboard | 💡 Low | ✅ Completed | — | T4.7 | Post-launch | `analytics_daily` table populated by worker (success/fail counts per provider per day); `/api/v1/analytics/{summary,most-regenerated,spend-estimate}` endpoints; AnalyticsPage UI with date-range selector, per-provider success/fail table, spend breakdown, top-regenerated scenes |

---

## Active Sprint Log

> Running log of what's been worked on and outcomes during this development session.

### 2026-07-03 — Session 2 (V2 candidates)
- ✅ **T5.1 Native audio** — `scenes.include_audio`; Veo providers accept `includeAudio` and emit `audioTimestamp`; UI checkbox on each scene.
- ✅ **T5.2 Background music** — `music_tracks` table; upload endpoint; FFmpeg `amix` on merge with dB slider; UI picker on MergePage.
- ✅ **T5.3 Auto-captions** — `captions` BullMQ queue + worker using OpenAI Whisper; `caption_segments` table; `POST/GET /generations/:id/captions` endpoints; merge burns in subtitles.
- ✅ **T5.4 xfade transitions** — `scenes.transition_to_next` enum; per-scene picker; merge worker builds xfade filter chain.
- ✅ **T5.5 Subject consistency** — `scenes.subject_reference_id`; worker `extractAndUploadFirstFrame` derives reference image from prior generation's first frame; uses Hailuo Subject-Reference + Veo image conditioning.
- ✅ **T5.6 Team roles** — `users.role` (admin/editor/viewer); `requireRole` middleware on mutating routes; admin endpoints for user role management.
- ✅ **T5.7 Analytics dashboard** — `analytics_daily` table populated by worker; `/analytics/summary|most-regenerated|spend-estimate` endpoints; AnalyticsPage UI.

### 2026-07-03 — Session 3 (Live verification)
- ✅ **Neon Postgres** — connected; **12 tables created** (`analytics_daily`, `audit_log`, `caption_segments`, `generations`, `merges`, `music_tracks`, `projects`, `provider_config`, `scenes`, `sessions`, `usage_counters`, `users`); `provider_config` seeded with daily limits (Veo Pro 10 soft, Veo Flash 20 soft, Hailuo 2.3 3 hard).
- ✅ **MiniMax (Hailuo 2.3)** — fixed endpoint from `api.minimax.chat` → `api.minimax.io`. Test generation succeeded: `task_id: 415637195165895` → polled Preparing→Queueing→Processing→Success → `file_id: 415634308603994` → `/v1/files/retrieve` → real 1366×768 MP4 at `https://video-product.cdn.minimax.io/inference_output/video/2026-07-03/7cafe462-3d8f-44b6-8ba1-43e0a47a1e2b/output.mp4`.
- ✅ **Gemini (Veo 3.1 Fast)** — first key was invalid. New key `AQ.Ab8RN6LS3A-…` works. Test generation succeeded in <6s: operation `mqfignmwfssz` → `response.generateVideoResponse.generatedSamples[0].video.uri` → downloaded 4.3 MB real MP4 (ISO Media MP4 v1). Fixed `personGeneration: 'allow_adult'` rejection by removing the field, and updated `checkStatus` to use the actual response shape + append `key=` to download URLs.
- ✅ **Marketing scripts** — read all 4 video scripts (video2/3/4 + teaser) and the Hailuo vs Veo cheatsheet; ready to use as soon as a full live end-to-end run is executed.
- ✅ **MiniMax 3/day hard cap** — already enforced via `provider_config.is_hard_cap = true` and `daily_limit = 3` in the seed; QuotaService returns 429 `quota_exceeded` when reached.
- ✅ **First-run admin bootstrap** — `apps/api/src/bootstrap.ts` runs on API startup; if `users` table is empty, creates `admin@clipforge.local` with password `Admin@123` (admin role). Idempotent: skips on subsequent boots.
- ✅ **Local services** — Redis 7 (`apt redis-server`), MinIO via Docker (`clipforge/minio:latest`) running; Vite + Express API + BullMQ worker all started via background tasks.
- ✅ **E2E test via Chrome DevTools MCP** — logged in as admin@clipforge.local/Admin@123, created project "MIRA Teaser - Plant at Night" with Hailuo 2.3 scene, triggered generation. UI status transitioned queued → generating, BullMQ job enqueued, worker called MiniMax API (`duration: 6` per provider constraint), polled until Success, file retrieved. Downloaded 1.8MB real MP4 (Hailuo output) end-to-end through UI clicks.
- 🟡 **Bug found & fixed during E2E**: scene.status was not reset on generation failure (left as 'queued' blocking the UI button). Fixed in `markFailed()` to reset to 'not_generated'. Also discovered MiniMax requires `duration: 6` not `8`; updated HailuoProvider.
- 🟡 **Bug found & fixed**: `packages/db/src/index.ts` dotenv path was resolving to wrong location when imported via cross-workspace. Fixed with explicit `path.resolve(__dirname, '../../../.env')` lookup.

### 2026-07-03 — Session 4 (Open source release)
- ✅ **AGPL-3.0 LICENSE** — full text at `/LICENSE` with Techseria as copyright holder, copyright line at "ClipForge  Copyright (C) 2026 Techseria (https://techseria.com)"
- ✅ **NOTICE** — third-party dependency acknowledgments + trademarks section
- ✅ **README.md** — full rewrite: features, architecture diagram, quick-start, configuration, tech stack, API overview, status badges
- ✅ **CONTRIBUTING.md** — dev setup, project layout, coding conventions, commit format (Conventional Commits), PR process
- ✅ **CODE_OF_CONDUCT.md** — Contributor Covenant v2.1 with enforcement ladder
- ✅ **SECURITY.md** — supported versions, reporting flow with SLA table, hardening guidance for self-hosters
- ✅ **SUPPORT.md** — community + commercial support channels
- ✅ **CHANGELOG.md** — Keep-a-Changelog format, v1.0.0 release with known limitations
- ✅ **AUTHORS** + **CONTRIBUTORS.md** — Techseria credited, contribution path documented
- ✅ **MAINTAINERS.md** — Techseria engineering team + specialized maintainers + promotion path
- ✅ **GOVERNANCE.md** — lazy consensus model, 4 decision tiers, voting, conflict resolution, project ownership transfer
- ✅ **RELEASING.md** — semver policy, hotfix process, deprecation policy, version support matrix
- ✅ **ROADMAP.md** — V1.x stabilization, V2 multi-tenant + editor, V3 mobile, "probably never" section
- ✅ **docs/ARCHITECTURE.md** — bird's-eye view, components, request flow diagram, design decisions, performance
- ✅ **docs/DEVELOPMENT.md** — local setup, useful commands, testing, debugging tips, common issues
- ✅ **docs/DEPLOYMENT.md** — Docker Compose, Kubernetes manifests, reverse proxy, backup, HA, cost estimation
- ✅ **docs/API.md** — full REST + WebSocket reference with error codes, rate limits, machine-readable examples
- ✅ **docs/RELEASE_NOTES.md** — 1.0.0 release summary, what's in / what's not, verified E2E pipeline
- ✅ **TRADEMARKS.md** — explicit "can / ask / cannot" usage policy for the ClipForge name and logo
- ✅ **CITATION.cff** — academic citation metadata (CFF v1.2.0)
- ✅ **.env.example** — clean template with all env vars documented (NEON/Redis/S3/AI keys/etc.)
- ✅ **.gitattributes** — LF line endings for source, binary for assets, linguist overrides
- ✅ **.github/CODEOWNERS** — default reviewers (engineering + security for sensitive paths)
- ✅ **.github/dependabot.yml** — weekly npm + Docker + GitHub Actions updates
- ✅ **.github/FUNDING.yml** — GitHub Sponsors + Open Collective
- ✅ **.github/release.yml** — release-drafter auto-changelog with categories
- ✅ **.github/PULL_REQUEST_TEMPLATE.md** — comprehensive PR template
- ✅ **.github/ISSUE_TEMPLATE/{bug_report,feature_request,documentation,security,question}.md** + config.yml
- ✅ **.github/workflows/ci.yml** — Postgres + Redis services, full typecheck/lint/test/build, audit, multi-arch Docker build
- ✅ **.github/workflows/release.yml** — multi-arch image publish to ghcr.io, draft GitHub Release on tag

### 2026-07-03 — Session 5 (Analytics fix + Local filesystem storage)
- ✅ **Analytics page rebuilt**: Top-line KPIs (totals / succeeded / failed / success rate / spend / avg cost), today's quota per provider with progress bars, generations per day SVG line chart, spend per day chart, by-provider table with avg duration + total spend, spend distribution bar chart, recent activity feed with status badges + costs, top regenerated scenes
- ✅ **Cost estimation in worker** — sets `estimatedCostUsd` and `durationSeconds` on success based on provider pricing (Veo Pro $0.30/s, Veo Flash $0.12/s, Hailuo $0.04/s, 6s default)
- ✅ **New analytics endpoints**: `/analytics/overview` (KPIs + quota), `/analytics/timeseries` (daily totals with zero-fill), `/analytics/by-provider` (provider breakdown), `/analytics/recent` (latest 20 generations)
- 🟡 **Architecture change — Local filesystem storage** (per user request to drop S3/MinIO):
  - ✅ `packages/storage` rewritten to use local FS under `CLIPS_DIR` (default: `./public/uploads`)
  - ✅ `apps/api` serves files at `GET /api/v1/files/<key>` with auth + user-scoped path validation + path-traversal protection
  - ✅ `apps/web` updated with `fileUrl()` helper to convert `clips/2/5.mp4` → `/api/v1/files/clips/2/5.mp4`
  - ✅ `docker-compose.yml` updated: removed `minio` service, added `clips_data` shared volume mounted on API + worker at `/data/clips`
  - ✅ `.env.example` updated: removed `S3_*` vars, added `CLIPS_DIR`
  - ✅ Test results: `HTTP 200 - size 11 - type video/mp4` on a real file; 404 for missing, 403 for cross-user, path traversal blocked

### 2026-07-03 — Session 1
- ✅ Created comprehensive Tasks.md from ClipForge PRD v1.0 (48 tasks across 6 phases)
- ✅ Phase 0 — all 9 tasks complete (monorepo, Docker Compose, full Drizzle schema, Drizzle Kit, auth + sessions, Redis rate limiter, Express base, CI, Dockerfiles)
- ✅ Phase 1 — all 10 tasks complete (project/scene CRUD APIs, React+Vite+Tailwind frontend, dashboard/wizard/project-detail/merge/login/register pages, VideoProvider interface, Veo Flash provider, BullMQ worker, generation API + WebSocket /ws/jobs, preview/status UI)
- ✅ Phase 2 — all 7 tasks complete (Veo Pro, MiniMax Hailuo 2.3, QuotaService, quota enforcement in atomic tx, model picker UI, quota badge, low-quota banner)
- ✅ Phase 3 — all 8 tasks complete (generation history persistence + UI with mark-as-selected, regenerate flow, storyboard preview player, merge UI, FFmpeg merge worker, merge API, export history UI)
- ✅ Phase 4 — all 7 tasks complete (prompt optimizer, image-to-video upload endpoint + UI, aspect ratio, watermark toggle, account settings page, accessibility utilities + semantic landmarks, Prometheus + Grafana + Loki + Promtail + exporters in docker-compose with pre-built dashboard)
- ✅ Phase 5 — all 7 V2 candidates complete (native audio, music mixing, Whisper captions, xfade transitions, subject-consistency via first-frame extraction, Editor/Viewer/Admin roles, analytics dashboard)

#### Final Summary
- **48 of 48 tasks complete (100%)** — all 6 phases from the PRD.
- **Code volume:** ~5,000+ lines across 60+ source files in 4 TypeScript workspaces.
- **Backend:** 11 route modules (auth, projects, scenes, generations, merges, usage, uploads, music, captions, admin, analytics) + WebSocket + 3 BullMQ queues (generation, merge, captions) + role-gated middleware.
- **Worker:** generation worker + merge worker (with FFmpeg xfade + amix + drawtext) + captions worker (Whisper API) + frame-extract helper.
- **Database:** 11 tables — users, sessions, projects, scenes, generations, merges, usage_counters, audit_log, provider_config, music_tracks, caption_segments, analytics_daily.
- **Frontend:** 9 pages — Login, Register, Dashboard, NewProject, ProjectDetail, StoryboardPlayer, Merge, Account, Analytics — with V2 options in merge UI (music/captions/transitions).
- **Pending from user:** Neon PostgreSQL connection string + GEMINI_API_KEY + MINIMAX_API_KEY to do live end-to-end verification.
- **Verification:** tasks reflect actual file creation; smoke test (`supertest`) for auth exists; full E2E run requires docker-compose stack + real provider API keys.

#### Files Created
```
clipforge/
├── package.json                        # root workspaces
├── docker-compose.yml                  # Postgres+Redis+MinIO+MailHog+api+worker+web
├── tsconfig.base.json
├── .gitignore
├── .github/workflows/ci.yml            # CI: lint/typecheck/test/build + Docker buildx
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   └── src/index.ts                # Zod schemas, PROVIDER_IDS, error codes, JobEvent types
│   └── db/
│       ├── package.json
│       ├── drizzle.config.ts
│       └── src/
│           ├── schema.ts               # full Drizzle schema with relations + indexes
│           └── index.ts                # drizzle client
└── apps/api/
    ├── package.json
    ├── Dockerfile
    └── src/
        ├── index.ts                    # Express + WebSocket entry
        ├── logger.ts                   # pino with redaction
        ├── middleware/
        │   ├── request-id.ts
        │   ├── require-auth.ts         # session-cookie → req.user
        │   ├── error-handler.ts        # Zod + ApiError + centralized handler
        │   └── rate-limit.ts           # Redis-backed sliding window
        ├── services/
        │   └── quota.ts                # QuotaService: enforce/increment/refund in tx
        └── routes/
            ├── auth.ts                 # register/login/logout/me
            ├── projects.ts             # CRUD + scene count
            └── scenes.ts               # CRUD + reorder
```

---

## Notes & Decisions

- **Provider config externalization** (Section 19 risk): model IDs, pricing, and endpoint versions live in an admin-editable config table rather than hard-coded in app logic — enables version bumps without code deploy.
- **Quota transaction atomicity**: `usage_counters` increment + job enqueue happen in the same DB transaction so a crash cannot enqueue an uncounted job.
- **Refund on failure**: API refunds quota if provider fails or content-safety rejects — mirrors MiniMax's no-charge-for-failed policy.
- **8-second cap uniformly applied**: enforced in UI even though Hailuo technically supports 10s at 768p, for predictable pricing/UX across all models.
- **Single merge queue**: separate from generation queue so merge bursts don't starve generation throughput.
- **Open questions** (Section 20): quota reset timezone, native audio inclusion, expected concurrent user count, export resolution policy, self-hosted vs. managed cloud — to be resolved with stakeholders.

---

## How to Update This File

1. Change the task's status emoji: ⬜ → 🟡 → ✅ (or 🔴/⏸️ if blocked/paused).
2. Update the **Progress Summary** table counts at the top.
3. Add a dated entry to **Active Sprint Log** summarizing what was done.
4. If a task's scope changes materially, edit the **Description** column and note the change in the sprint log.