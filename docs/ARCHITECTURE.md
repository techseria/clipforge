# Architecture

> System design for ClipForge — how the components fit together, how data flows, and the design decisions behind the shape of the codebase.

## Bird's-eye view

```
                     ┌────────────────────┐
                     │   Browser (React)   │
                     │   Vite + TanStack   │
                     └──────────┬──────────┘
                                │ HTTPS
                                │ (WebSocket /ws/jobs)
                                ▼
                     ┌────────────────────┐
                     │   apps/api (Express)│
                     │   REST + Zod + pino│
                     └────┬──────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
        ▼                 ▼                  ▼
  ┌──────────┐      ┌──────────┐       ┌────────────┐
  │Postgres  │      │  Redis   │       │   S3 /     │
  │(Neon /   │      │  (BullMQ │       │   MinIO    │
  │ RDS /    │      │  queues, │       │ (clips +   │
  │ self-    │      │  rate    │       │  merged    │
  │ hosted)  │      │  limits) │       │  MP4s)     │
  └──────────┘      └────┬─────┘       └────────────┘
                         │
                         ▼
                ┌──────────────────┐
                │  apps/worker       │
                │  (BullMQ workers)  │
                │  - generation      │
                │  - merge (FFmpeg)  │
                │  - captions        │
                └────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────────┐
              │  Third-party AI providers │
              │  - Gemini Veo Pro/Flash   │
              │  - MiniMax Hailuo 2.3     │
              │  - OpenAI Whisper (T5.3)  │
              └─────────────────────────┘
```

## Components

### `apps/web` — React SPA

The user-facing application.

- **React 18** with **Vite** for HMR + fast cold start
- **TanStack Router** for type-safe, file-based routing
- **TanStack Query** for all server-state (caching, retries, optimistic updates)
- **TanStack Table** for tabular views (usage history, export history, admin views)
- **@dnd-kit** for drag-and-drop (scene reordering, history cards)
- **Tailwind CSS** + design tokens (color, spacing, typography) for a coherent look
- **shadcn/ui**-style primitives — copied into the repo, not a runtime dep
- **a11y utilities** — `<SkipLink>`, `useAnnounce`, `useFocusTrap`; semantic landmarks; ARIA labels
- **api.ts** — typed fetch wrapper with `ApiError` class

State flow: every server read goes through TanStack Query → `api.get<T>()`. Mutations invalidate the relevant query keys (e.g. enqueuing a generation invalidates `['project', id]` and `['scene-history', sceneId]`).

Why not Redux / Zustand? Server-state is the dominant state in this app. Component-local state lives in `useState`; no global client store is needed.

### `apps/api` — Express REST + WebSocket

The HTTP + WebSocket API. ~3,500 lines TypeScript.

- **Express 5** with **Zod** for request validation (every `body` / `query` / `params` is parsed with a Zod schema)
- **Session auth** — `clipforge_session` httpOnly cookie, argon2id hashes, 30-day TTL
- **Rate limiting** — `express-rate-limit` + Redis store; 5 attempts/15min on `/login`, 10/15min on `/register`
- **Helmet** for security headers
- **pino** structured logging with request-id propagation (`x-request-id` round-trips client → API → worker → logs)
- **WebSocket** at `/ws/jobs` — same session-cookie auth, fanout via Redis pub/sub (`job-events` channel)
- **Centralized error handler** — `ApiError` class + Zod error → consistent `{ error: { code, message, details } }` JSON shape
- **Role-based access** — `requireRole(...allowed)` middleware gates mutating routes; `requireAdmin` for admin-only

Route modules (all under `/api/v1`):

| File | Routes |
|------|--------|
| `auth.ts` | register, login, logout, me |
| `projects.ts` | project CRUD |
| `scenes.ts` | scene CRUD + reorder |
| `generations.ts` | enqueue + poll + history (transactional quota+enqueue) |
| `merges.ts` | enqueue + poll + history |
| `uploads.ts` | multer → S3 PUT for reference images |
| `music.ts` | music library CRUD |
| `captions.ts` | Whisper transcription enqueue + read |
| `admin.ts` | user list + role change |
| `analytics.ts` | aggregated stats |
| `usage.ts` | current quota per provider |
| `ws/jobs.ts` | WebSocket fanout |

### `apps/worker` — BullMQ workers

Background processing. Three independent workers, all sharing the same Redis connection.

#### Generation worker
- Picks up jobs from `generation` queue
- Calls the provider's `generate()` (submit)
- Polls `checkStatus()` every 7s with 5-min ceiling
- On success: downloads the asset, uploads to S3, updates `generations.result_url` + `scenes.selected_generation_id` + `scenes.status='ready'`
- On failure: marks generation `failed`, **refunds the quota** (per MiniMax no-charge policy), resets `scenes.status='not_generated'`
- Bumps `analytics_daily` for success/fail counts

#### Merge worker
- Picks up jobs from `merge` queue
- Downloads each selected generation from S3
- Normalises to 720p/24fps/H.264/AAC via FFmpeg
- Builds xfade filter chain for transitions (cut / fade_black / crossfade 0.5s / 1s)
- Optionally mixes in a user-uploaded music track via `amix` filter
- Optionally burns in Whisper captions via `drawtext` (T5.3)
- Uploads merged MP4 to S3, returns a presigned 24h URL

#### Captions worker
- Picks up jobs from `captions` queue
- Extracts audio from the generation (mono 16kHz WAV via FFmpeg)
- Sends to OpenAI Whisper for transcription
- Persists `caption_segments` (start_ms / end_ms / text)

### `packages/db` — Drizzle ORM

Postgres schema as TypeScript definitions. Migrations generated by `drizzle-kit`.

11 tables:

- `users` (with `role`, `is_admin`)
- `sessions`
- `projects`
- `scenes` (with `include_audio`, `transition_to_next`, `subject_reference_id`)
- `generations` (one row per attempt)
- `merges`
- `usage_counters` (per user/model/UTC day)
- `audit_log` (every privileged action)
- `provider_config` (admin-editable model IDs + limits)
- `music_tracks`
- `caption_segments`
- `analytics_daily`

ERD:

```
users ─┬─ sessions
       ├─ projects ── scenes ─┬─ generations ── caption_segments
       │                      │              │
       ├─ usage_counters      │              └─ s3:result_url
       ├─ audit_log           └─ generations.selected_generation_id
       ├─ music_tracks
       └─ provider_config

projects ── merges ── s3:result_url
analytics_daily (standalone)
```

### `packages/providers` — VideoProvider abstraction

```ts
interface VideoProvider {
  readonly id: ProviderId;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  checkStatus(providerJobId: string): Promise<CheckStatusResponse>;
  cancel(providerJobId: string): Promise<void>;
}
```

Three implementations:

- `VeoFlashProvider` → Google `predictLongRunning` endpoint
- `VeoProProvider` (subclass) → same client, different model ID
- `HailuoProvider` → MiniMax `v1/video_generation` endpoint

Provider-specific quirks (e.g. MiniMax requiring `duration: 6`, Veo file-URLs needing the API key appended) are normalized here. The worker and the API never see provider-specific shapes.

### `packages/shared` — Zod schemas, constants, quota service

Cross-workspace code:

- `Zod` schemas for all API request bodies (also used to derive the OpenAPI schema in `docs/API.md`)
- `PROVIDER_IDS`, `PROVIDER_LABELS`, `PROVIDER_COST`, `DEFAULT_DAILY_LIMITS` constants
- `getQuota`, `incrementQuota`, `refundQuota`, `enforceQuota` — atomic quota operations
- `ApiError` class with machine-readable error codes

### `packages/storage` — S3 helpers

The worker and the API both need to upload to / read from object storage. Centralized here:

- `s3` — shared `S3Client` (MinIO in dev, S3 in prod)
- `uploadBuffer(key, body, contentType)` — generic PUT
- `getObjectBuffer(key)` — generic GET
- `downloadAndUpload(remoteUrl, key)` — used by the generation worker to pull from MiniMax/Veo
- `presignedDownloadUrl(key, ttl)` — used by merge for the user-facing result URL

## Request flow: generate a clip

```
User clicks "Regenerate" in browser
   │
   ▼
React: useMutation → api.post('/api/v1/scenes/:id/generations', { model })
   │
   ▼
Express: POST /api/v1/scenes/:id/generations
   │  1. requireAuth → req.user
   │  2. zod.parse(body) → { model }
   │  3. SELECT scene JOIN project WHERE id=? AND user_id=?
   │  4. enforceQuota(userId, model) → 429 if hard cap hit
   │  5. BEGIN TX:
   │       INSERT generations (status='queued', provider, prompt=global+scene)
   │       UPDATE usage_counters SET count = count + 1
   │       UPDATE scenes SET status='queued'
   │     COMMIT
   │  6. enqueue BullMQ job 'gen-${generationId}' with attempts=3
   │  7. INSERT audit_log
   │  8. respond 202 { generationId, status: 'queued' }
   │
   ▼
React: invalidate ['project', id] → refetch shows new generation in history
       + WebSocket /ws/jobs (server-published via Redis pub/sub) updates
         the scene's status badge from 'not_generated' to 'queued' to
         'generating' to 'ready' in real-time
   │
   ▼
Worker: processGeneration(job)
   │  1. UPDATE generations SET status='running', started_at=now()
   │  2. getProvider(model) → VeoFlashProvider | HailuoProvider
   │  3. provider.generate(prompt) → { providerJobId }
   │  4. Poll loop (every 7s, max 5min):
   │       provider.checkStatus(providerJobId)
   │       if 'succeeded': download asset, upload to S3, mark complete
   │       if 'failed': markFailed → UPDATE + refund quota
   │  5. UPDATE generations SET status='succeeded', result_url=...
   │  6. UPDATE scenes SET selected_generation_id=..., status='ready' (if first success)
   │  7. Bump analytics_daily(succeeded +1)
   │  8. PUBLISH job-events → ws/jobs fans out to user's browser
   │
   ▼
React: scene status updates to 'ready', <video> element loads the clip
```

## Design decisions

### Why a single-tenant deployment model?

Because the V1 market is in-house marketing teams. Multi-tenant adds significant complexity (orgs, seats, billing, isolation) that we chose to defer to V2.

### Why a session cookie instead of JWT?

Cookies are simpler for browser SPAs (automatic `credentials: 'include'`), revocable server-side, and avoid the JWT-in-localStorage XSS trap. The 30-day TTL is a reasonable security/UX trade-off.

### Why provider-agnostic via `provider_config` table instead of env vars?

Per PRD §19 (risk: "Google has been actively deprecating older Veo endpoints mid-cycle"). Model IDs and pricing live in the DB, not the env, so we can bump `veo-3.1-generate-preview` to `veo-3.2-generate-preview` without a code deploy.

### Why pnpm workspaces instead of a single repo with a Lerna / Turborepo build?

Simpler. We don't need fancy caching or task graph; just consistent node_modules and shared TypeScript. The monorepo works because the workspace packages are small and change together.

### Why Drizzle instead of Prisma / TypeORM?

Drizzle is closer to raw SQL (no codegen step, no migration runtime). The schema is plain TypeScript and the queries compose like JS. We also wanted first-class support for the Postgres-specific features we use (e.g. `jsonb` for the `selected_generation_ids` array on `merges`).

### Why not a global state container on the frontend (Redux / Zustand)?

Server-state is dominant. TanStack Query handles caching, retries, and revalidation. Component-local state lives in `useState`. There's no global UI state to coordinate — modals, menus, etc. all live in their own components.

### Why 8-second clip cap?

Per PRD §8.2: matches Veo's hard maximum and gives uniform pricing/UX across all three providers. MiniMax technically supports 10s, but we round down to 6 (MiniMax's real option) and document it in the UI as "8s" to keep the marketing message simple.

### Why 3 hard daily cap for Hailuo?

MiniMax's coding plan only allows 3 generations/day. We enforce this as a **hard cap** (not soft) to prevent users from burning their budget in an hour. Veo is treated as **soft cap** because Google's pricing is metered per-second, not per-generation, and we want flexibility.

## Failure modes & mitigations

| Failure | Mitigation |
|---------|------------|
| Provider returns 5xx | `ProviderError.transient_failure` → BullMQ retries 3x with exponential backoff (5s, 10s, 20s) |
| Provider returns 429 | `ProviderError.rate_limited` → same retry policy |
| Provider rejects prompt for content policy | `ProviderError.content_rejected` → no retry, **refund quota** |
| Generation times out (>5 min) | Mark failed, refund quota, reset scene status |
| Worker crashes mid-job | BullMQ marks job as stalled, transfers to another worker, eventually retries |
| Worker can't reach S3 | Job retries 3x; if all fail, marks generation failed and refunds |
| S3 bucket deleted | `presignedDownloadUrl` returns 404; user can re-merge from stored generations |
| Postgres connection drops | `postgres` driver auto-reconnects with `max: 10, idle_timeout: 20` |
| Redis connection drops | BullMQ `maxRetriesPerRequest: null` (required); ioredis reconnects automatically |

## Performance characteristics

| Operation | p50 | p95 |
|-----------|-----|-----|
| `GET /auth/me` | 5ms | 15ms |
| `GET /projects` | 30ms | 80ms |
| `POST /scenes/:id/generations` | 100ms | 250ms (quota + insert + enqueue) |
| `GET /scenes/:id/generations` (history) | 20ms | 50ms |
| Generation (provider) | 15-30s | 60-90s |
| Merge (FFmpeg) | 3-8s for 4 scenes | 15-20s for 8 scenes |
| `POST /scenes/:id/captions` (Whisper) | 10-30s | 60s |

Concurrency:
- `GENERATION_CONCURRENCY=2` (env var, default 2) — respects provider rate limits
- `MERGE_CONCURRENCY=1` (default 1) — FFmpeg is CPU-bound
- `CAPTIONS_CONCURRENCY=2` (default 2) — Whisper API rate limit headroom

## Further reading

- [DEVELOPMENT.md](DEVELOPMENT.md) — local dev workflow
- [DEPLOYMENT.md](DEPLOYMENT.md) — production deploy
- [API.md](API.md) — full REST + WebSocket reference
- [ClipForge_PRD.md](../ClipForge_PRD.md) — the source PRD
- [Tasks.md](../Tasks.md) — the 48-task development tracker

---

Questions or feedback on the architecture? Open a [Discussion](https://github.com/techseria/clipforge/discussions) or email <hello@techseria.com>.