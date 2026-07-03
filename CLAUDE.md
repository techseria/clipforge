# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**ClipForge** — an AI video generation platform for marketers. Users describe a project in plain language, break it into scenes, and the platform generates 8-second AI video clips per scene using interchangeable models (Google Gemini Veo Pro/Flash, MiniMax Hailuo 2.3), then merges them into a single MP4. Single-tenant deployment, AGPL-3.0 licensed.

V1 is shipped; full PRD lives in `ClipForge_PRD.md`, task tracker in `Tasks.md` (48/48 done).

## Architecture

pnpm monorepo. Three apps + four shared packages.

```
apps/
  api/      Express REST + WebSocket /ws/jobs (~3500 LOC)
  worker/   BullMQ workers — generation, merge (FFmpeg), captions (Whisper)
  web/      React 18 + Vite SPA, TanStack Router/Query, Tailwind
packages/
  shared/     Zod schemas, provider constants, quota service, ApiError class
  providers/  VideoProvider interface + Veo Pro/Flash, Hailuo implementations
  storage/    S3-compatible helpers (MinIO / S3 / R2)
  db/         Drizzle ORM schema + client + migrations + bootstrap
infra/        Prometheus, Grafana, Promtail, Loki configs
```

### Key boundaries
- `packages/*` is **shared code only** — no Express, no React, no Node-only APIs.
- `apps/api` and `apps/worker` are server-side; they can share via `packages/*` but never `import` directly across apps.
- `apps/web` is client-side only — Vite + React, no Node imports.

### How a generation flows
1. React → `POST /api/v1/scenes/:id/generations` (Express).
2. API: `requireAuth` → Zod parse → `enforceQuota` (Redis-backed counter in `usage_counters`) → transactional INSERT into `generations` + `usage_counters` + status flip on `scenes` → enqueue BullMQ job (`gen-${generationId}`, attempts=3, exponential backoff).
3. Worker (`generation-worker.ts`): picks up job, calls `provider.generate()` → polls `provider.checkStatus()` every 7s up to 5min → downloads asset, uploads to S3, updates rows. On failure: **refund quota** (mirrors MiniMax no-charge policy).
4. Worker publishes to Redis pub/sub channel `job-events` → API fans out via WebSocket `/ws/jobs` → browser updates scene status live.

### `VideoProvider` abstraction (`packages/providers/src/types.ts`)
```ts
interface VideoProvider {
  readonly id: ProviderId;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  checkStatus(providerJobId: string): Promise<CheckStatusResponse>;
  cancel(providerJobId: string): Promise<void>;
}
```
Three implementations: `VeoFlashProvider`, `VeoProProvider` (subclass of flash), `HailuoProvider`. Provider-specific quirks (e.g. MiniMax requires `duration: 6`, Veo file-URLs need API key appended) are normalized here — the API and worker never see provider-specific shapes. **Model IDs and per-provider config live in the `provider_config` DB table**, not env vars — admins can rotate them at runtime (per PRD §19 risk mitigation).

### Database (Drizzle ORM, Postgres 16)
11 tables in `packages/db/src/schema.ts`: `users`, `sessions`, `projects`, `scenes`, `generations`, `merges`, `usage_counters`, `audit_log`, `provider_config`, `music_tracks`, `caption_segments`, `analytics_daily`. ERD in `docs/ARCHITECTURE.md`.

## Commands

All commands run from repo root. pnpm 8+ required; engines pinned to Node 20.10+.

### Install + setup
```bash
pnpm install
cp .env.example .env          # set DATABASE_URL, REDIS_URL, GEMINI_API_KEY, MINIMAX_API_KEY, JWT_SECRET
docker compose up -d postgres redis     # infra only (or `docker compose up -d` for full stack w/ observability)
pnpm db:migrate                          # apply Drizzle migrations
pnpm --filter @clipforge/db bootstrap    # create first admin if users table empty
```

### Daily dev
```bash
pnpm dev                                   # API + worker + web via concurrently
pnpm --filter @clipforge/api dev           # API only (tsx watch)
pnpm --filter @clipforge/worker dev        # worker only
pnpm --filter @clipforge/web dev           # Vite only (fastest HMR)
docker compose logs -f api                 # tail API logs
```

### Service URLs (dev)
| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API (REST + WS) | http://localhost:4000 |
| API health | http://localhost:4000/health |
| Postgres | localhost:5432 (`clipforge`/`clipforge_dev`) |
| Redis | localhost:6379 |
| Grafana | http://localhost:3000 (anonymous viewer) |
| Prometheus | http://localhost:9090 |
| First admin | `admin@clipforge.local` / `Admin@123` |

### Verification (run before opening a PR — matches CI)
```bash
pnpm typecheck       # all workspaces, zero errors
pnpm lint            # all workspaces
pnpm test            # vitest suites
pnpm build           # tsc + Vite build across workspaces
```

### Database workflow
```bash
# After editing packages/db/src/schema.ts:
pnpm --filter @clipforge/db generate      # generate migration from schema diff
pnpm --filter @clipforge/db migrate       # apply pending migrations
pnpm --filter @clipforge/db studio        # Drizzle Studio (visual DB browser)
pnpm --filter @clipforge/db bootstrap     # idempotent admin creation
```

### Tests
Tests live next to code (`__tests__/` colocated). Use `vitest` + `supertest`. The API tests require Postgres + Redis to be running (`docker compose up -d`).
```bash
pnpm --filter @clipforge/api test         # one workspace
pnpm --filter @clipforge/api test:watch   # vitest watch mode (when added)
```

## Conventions (from CONTRIBUTING.md)

- **TypeScript strict** is on (`tsconfig.base.json`); justify any `any`. Prefer `unknown` at API boundaries; narrow with Zod.
- **Commits** follow Conventional Commits: `feat(api): …`, `fix(worker): …`, etc.
- **Branches**: `feature/<name>`, `fix/<name>`, `docs/<name>`.
- **Schema changes**: edit `packages/db/src/schema.ts`, run `pnpm --filter @clipforge/db generate`, commit the generated SQL — never hand-edit migrations.
- **API errors**: throw `ApiError` (in `packages/shared/src/api-error.ts`), handled centrally in `apps/api/src/middleware/error-handler.ts`. Don't `throw new Error()` in business logic.
- **Zod** validates every `body`/`query`/`params` in the API; the same schemas generate the OpenAPI in `docs/API.md`.

## Important design notes

- **Session cookies, not JWT** — `clipforge_session` httpOnly, SameSite=Lax, 30-day TTL, argon2id hashes. Simpler for browser SPAs, revocable server-side.
- **Quota**: Veo Pro 10/day soft, Veo Flash 20/day soft, Hailuo **3/day hard** (MiniMax coding-plan limit). Enforced in `packages/shared/src/quota.ts`; refunded on failure.
- **8s clip cap**: matches Veo's max; Hailuo only supports 6s/10s so we send 6 and label "8s" in UI.
- **Worker concurrency** (env vars, defaults): `GENERATION_CONCURRENCY=2`, `MERGE_CONCURRENCY=1` (FFmpeg is CPU-bound), `CAPTIONS_CONCURRENCY=2`.
- **BullMQ retry policy**: 3 attempts, exponential backoff (5s/10s/20s). Content-policy rejections → no retry, quota refund. Transient 5xx / 429 → retry.
- **WebSocket auth**: `/ws/jobs` reuses the session cookie — no separate handshake.

## Gotchas

- **MiniMax base URL**: must be `https://api.minimax.io` (not `api.minimax.chat` — that's the redirect target and 404s the API).
- **Veo**: drop `personGeneration: 'allow_adult'` from requests — current endpoint rejects it.
- **Hailuo duration**: only 6s or 10s accepted; we send 6s.
- **`@clipforge/db/schema` imports**: require the `exports` subpath in `packages/db/package.json` (it's there — don't regress it).
- **Real provider keys**: replace `dev_placeholder` env values in docker-compose before testing generations; otherwise API calls return auth errors.

## Where to look first

| If you're working on… | Start at |
|---|---|
| A new API endpoint | `apps/api/src/routes/<file>.ts` + Zod schema in `packages/shared/src/` |
| A new provider | `packages/providers/src/` — implement `VideoProvider` |
| A new worker / queue | `apps/worker/src/` for consumer, `apps/api/src/queues/` for producer |
| DB schema | `packages/db/src/schema.ts` (single file) |
| Frontend page | `apps/web/src/pages/` + `apps/web/src/api.ts` |
| Quota logic | `packages/shared/src/quota.ts` |
| WebSocket events | `apps/api/src/ws/jobs.ts` + `apps/worker/src/queue.ts` (publisher) |
| Observability | `infra/prometheus/`, `infra/grafana/dashboards/clipforge.json` |