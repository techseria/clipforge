# Development Guide

> How to set up ClipForge for local development, run tests, and debug.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 20+ | Use `nvm` or `fnm` to manage. Tested on Node 20.19 / 22.23. |
| **pnpm** | 8+ | `npm i -g pnpm` |
| **Docker** | 24+ | for Postgres, Redis, MinIO |
| **Docker Compose** | v2 | included with Docker Desktop |
| **FFmpeg** | 4.4+ | only needed if you run the worker locally (not in Docker) |
| **Git** | 2.30+ | for submodule / hooks |

A `git-lfs` install is **not** required (we don't store large assets in the repo).

## First-time setup

```bash
# 1. Fork & clone
git clone https://github.com/<your-fork>/clipforge.git
cd clipforge

# 2. Install workspace dependencies
pnpm install

# 3. Start infrastructure (Postgres, Redis, MinIO)
docker compose up -d postgres redis minio
# Optionally: docker compose up -d  for the full observability stack
#             (Prometheus, Grafana, Loki, Promtail)

# 4. Configure environment
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgres://clipforge:clipforge_dev@localhost:5432/clipforge
#   REDIS_URL=redis://localhost:6379
#   S3_ENDPOINT=http://localhost:9000
#   S3_BUCKET=clipforge-clips
#   S3_ACCESS_KEY=clipforge
#   S3_SECRET_KEY=clipforge_dev
#   GEMINI_API_KEY=...
#   MINIMAX_API_KEY=...

# 5. Apply schema migrations (Drizzle)
pnpm db:migrate

# 6. Bootstrap the first admin (only runs if users table is empty)
pnpm --filter @clipforge/db bootstrap
# Default credentials: admin@clipforge.local / Admin@123
# IMPORTANT: change the password after first login in any non-dev environment

# 7. Start the dev stack
pnpm dev
# - API:     http://localhost:4000  (health: /health)
# - Worker:  separate process, logs to stdout
# - Web:     http://localhost:5173  (Vite dev server with HMR)
```

Open http://localhost:5173 and log in.

## Running individual services

```bash
# API only
pnpm --filter @clipforge/api dev

# Worker only
pnpm --filter @clipforge/worker dev

# Web only
pnpm --filter @clipforge/web dev

# Vite alone (faster HMR)
cd apps/web && pnpm dev
```

## Running the full Docker stack

```bash
docker compose up -d
# API → :4000  Worker (logs)  Web → :5173
# Postgres → :5432  Redis → :6379  MinIO → :9000 (console :9001)
# Prometheus → :9090  Grafana → :3000  Loki → :3100
```

The first boot applies migrations and bootstraps the admin user via the API's
`runBootstrap()` on startup (see `apps/api/src/bootstrap.ts`).

## Project layout

```
clipforge/
├── apps/
│   ├── api/        Express REST + WebSocket /ws/jobs
│   ├── worker/     BullMQ workers (generation, merge, captions)
│   └── web/        React + Vite SPA
├── packages/
│   ├── shared/     Zod schemas, constants, quota service
│   ├── providers/  VideoProvider interface + Veo / Hailuo implementations
│   ├── storage/    S3-compatible helpers (MinIO / S3 / R2)
│   └── db/         Drizzle ORM schema + client
├── infra/          Prometheus / Grafana / Promtail / Promtail config
├── docs/            Architecture / API / deployment / dev guides
├── .github/         Issue templates, PR template, workflows, CODEOWNERS
├── docker-compose.yml
├── ClipForge_PRD.md # the source PRD
├── Tasks.md         # the 48-task tracker (48/48 done for V1)
└── CHANGELOG.md
```

## Useful commands

```bash
# ─── Type checking ──────────────────────────────────────────────────────
pnpm typecheck                           # all workspaces
pnpm --filter @clipforge/api typecheck   # one workspace

# ─── Lint ───────────────────────────────────────────────────────────────
pnpm lint

# ─── Tests ──────────────────────────────────────────────────────────────
pnpm test                                 # all vitest suites
pnpm --filter @clipforge/api test         # API smoke tests
pnpm --filter @clipforge/api test:watch  # watch mode

# ─── Build ─────────────────────────────────────────────────────────────
pnpm build                                # typecheck + tsc for all packages
pnpm --filter @clipforge/web build        # Vite production build

# ─── Database ──────────────────────────────────────────────────────────
pnpm --filter @clipforge/db generate      # generate migration from schema
pnpm --filter @clipforge/db migrate       # apply migrations
pnpm --filter @clipforge/db studio        # Drizzle Studio (visual DB browser)
pnpm --filter @clipforge/db bootstrap     # create initial admin (idempotent)

# ─── Docker ────────────────────────────────────────────────────────────
docker compose up -d                      # start full stack
docker compose logs -f api                # tail API logs
docker compose down                       # stop everything
docker compose down --volumes             # stop + delete data (nuclear)
```

## Testing

The repo currently has a minimal test suite. We use **vitest** for unit/integration and (for V2) **playwright** for E2E browser tests.

### Running the existing tests

```bash
pnpm --filter @clipforge/api test
# Runs: apps/api/src/__tests__/auth.test.ts
# Requires: docker compose up -d (the tests connect to the real DB)
```

### Writing a new test

Tests live next to the code they test:

```
apps/api/src/routes/auth.ts
apps/api/src/routes/__tests__/auth.test.ts      ← colocated
```

Use `supertest` for HTTP, `vitest` for assertions. Example:

```ts
// apps/api/src/routes/__tests__/projects.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index';

describe('projects', () => {
  let cookie: string;

  beforeAll(async () => {
    // Register a test user and capture the session cookie
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `test-${Date.now()}@example.com`, password: 'correct-horse' });
    cookie = res.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
  });

  it('creates a project', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ title: 'Test', globalStylePrompt: '' });
    expect(res.status).toBe(201);
    expect(res.body.project.title).toBe('Test');
  });
});
```

## Debugging tips

### API

- **Logs** go to stdout in JSON (pino) — set `LOG_LEVEL=debug` for verbose
- **Request IDs** — every response has `x-request-id`; grep logs for it to trace a request across services
- **Auth issues** — verify the `clipforge_session` cookie is set in the browser; curl `-c cookies.txt` to capture
- **DB issues** — `pnpm --filter @clipforge/db studio` for a visual browser

### Worker

- Worker logs to stdout with `service: clipforge-worker`
- Each BullMQ job has a `jobId` (we use `gen-${generationId}` / `merge-${mergeId}` / `captions-${generationId}`); grep for that
- Stuck jobs: `redis-cli LRANGE bull:generation:stalled 0 -1`

### Web

- **Vite proxy**: `/api/*` and `/ws/*` are proxied to `:4000`. If something 404s unexpectedly, check `apps/web/vite.config.ts`.
- **React Query DevTools**: enabled in dev mode (small icon in the corner). Open it to see the full query state.
- **Browser console**: every log includes the `x-request-id` header so you can correlate with API logs.

### Provider calls

To debug a generation, manually submit a request:

```bash
# Veo
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning?key=$GEMINI_API_KEY" \
  -H "content-type: application/json" \
  -d '{"instances":[{"prompt":"A calm blue wave across a plant floor"}],"parameters":{"sampleCount":1,"aspectRatio":"16:9"}}'

# MiniMax
curl -X POST "https://api.minimax.io/v1/video_generation" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"MiniMax-Hailuo-2.3","prompt":"A calm blue wave across a plant floor","duration":6,"resolution":"768P","prompt_optimizer":true,"aigc_watermark":true}'
```

Then poll the returned `task_id` / operation name with the same API.

## Pre-PR checklist

Before opening a PR, run all the checks CI will run:

```bash
pnpm typecheck   # must pass with zero errors
pnpm lint        # must pass with zero errors (when configured)
pnpm test        # all tests must pass
pnpm build       # production build must succeed
```

If you added a DB schema change, also run:

```bash
pnpm --filter @clipforge/db generate
# Commit the new migration file
```

## Common issues

### `ECONNREFUSED 127.0.0.1:5432` at startup

The Postgres container isn't running. Start it:
```bash
docker compose up -d postgres
```

### `Cannot find module '@clipforge/db/schema'`

The `exports` field in `packages/db/package.json` is missing the subpath. It should include:
```json
"exports": {
  ".": "./src/index.ts",
  "./schema": "./src/schema.ts"
}
```

### Provider key returns `invalid api key` (MiniMax)

Make sure you're using the `https://api.minimax.io` base URL — not `api.minimax.chat` (which is the redirect target and returns 404 for the API).

### Veo rejects with `personGeneration: 'allow_adult'`

The current Veo endpoint doesn't accept this field. Remove it from the request body (already done in `VeoFlashProvider.generate`).

### Hailuo rejects with `does not support duration 8s`

Hailuo only supports 6s or 10s. The provider uses 6s regardless of the UI's 8s caption. (Documented limitation; see `packages/providers/src/hailuo.ts`.)

## See also

- [CONTRIBUTING.md](../CONTRIBUTING.md) — code style, PR process
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design
- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment
- [API.md](API.md) — REST + WebSocket reference
- [ClipForge_PRD.md](../ClipForge_PRD.md) — the source PRD
- [Tasks.md](../Tasks.md) — 48-task development tracker

---

Questions? Open a [Discussion](https://github.com/techseria/clipforge/discussions) or email <hello@techseria.com>.