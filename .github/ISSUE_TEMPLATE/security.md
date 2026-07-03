---
name: 🔒 Security report
about: Report a non-critical security issue
title: '[SECURITY] '
labels: ['type:security', 'status:triage']
assignees: []
---

> ⚠️ **For critical vulnerabilities, do NOT use this template.** Email <security@techseria.com> directly or use [GitHub's private vulnerability disclosure](https://github.com/techseria/clipforge/security/advisories/new) instead. Public issues can be seen by attackers before a fix is available.

## What is the issue?

A clear, factual description (no exploit code).

## Affected component(s)

- [ ] API (apps/api)
- [ ] Worker (apps/worker)
- [ ] Web frontend (apps/web)
- [ ] Database schema (packages/db)
- [ ] Storage helpers (packages/storage)
- [ ] Docker setup
- [ ] Documentation
- [ ] CI / GitHub workflows
- [ ] Other: ___

## Affected version(s)

- ClipForge version: (e.g. v1.0.0, commit SHA)
- Deployment method: (Docker Compose / Kubernetes / bare metal)

## Severity (your estimate)

- [ ] Critical (RCE, auth bypass, data loss)
- [ ] High (data exposure, privilege escalation)
- [ ] Medium (DoS, info disclosure of low-sensitivity data)
- [ ] Low (misconfiguration, hardening)
- [ ] Informational (best practice, no direct exploit)

## Suggested fix (optional)

If you have a proposed fix, link a draft PR or describe the change.

## Disclosure preferences

- [ ] I'd like to be credited in the security advisory
- [ ] I'd prefer to remain anonymous
- [ ] I'm willing to coordinate disclosure timing

---

A maintainer will reach out within 48h to acknowledge and coordinate.