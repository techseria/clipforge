# Deployment Guide

> Production deployment of ClipForge. Covers Docker Compose, Kubernetes, and bare-metal.

## Architecture reminder

ClipForge has three long-running processes:

| Process | Description | Recommended host |
|---------|-------------|------------------|
| **API** | Express HTTP + WebSocket | Public-facing behind reverse proxy |
| **Worker** | BullMQ consumer + FFmpeg | Same network as API, can access S3 + AI providers |
| **Web** | Vite-built static SPA | CDN / object storage + CDN |

Plus external dependencies:

| Service | Required | Recommended |
|---------|----------|-------------|
| PostgreSQL 16+ | ✅ | Neon, Supabase, AWS RDS, or self-hosted |
| Redis 7+ | ✅ | Upstash, AWS ElastiCache, or self-hosted |
| S3-compatible storage | ✅ | AWS S3, Cloudflare R2, Backblaze B2, or MinIO |
| SMTP server (optional) | ❌ | only needed if you extend the auth flow |
| AI provider accounts | ✅ | Google AI Studio (Veo) + MiniMax (Hailuo) |

## Pre-flight checklist

- [ ] Domain name + TLS certificate (Let's Encrypt or managed)
- [ ] Reverse proxy (nginx, Caddy, or Cloudflare) in front of API and Web
- [ ] Database connection (TLS, pooling enabled)
- [ ] Redis connection (TLS, password auth)
- [ ] S3 bucket created (private ACL, versioning enabled, SSE-KMS)
- [ ] All API keys stored in a secrets manager
- [ ] `JWT_SECRET` generated (32+ random bytes)
- [ ] `INITIAL_ADMIN_PASSWORD` set to something other than `Admin@123`
- [ ] Monitoring configured (Prometheus + Grafana)
- [ ] Backup strategy in place (nightly DB snapshots, S3 versioning)

## Option 1: Docker Compose (single VM)

Best for: small-to-medium teams, ≤100 active users, single-region.

### Server requirements

- Linux VM (Ubuntu 22.04 LTS or similar)
- 4 vCPU, 8 GB RAM, 100 GB SSD
- Docker 24+ and Docker Compose v2
- Public IPv4 + DNS A record pointing to it

### Deploy steps

```bash
# 1. Create the deploy user
sudo useradd -m -s /bin/bash clipforge
sudo usermod -aG docker clipforge
sudo -iu clipforge

# 2. Clone the repo
git clone https://github.com/techseria/clipforge.git
cd clipforge

# 3. Configure environment (use a secrets manager in production)
cat > .env <<EOF
DATABASE_URL=postgresql://clipforge:SECRET@db-host:5432/clipforge?sslmode=require
REDIS_URL=rediss://default:SECRET@redis-host:6379
JWT_SECRET=$(openssl rand -base64 48)
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_BUCKET=clipforge-prod-clips
S3_ACCESS_KEY=AKIA...
S3_SECRET_KEY=...
GEMINI_API_KEY=AIza...
MINIMAX_API_KEY=sk-cp-...
WEB_ORIGIN=https://clipforge.yourcompany.com
INITIAL_ADMIN_EMAIL=admin@yourcompany.com
INITIAL_ADMIN_PASSWORD=STRONG-RANDOM-PASSWORD
EOF
chmod 600 .env

# 4. Start the stack
docker compose up -d

# 5. Verify
curl https://clipforge.yourcompany.com/health
# {"status":"ok",...}
```

### Reverse proxy (Caddy)

Caddyfile:

```caddy
clipforge.yourcompany.com {
  reverse_proxy api:4000
  encode zstd gzip
  tls {
    issuer letsencrypt
  }
}

web.clipforge.yourcompany.com {
  root * /var/www/clipforge-web
  try_files {path} /index.html
  file_server
  encode zstd gzip
  tls {
    issuer letsencrypt
  }
}
```

If you want both API and web on the same origin (recommended for cookie sharing):

```caddy
clipforge.yourcompany.com {
  encode zstd gzip

  # API + WebSocket
  reverse_proxy /api/* api:4000
  reverse_proxy /ws/*  api:4000

  # Web SPA
  root * /var/www/clipforge-web
  try_files {path} /index.html
  file_server
}
```

### Backups

```bash
# Postgres nightly
pg_dump --format=custom --file=/backups/clipforge-$(date +%Y%m%d).dump \
  --no-owner --no-privileges $DATABASE_URL

# Keep 30 days
find /backups -name "clipforge-*.dump" -mtime +30 -delete
```

S3 versioning is enabled, so the bucket itself provides object-level recovery.

## Option 2: Kubernetes (production-grade)

Best for: medium-to-large teams, multi-region, autoscaling.

### Manifests

We don't ship Helm charts in V1.0; the recommended approach is to use the
Docker images directly. Sample manifests for each component:

```yaml
# k8s/api.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clipforge-api
spec:
  replicas: 2
  selector:
    matchLabels: { app: clipforge-api }
  template:
    metadata:
      labels: { app: clipforge-api }
    spec:
      containers:
        - name: api
          image: ghcr.io/techseria/clipforge-api:v1.0.0
          ports:
            - containerPort: 4000
          env:
            - { name: DATABASE_URL, valueFrom: { secretKeyRef: { name: clipforge-secrets, key: database-url } } }
            - { name: REDIS_URL,    valueFrom: { secretKeyRef: { name: clipforge-secrets, key: redis-url } } }
            - { name: JWT_SECRET,   valueFrom: { secretKeyRef: { name: clipforge-secrets, key: jwt-secret } } }
            - { name: GEMINI_API_KEY,   valueFrom: { secretKeyRef: { name: clipforge-secrets, key: gemini-key } } }
            - { name: MINIMAX_API_KEY,  valueFrom: { secretKeyRef: { name: clipforge-secrets, key: minimax-key } } }
            - { name: S3_BUCKET,    value: "clipforge-prod-clips" }
            - { name: S3_REGION,    value: "us-east-1" }
            - { name: WEB_ORIGIN,   value: "https://clipforge.yourcompany.com" }
          resources:
            requests: { cpu: "100m", memory: "256Mi" }
            limits:   { cpu: "1",    memory: "512Mi" }
          readinessProbe:
            httpGet: { path: /health, port: 4000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /health, port: 4000 }
            initialDelaySeconds: 15
            periodSeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: clipforge-api
spec:
  selector: { app: clipforge-api }
  ports:
    - port: 4000
      targetPort: 4000
```

```yaml
# k8s/worker.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clipforge-worker
spec:
  replicas: 2  # 2 workers = 2x concurrency per queue
  selector:
    matchLabels: { app: clipforge-worker }
  template:
    metadata:
      labels: { app: clipforge-worker }
    spec:
      containers:
        - name: worker
          image: ghcr.io/techseria/clipforge-worker:v1.0.0
          env:
            - { name: DATABASE_URL,   valueFrom: { secretKeyRef: { name: clipforge-secrets, key: database-url } } }
            - { name: REDIS_URL,      valueFrom: { secretKeyRef: { name: clipforge-secrets, key: redis-url } } }
            - { name: GEMINI_API_KEY, valueFrom: { secretKeyRef: { name: clipforge-secrets, key: gemini-key } } }
            - { name: MINIMAX_API_KEY, valueFrom: { secretKeyRef: { name: clipforge-secrets, key: minimax-key } } }
            - { name: S3_BUCKET, value: "clipforge-prod-clips" }
            - { name: S3_REGION, value: "us-east-1" }
            - { name: GENERATION_CONCURRENCY, value: "4" }
            - { name: MERGE_CONCURRENCY,      value: "2" }
          resources:
            requests: { cpu: "500m", memory: "512Mi" }
            limits:   { cpu: "2",    memory: "2Gi" }
          volumeMounts:
            - name: ffmpeg-tmp
              mountPath: /tmp
      volumes:
        - name: ffmpeg-tmp
          emptyDir: { sizeLimit: 5Gi }
```

```yaml
# k8s/web.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clipforge-web
spec:
  replicas: 2
  selector:
    matchLabels: { app: clipforge-web }
  template:
    metadata:
      labels: { app: clipforge-web }
    spec:
      containers:
        - name: web
          image: ghcr.io/techseria/clipforge-web:v1.0.0
          ports:
            - containerPort: 5173
          env:
            - { name: VITE_API_URL, value: "" }  # empty = same-origin via Ingress
          resources:
            requests: { cpu: "50m", memory: "64Mi" }
            limits:   { cpu: "200m", memory: "256Mi" }
---
apiVersion: v1
kind: Service
metadata:
  name: clipforge-web
spec:
  selector: { app: clipforge-web }
  ports:
    - port: 5173
      targetPort: 5173
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: clipforge
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: [clipforge.yourcompany.com]
      secretName: clipforge-tls
  rules:
    - host: clipforge.yourcompany.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend: { service: { name: clipforge-api, port: { number: 4000 } } }
          - path: /ws
            pathType: Prefix
            backend: { service: { name: clipforge-api, port: { number: 4000 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: clipforge-web, port: { number: 5173 } } }
```

## Environment variables

See [`.env.example`](../.env.example) for the full list. Most important:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string (TLS required in prod) |
| `REDIS_URL` | Redis connection string (TLS required in prod) |
| `JWT_SECRET` | Session cookie secret. **Rotate quarterly.** |
| `GEMINI_API_KEY` | Google AI Studio key (Veo access) |
| `MINIMAX_API_KEY` | MiniMax coding-plan key |
| `OPENAI_API_KEY` | (Optional) OpenAI key for Whisper captions (T5.3) |
| `S3_*` | S3-compatible storage credentials |
| `WEB_ORIGIN` | Public URL of the web frontend (CORS) |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | First-run admin credentials |

## Operations runbook

### Deploy a new release

```bash
# 1. Pull the new image
docker compose pull api worker web

# 2. Run migrations
docker compose run --rm api npx drizzle-kit migrate

# 3. Restart with zero-downtime (Compose v2)
docker compose up -d --no-deps --build api worker web

# Or with Kubernetes
kubectl rollout restart deployment/clipforge-api deployment/clipforge-worker deployment/clipforge-web
```

### Scale the worker

```bash
# Docker Compose
docker compose up -d --scale worker=4

# Kubernetes
kubectl scale deployment clipforge-worker --replicas=4
```

Each worker pod adds one concurrent slot per queue (set `GENERATION_CONCURRENCY` env to go higher per pod).

### Reset the admin password

```sql
-- Generate a new argon2id hash with the API's bootstrap script
UPDATE users SET password_hash = '<paste new hash>' WHERE email = 'admin@yourcompany.com';
```

Or use the API's forgot-password flow (V2).

### View live logs

```bash
# Docker Compose
docker compose logs -f --tail=100 api worker

# Kubernetes
kubectl logs -f deployment/clipforge-api
kubectl logs -f deployment/clipforge-worker
```

Logs are JSON-structured (pino). Pipe through `jq` for pretty output:

```bash
docker compose logs api | jq -r 'select(.level == 50) | .msg'
```

### Clear the BullMQ queue

If a queue is stuck and you want to reset:

```bash
# Show all queues
redis-cli KEYS 'bull:*'

# Drop the generation queue (loses pending jobs)
redis-cli DEL bull:generation:wait bull:generation:active bull:generation:delayed
```

Then in the API, the user can re-trigger generations.

### Restore from backup

```bash
# 1. Stop API + worker
docker compose stop api worker

# 2. Restore DB
pg_restore --clean --no-owner --no-privileges \
  --dbname=clipforge /backups/clipforge-20260702.dump

# 3. Restart
docker compose up -d api worker
```

## Performance tuning

### API

- Single Node process handles ~5k req/s; scale horizontally behind a load balancer
- Use a Redis connection pool (BullMQ auto-pools)
- Enable gzip on the reverse proxy (Caddy does this by default)

### Worker

- Concurrency is set per-provider (`GENERATION_CONCURRENCY=2` default) — respect your provider's rate limits
- FFmpeg merges are CPU-bound; size worker pods accordingly (`cpu: 2`, `memory: 2Gi`)
- `MERGE_CONCURRENCY=1` by default — set higher only if you have FFmpeg build with libvmaf / hardware acceleration

### Database

- Use managed Postgres (Neon, RDS) with connection pooling (PgBouncer or Neon Pooler)
- Add a partial index on `generations(scene_id, created_at DESC)` for fast history queries:

  ```sql
  CREATE INDEX IF NOT EXISTS generations_scene_id_created_at_idx
    ON generations (scene_id, created_at DESC);
  ```

### Redis

- Upstash / ElastiCache work great; use `rediss://` (TLS) in production
- Set `maxmemory-policy allkeys-lru` (default in most managed services)

## Backup strategy

| Asset | Frequency | Retention | Tool |
|-------|-----------|-----------|------|
| Postgres dump | Daily | 30 days | `pg_dump` + cron |
| Postgres WAL | Continuous | 7 days | managed service default |
| S3 objects | Continuous | Forever (versioning) | S3 Versioning |
| Redis (queue state) | None — ephemeral | n/a | n/a — can be reconstructed |

Test restores quarterly!

## High availability

- **Database**: managed service with HA replicas (Neon, RDS Multi-AZ)
- **Redis**: managed service with replicas (ElastiCache, Upstash); primary failover <30s
- **S3**: 11 nines of durability by design
- **Compute**: run 2+ API + 2+ worker pods across AZs
- **CDN** in front of web (CloudFront, Cloudflare)

The current design is single-region. For multi-region, the main consideration
is API latency vs provider location — pin workers to the region closest to
your AI provider (e.g. us-east-1 for both Gemini and MiniMax).

## Cost estimation (small team, ~50 users)

| Resource | Monthly cost |
|----------|-------------|
| Neon Postgres (Free tier) | $0 |
| Upstash Redis (10k ops/day) | $0–10 |
| S3 (100 GB storage + 1 TB egress) | $25 |
| 2x small VM (4 vCPU / 8 GB) | $50 |
| Gemini Veo (200 generations) | $40–80 |
| MiniMax Hailuo (90 generations @ 3/day × 30 days) | included in plan |
| Cloudflare Pro | $20 |
| **Total** | **~$135–185/month** |

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design
- [DEVELOPMENT.md](DEVELOPMENT.md) — local dev
- [API.md](API.md) — REST + WebSocket reference
- [SECURITY.md](../SECURITY.md) — security policy + hardening
- [RELEASING.md](RELEASING.md) — release process

---

Questions about deployment? Open a [Discussion](https://github.com/techseria/clipforge/discussions) or email <hello@techseria.com>.