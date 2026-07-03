# API Reference

> REST and WebSocket reference for ClipForge v1.0.
> All endpoints are under `/api/v1`. Authentication via `clipforge_session` httpOnly cookie.

> **Note:** This is a hand-curated reference. For the live Zod-validated schemas, see `packages/shared/src/index.ts`.

## Conventions

- **Base URL**: `https://<your-domain>/api/v1`
- **Content-Type**: `application/json` for all bodies
- **Auth**: All endpoints (except `/auth/register`, `/auth/login`, `/health`) require an authenticated session
- **Error shape**:
  ```json
  {
    "error": {
      "code": "quota_exceeded",
      "message": "Daily quota exceeded",
      "details": { ... }
    }
  }
  ```
- **IDs**: All IDs are integer primary keys
- **Timestamps**: ISO 8601 in UTC (e.g. `2026-07-03T15:30:00.000Z`)

## Machine-readable error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `unauthorized` | 401 | Not logged in or session expired |
| `forbidden` | 403 | Logged in but role lacks permission |
| `not_found` | 404 | Resource doesn't exist or isn't yours |
| `validation_error` | 400 | Request payload failed Zod validation |
| `quota_exceeded` | 429 | Daily quota hit (Hailuo is hard-capped at 3/day) |
| `content_rejected` | 400 | Provider refused the prompt for content policy |
| `provider_unavailable` | 503 | Provider API is down |
| `rate_limited` | 429 | Too many auth attempts |
| `internal_error` | 500 | Unhandled server error |

---

## Auth

### `POST /auth/register`

Create a new account.

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "jane@example.com",
  "password": "correct-horse-battery-staple",
  "displayName": "Jane Doe"  // optional
}
```

**Response 201**:
```json
{
  "user": { "id": 3, "email": "jane@example.com" }
}
```
Sets `clipforge_session` cookie (30-day TTL).

### `POST /auth/login`

Start a session.

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "jane@example.com", "password": "correct-horse-battery-staple" }
```

**Response 200**:
```json
{
  "user": { "id": 3, "email": "jane@example.com", "displayName": "Jane Doe" }
}
```

**Errors**:
- `401 unauthorized` — invalid credentials (rate-limited to 5 attempts/15min/IP)

### `POST /auth/logout`

End the current session.

**Response 200**:
```json
{ "ok": true }
```

### `GET /auth/me`

Get the current user.

**Response 200**:
```json
{
  "user": {
    "id": 3,
    "email": "jane@example.com",
    "displayName": "Jane Doe",
    "role": "editor"
  }
}
```

---

## Projects

### `GET /projects`

List the current user's projects (most recently updated first).

**Response 200**:
```json
{
  "projects": [
    {
      "id": 1,
      "title": "Q3 product launch teaser",
      "status": "draft",
      "thumbnailClipId": null,
      "sceneCount": 4,
      "createdAt": "2026-07-02T12:00:00.000Z",
      "updatedAt": "2026-07-03T09:30:00.000Z"
    }
  ]
}
```

### `POST /projects`

Create a new project. Editor or admin role required.

```http
POST /api/v1/projects
Content-Type: application/json

{
  "title": "Q3 product launch teaser",
  "globalStylePrompt": "cinematic, photorealistic, ..."
}
```

**Response 201**: full project object.

### `GET /projects/:id`

Get a project with all its scenes.

**Response 200**:
```json
{
  "project": { "id": 1, "title": "...", "globalStylePrompt": "...", ... },
  "scenes": [ { "id": 1, "position": 0, "prompt": "...", "status": "ready", ... } ]
}
```

### `PATCH /projects/:id`

Update title and/or global style. Editor or admin role required.

```http
PATCH /api/v1/projects/1
{ "title": "New title", "globalStylePrompt": "new style" }
```

### `DELETE /projects/:id`

Delete project + all its scenes + all generations. Editor or admin role required.

**Response 204**.

---

## Scenes

### `POST /projects/:projectId/scenes`

Add a scene. Editor or admin role required.

```http
POST /api/v1/projects/1/scenes
{
  "prompt": "A coffee cup steaming on a wooden desk...",
  "position": 0,
  "defaultModel": "gemini_veo_flash",
  "aspectRatio": "16:9",
  "promptOptimizerEnabled": true,
  "watermarkEnabled": true,
  "includeAudio": false,
  "transitionToNext": "cut"
}
```

**Response 201**: full scene object.

### `POST /projects/:projectId/scenes/reorder`

Reorder scenes. Pass the desired final order as an array of scene IDs.

```http
POST /api/v1/projects/1/scenes/reorder
{ "orderedIds": [3, 1, 2, 4] }
```

**Response 200**:
```json
{ "ok": true }
```

### `PATCH /scenes/:id`

Edit any scene field. Editor or admin role required.

```http
PATCH /api/v1/scenes/5
{ "prompt": "Updated prompt", "selectedGenerationId": 42 }
```

**Response 200**: full scene object.

### `DELETE /scenes/:id`

Delete scene + all its generations. Editor or admin role required.

**Response 204**.

---

## Generations

### `POST /scenes/:id/generations`

Enqueue a new generation for a scene. Atomic: validates quota, inserts row, increments counter, enqueues BullMQ job, all in one DB transaction. Editor or admin role required.

```http
POST /api/v1/scenes/5/generations
{
  "model": "minimax_hailuo_2_3",
  "promptOverride": "optional override",
  "referenceImageUrl": "optional S3 key"
}
```

**Response 202**:
```json
{
  "generationId": 99,
  "status": "queued",
  "message": "Generation enqueued. Subscribe to /ws/jobs for status updates."
}
```

**Errors**:
- `429 quota_exceeded` — Hailuo 3/day cap hit; quota is auto-refunded if generation fails
- `404 not_found` — scene doesn't exist or isn't yours

### `GET /scenes/:id/generations`

List all generation attempts for a scene, newest first.

**Response 200**:
```json
{
  "generations": [
    {
      "id": 99,
      "sceneId": 5,
      "provider": "minimax_hailuo_2_3",
      "status": "succeeded",
      "resultUrl": "clips/2/99.mp4",
      "durationSeconds": 6,
      "errorCode": null,
      "errorMessage": null,
      "createdAt": "2026-07-03T10:00:00.000Z"
    }
  ],
  "selectedGenerationId": 99
}
```

### `GET /generations/:id`

Get one generation.

**Response 200**:
```json
{ "generation": { ... } }
```

---

## Merges

### `POST /projects/:id/merge`

Enqueue a merge. Editor or admin role required.

```http
POST /api/v1/projects/1/merge
{
  "selectedGenerationIds": [99, 100, 101, 102],
  "musicTrackId": 7,         // optional
  "musicVolumeDb": -12,       // -30..0, default -12
  "captionsEnabled": true     // requires OPENAI_API_KEY
}
```

**Response 202**:
```json
{ "mergeId": 12, "status": "queued" }
```

### `GET /merges/:id`

Poll a merge's status.

**Response 200**:
```json
{
  "merge": {
    "id": 12,
    "projectId": 1,
    "status": "succeeded",
    "resultUrl": "https://s3..../merges/2/12.mp4?...",
    "totalDurationSeconds": 24,
    "createdAt": "...",
    "finishedAt": "..."
  }
}
```

The `resultUrl` is a **presigned URL** valid for 24 hours. Re-trigger the merge or copy the result to your own storage if you need it longer.

### `GET /projects/:id/merges`

List past merges for a project (newest first, max 50).

**Response 200**:
```json
{ "merges": [ ... ] }
```

---

## Uploads

### `POST /uploads/reference-image`

Upload a reference image (multipart). Used for image-to-video. Editor or admin role required.

```http
POST /api/v1/uploads/reference-image
Content-Type: multipart/form-data

file: <image bytes>  // jpg / png / webp, max 10 MB
```

**Response 201**:
```json
{ "key": "uploads/2/abc-123.jpg", "url": "/api/v1/uploads/uploads/2/abc-123.jpg" }
```

The returned `key` is what you set as `referenceImageUrl` on a scene.

---

## Music library

### `GET /music`

List music tracks (built-in + user's uploads).

**Response 200**:
```json
{
  "tracks": [
    { "id": 1, "title": "Upbeat Corporate", "artist": "Techseria Music", "durationSeconds": 120, "isBuiltIn": true }
  ]
}
```

### `POST /music/upload`

Upload a music track. Editor or admin role required.

```http
POST /api/v1/music/upload
Content-Type: multipart/form-data

file: <audio bytes>  // mp3 / wav / aac, max 50 MB
title: "My track"     // optional, falls back to filename
```

**Response 201**: full track object.

### `DELETE /music/:id`

Delete a user-uploaded track. Built-in tracks cannot be deleted.

---

## Captions

### `POST /generations/:id/captions`

Enqueue Whisper transcription. Requires `OPENAI_API_KEY` in the worker environment.

**Response 202**:
```json
{ "generationId": 99, "status": "queued" }
```

### `GET /generations/:id/captions`

List caption segments for a generation.

**Response 200**:
```json
{
  "captions": [
    { "id": 1, "generationId": 99, "startMs": 0, "endMs": 2400, "text": "MIRA plans your day" }
  ]
}
```

---

## Usage

### `GET /usage`

Today's quota per provider.

**Response 200**:
```json
{
  "usage": [
    { "provider": "gemini_veo_pro",     "remaining": 9, "limit": 10, "used": 1 },
    { "provider": "gemini_veo_flash",   "remaining": 20, "limit": 20, "used": 0 },
    { "provider": "minimax_hailuo_2_3", "remaining": 2, "limit": 3, "used": 1 }
  ]
}
```

---

## Analytics (admin or editor)

### `GET /analytics/summary?days=30`

Daily counts per provider for the last N days (default 30, max 365).

**Response 200**:
```json
{
  "days": 30,
  "byDateProvider": {
    "2026-07-03": {
      "minimax_hailuo_2_3": { "succeeded": 1, "failed": 0, "spend": 0.05 }
    }
  }
}
```

### `GET /analytics/most-regenerated`

Scenes with the most generation attempts (top 10, quality signal).

### `GET /analytics/spend-estimate`

Per-provider cost rollup (USD), derived from `generations.estimated_cost_usd`.

---

## Admin (admin role only)

### `GET /admin/users`

List all users.

### `PATCH /admin/users/:id/role`

```http
PATCH /api/v1/admin/users/3/role
{ "role": "editor" }  // or "viewer" or "admin"
```

---

## WebSocket

### `WS /ws/jobs`

Connect with the same session cookie. The server pushes `JobEvent` messages to the connected user whenever one of their jobs changes state.

**Client → server**: none (server doesn't accept messages on this socket)

**Server → client** (`JobEvent` union):

```ts
type JobEvent =
  | { type: 'generation.queued';     generationId: number; sceneId: number }
  | { type: 'generation.running';    generationId: number }
  | { type: 'generation.progress';   generationId: number; progress: number } // 0..1
  | { type: 'generation.succeeded';  generationId: number; resultUrl: string }
  | { type: 'generation.failed';     generationId: number; errorCode: string; errorMessage: string }
  | { type: 'merge.queued';          mergeId: number }
  | { type: 'merge.running';         mergeId: number; progress: number }
  | { type: 'merge.succeeded';       mergeId: number; resultUrl: string }
  | { type: 'merge.failed';          mergeId: number; errorMessage: string };
```

**Client example** (browser):

```ts
const ws = new WebSocket(`wss://${host}/ws/jobs`, { withCredentials: true });
ws.onmessage = (e) => {
  const evt = JSON.parse(e.data);
  // dispatch into your state store
};
```

If the WebSocket connection drops, fall back to polling `GET /generations/:id` or `GET /merges/:id` every 5s until reconnect.

---

## Rate limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 requests | per IP per 15 min |
| `POST /auth/register` | 10 requests | per IP per 15 min |
| All other endpoints | 600 requests | per IP per 15 min (recommended; not enforced in V1) |

When rate-limited, the response is `429` with `Retry-After` header.

---

## Webhooks (V2)

Not in V1.0. Roadmap item — see [ROADMAP.md](ROADMAP.md).

---

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design
- [DEVELOPMENT.md](DEVELOPMENT.md) — local dev
- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment
- [ClipForge_PRD.md](../ClipForge_PRD.md) — the source PRD
- [packages/shared/src/index.ts](../packages/shared/src/index.ts) — Zod schemas (source of truth)

---

Found a discrepancy? Open an issue or PR — this reference is auto-curated.