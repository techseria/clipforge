# Security Policy

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | ✅ Active          |
| < 1.0   | ❌ End-of-life     |

## Reporting a vulnerability

**Please do not file a public issue.** ClipForge takes security seriously and we
appreciate your help in disclosing vulnerabilities responsibly.

### How to report

Email **<security@techseria.com>** with:

- A clear description of the vulnerability
- Steps to reproduce (or a PoC)
- The impact and your assessment of severity
- Your name / handle (optional, for the security acknowledgments)

You can also use GitHub's [private vulnerability reporting](https://github.com/techseria/clipforge/security/advisories/new)
if you prefer not to use email.

### What to expect

| Stage | Time |
|-------|------|
| Acknowledgement of your report | within 48 hours |
| Initial triage and severity assessment | within 5 business days |
| Patch development and release (for critical) | within 7 days |
| Patch development and release (for high) | within 30 days |
| Public disclosure (coordinated with you) | after the fix ships |

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure) — please give us a reasonable window before public disclosure.

## Security advisories

Past advisories are published at
[github.com/techseria/clipforge/security/advisories](https://github.com/techseria/clipforge/security/advisories).
Subscribe to "Watch → Custom → Security alerts" on the GitHub repo to be notified of new advisories.

## Hardening guidance for self-hosters

ClipForge is a self-hosted single-tenant application. The following are baseline
hardening practices you should apply in any production deployment:

### Secrets management

- **Never commit `.env` to git.** The repo's `.gitignore` excludes it, but double-check your fork.
- **Use a secrets manager** (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager, Doppler, etc.) for production credentials.
- **Rotate** the `JWT_SECRET` regularly (at least quarterly); the API uses it for session signing.
- **Rotate provider API keys** (Gemini, MiniMax, OpenAI) when team members with access leave.

### Database

- **Use a managed Postgres** (Neon, Supabase, AWS RDS, Google Cloud SQL) with TLS enabled. Self-host only if you have a DBA.
- **Use a non-superuser role** for the application. The schema in `packages/db/src/schema.ts` only needs DML privileges.
- **Enable connection pooling** (PgBouncer, Neon Pooler) for high-traffic deployments.
- **Back up nightly** with point-in-time recovery; the `generations` table is large and important for audit.

### Object storage

- **Private buckets only** — no public ACLs.
- **Use presigned URLs** for all client-side access (already enforced via `@aws-sdk/s3-request-presigner`).
- **Enable bucket versioning** for accidental-deletion recovery.
- **Enable server-side encryption** (SSE-S3 or SSE-KMS) on the bucket.

### Network

- **Run behind a reverse proxy** (nginx, Caddy, Cloudflare) with TLS termination.
- **Set strict CSP headers** — the API already uses `helmet` with defaults; the web app's nginx config should add a strict CSP.
- **Restrict CORS** to your web origin (`WEB_ORIGIN` env var).
- **Run Redis with `requirepass`** in production; never expose it on a public network.
- **Block the admin endpoints** (`/api/v1/admin/*`) at the network layer if running on a private VPC.

### Auth

- **Change the default admin password** after first login. The first-run bootstrap writes `Admin@123`; rotate immediately.
- **Use HTTPS** for all traffic. The session cookie is `Secure` in production.
- **Consider adding MFA** (TOTP) for admin accounts — see [issue #42](https://github.com/techseria/clipforge/issues/42) for the roadmap item.

### Container security

- **Use the official Docker images** at `ghcr.io/techseria/clipforge-{api,worker,web}:v<x.y.z>`.
- **Scan images regularly** with `trivy`, `grype`, or your registry's built-in scanner.
- **Run as non-root** in production. The Dockerfiles in this repo use the default `node` user; tighten with `USER 1001` for production.
- **Set `--read-only` filesystem** on the API/worker containers where possible.
- **Use Docker secrets** (or a sidecar like Vault Agent) instead of env vars in compose files.

### Audit

- **Review the `audit_log` table regularly** for unexpected `user.create`, `admin.role_change`, or bulk generation events.
- **Enable Postgres connection logging** to a SIEM.
- **Subscribe to GitHub security advisories** for all dependencies listed in [NOTICE](NOTICE). The `npm audit` and `pnpm audit` commands should be part of your CI.

## Security advisories from dependencies

We monitor the following sources and patch promptly:

- [GitHub Security Advisories](https://github.com/advisories) (via Dependabot)
- [npm audit](https://docs.npmjs.com/cli/commands/audit) on every CI build
- Provider-specific advisories from Google Cloud, MiniMax, AWS, and Cloudflare

Run `pnpm audit` locally to see current advisories for the dependency tree.

## Hall of fame

We thank the following researchers for responsible disclosures (alphabetical):

*No advisories yet — your name could be the first.*

---

For questions about this policy, contact <security@techseria.com>.