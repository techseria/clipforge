---
name: 🐛 Bug report
about: Something isn't working as expected
title: '[BUG] '
labels: ['type:bug', 'status:triage']
assignees: []
---

## Describe the bug

A clear and concise description of what the bug is.

## To reproduce

Steps to reproduce the behavior:

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected behavior

A clear and concise description of what you expected to happen.

## Screenshots / screen recordings

If applicable, add screenshots or a screen recording to help explain the problem.
Drag-and-drop images directly into the comment, or paste a link.

## Environment

Please complete the following information:

- **ClipForge version:** (run `git rev-parse HEAD` or check `/health`)
- **Deployment method:** Docker Compose / Kubernetes / bare metal
- **OS / distro:** (e.g. Ubuntu 22.04, macOS 14, Debian 12)
- **Node.js version:** (output of `node --version`)
- **Browser** (if UI issue): Chrome 124 / Firefox 122 / Safari 17 / …
- **Database:** Postgres 16 (Neon / RDS / self-hosted)
- **Redis:** 7.x

## Logs

```
Paste relevant logs here. Set LOG_LEVEL=debug for verbose output.
```

## Provider information (if generation-related)

- **Provider used:** Veo Pro / Veo Flash / Hailuo 2.3
- **Model ID:**
- **Quota remaining at time of issue:**
- **Error message from provider** (if any):

## Severity

- [ ] Blocker — can't use the app at all
- [ ] Critical — major feature broken
- [ ] Major — feature degraded but workaround exists
- [ ] Minor — cosmetic / small UX issue

## Additional context

Add any other context about the problem here (links, related issues, etc.).
