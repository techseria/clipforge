# Contributing to ClipForge

Thank you for your interest in ClipForge! 🎉

This document explains how to set up a development environment, propose changes, and submit pull requests. By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [How can I contribute?](#how-can-i-contribute)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Coding conventions](#coding-conventions)
- [Commit & PR guidelines](#commit--pr-guidelines)
- [Release process](#release-process)
- [Getting help](#getting-help)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Report unacceptable behavior to <conduct@techseria.com>.

## How can I contribute?

### 1. Report bugs

Open an issue using the **Bug Report** template. Include:

- ClipForge version (commit SHA or release tag)
- Operating system, Node.js version, Docker version
- Repro steps, expected vs actual behavior
- Relevant logs (with `LOG_LEVEL=debug` for verbose output)
- Screenshots or screen recordings if UI-related

### 2. Suggest features

Open an issue using the **Feature Request** template. Briefly describe:

- The problem the feature would solve
- Your proposed solution (any shape — code, mockup, paragraph)
- Alternatives you considered
- Whether you'd like to implement it yourself

### 3. Improve documentation

Docs live alongside the code as Markdown:

- `/README.md` — top-level overview
- `/docs/ARCHITECTURE.md` — system design
- `/docs/DEVELOPMENT.md` — local dev workflow
- `/docs/DEPLOYMENT.md` — production deploy
- `/docs/API.md` — REST + WebSocket reference
- Inline JSDoc on every exported function in `apps/*/src/**/*.ts` and `packages/*/src/**/*.ts`

Small fixes (typos, broken links, clearer wording) are very welcome. Open a PR directly — no issue needed.

### 4. Write code

Before opening a non-trivial PR:

1. Check [open issues](https://github.com/techseria/clipforge/issues) for related discussions.
2. If none exist, open an issue describing what you want to change and **wait for a maintainer's response** before investing significant time. This avoids wasted effort on changes we'd decline.
3. Small bug fixes (1-2 files, <100 lines) are usually fine to send directly as a PR.

## Development setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | Use `nvm` or `fnm` to manage |
| pnpm | 8+ | `npm i -g pnpm` |
| Docker | 24+ | for Postgres + Redis + MinIO |
| FFmpeg | 4.4+ | only needed for the merge worker |

### First-time setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-fork>/clipforge.git
cd clipforge

# 2. Install workspace dependencies
pnpm install

# 3. Start infrastructure (Postgres, Redis, MinIO)
docker compose up -d postgres redis minio

# 4. Copy environment template
cp .env.example .env
# edit .env — at minimum set DATABASE_URL, REDIS_URL, and S3_* vars

# 5. Apply schema migrations (uses DATABASE_URL from .env)
pnpm db:migrate

# 6. Bootstrap the first admin user (only runs if users table is empty)
pnpm --filter @clipforge/db bootstrap

# 7. Start the dev stack
pnpm dev
# - API:   http://localhost:4000  (health: /health)
# - Worker: separate process, logs to stdout
# - Web:   http://localhost:5173
```

Open http://localhost:5173 and log in as `admin@clipforge.local` / `Admin@123`.

### Running individual services

```bash
# API only (with hot reload)
pnpm --filter @clipforge/api dev

# Worker only
pnpm --filter @clipforge/worker dev

# Web only
pnpm --filter @clipforge/web dev
```

### Verifying your changes

Before submitting a PR:

```bash
# Typecheck every workspace
pnpm typecheck

# Lint
pnpm lint

# Run unit tests
pnpm test

# Build all packages (catches bundler issues)
pnpm build
```

The CI workflow at `.github/workflows/ci.yml` runs the same checks on every PR.

## Project layout

This is a pnpm monorepo. See [/docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a deep dive.

```
clipforge/
├── apps/
│   ├── api/        Express REST + WebSocket /ws/jobs
│   ├── worker/     BullMQ workers (generation, merge, captions)
│   └── web/        React + Vite SPA
├── packages/
│   ├── shared/     Zod schemas, constants, quota service (cross-workspace)
│   ├── providers/  VideoProvider interface + Veo / Hailuo implementations
│   ├── storage/    S3-compatible helpers (MinIO / S3 / R2)
│   └── db/         Drizzle ORM schema + client
├── infra/          Prometheus / Grafana / Promtail config
├── docker-compose.yml
└── docs/            Architecture / API / deployment / dev guides
```

Key rules:

- `packages/*` is **shared code only** — no Express, no React, no Node-only APIs
- `apps/api/` and `apps/worker/` are **server-side only** — they can import each other through `packages/*` but not directly (`apps/worker` must not `import { ... } from '../../apps/api/src/...'`)
- `apps/web/` is **client-side only** — uses Vite + React; no Node-specific imports

If you're unsure where a piece of code should live, open an issue and ask.

## Coding conventions

### TypeScript

- Strict mode is on (see `tsconfig.base.json`); `any` should be justified in a comment
- Prefer `unknown` over `any` at API boundaries; narrow with Zod
- Use `Result<T, E>` patterns or explicit error types instead of `throw new Error('...')` in business logic (the API layer uses a typed `ApiError` class — see `apps/api/src/middleware/error-handler.ts`)
- JSDoc on every exported function; inline comments for non-obvious logic

### Formatting

- 2-space indentation, no tabs
- Single quotes for strings, double quotes for JSX attributes
- Trailing commas in multi-line literals
- 100-char line limit

Run `pnpm format` (when available) before committing.

### Naming

- `camelCase` for variables and functions
- `PascalCase` for types, classes, React components
- `UPPER_SNAKE_CASE` for constants
- File names match their primary export (`UserService.ts`, not `service.ts`)

### Database

- Schema lives in `packages/db/src/schema.ts` as Drizzle definitions
- Generate migrations with `pnpm --filter @clipforge/db generate` after schema changes
- Never edit the generated SQL by hand — regenerate
- New tables must have `id` (serial), `created_at`, `updated_at`; soft deletes are opt-in via a `deleted_at` column

### Tests

- Unit tests in `__tests__/` next to the code they test (e.g., `apps/api/src/routes/__tests__/auth.test.ts`)
- Integration tests in `tests/integration/`
- Use `vitest`. Use `supertest` for HTTP, `playwright` for browser
- Aim for 80%+ coverage on `packages/*` and `apps/api/src/services/`

## Commit & PR guidelines

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat` · `fix` · `docs` · `style` · `refactor` · `test` · `chore`

Examples:
```
feat(api): add /admin/users/:id/role endpoint
fix(worker): reset scene.status on generation failure
docs(readme): clarify first-run admin credentials
chore(deps): bump drizzle-orm to 0.31.0
```

### Branches

- `main` is the stable branch
- `feature/<short-name>` for new work
- `fix/<short-name>` for bug fixes
- `docs/<short-name>` for documentation-only changes

### Pull requests

- Use the **PR template** at `.github/PULL_REQUEST_TEMPLATE.md` (auto-populated)
- Keep PRs focused — one logical change per PR
- Reference any related issue: `Closes #123` or `Refs #456`
- Include a short summary of the change, a test plan, and screenshots for UI changes
- All CI checks must pass; a maintainer will review within 3 business days

### Review process

- A maintainer will be auto-assigned via `.github/CODEOWNERS`
- Expect 1-3 rounds of review on non-trivial PRs
- Maintainers may ask for rebase, additional tests, or doc updates
- Once approved, a maintainer will squash-merge and add the PR to the changelog

## Release process

Maintainers only. See [/docs/RELEASING.md](docs/RELEASING.md) for the full procedure. Short version:

1. Update `CHANGELOG.md` with the new version
2. Bump version in `package.json` files (use `pnpm -r version <x.y.z>`)
3. Tag: `git tag -a v<x.y.z> -m "..."`
4. Push: `git push origin main --tags`
5. GitHub Action builds and publishes Docker images to `ghcr.io/techseria/clipforge-{api,worker,web}:v<x.y.z>`

## Getting help

- 💬 [GitHub Discussions](https://github.com/techseria/clipforge/discussions) — questions, ideas, show-and-tell
- 🐛 [GitHub Issues](https://github.com/techseria/clipforge/issues) — bug reports, feature requests
- 📧 Email the maintainers at <maintainers@techseria.com> (for private inquiries only)

---

Thanks again for contributing. Every bug report, doc fix, and PR makes ClipForge better for the next person. ⚡

— **Techseria Engineering**