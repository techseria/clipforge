<!--
  Thanks for your contribution! Please fill out the sections below.
  Maintainers will be auto-assigned via .github/CODEOWNERS.
-->

## What does this PR do?

A clear, 1-3 sentence description of the change.

### Related issue(s)

- Fixes #<issue_number>
- Refs #<issue_number>
- Related to #<issue_number>

## Type of change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📝 Documentation / README / docs only
- [ ] 🧹 Refactor (no functional change)
- [ ] 🧪 Tests (adding or updating tests)
- [ ] 🔧 Chore (CI, deps, build, etc.)

## How was this tested?

Describe the tests you ran. Include screenshots / recordings if relevant.

- [ ] Unit tests pass: `pnpm test`
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Build passes: `pnpm build`
- [ ] Manual test: (describe what you did)
- [ ] E2E test via Chrome DevTools (if UI change)

## Screenshots / recordings

If the change is visual, add before/after screenshots or a short screen recording.

## Checklist

- [ ] My code follows the project's [coding conventions](CONTRIBUTING.md#coding-conventions)
- [ ] I have added tests that prove my fix/feature works
- [ ] I have updated the [CHANGELOG.md](CHANGELOG.md) under "Unreleased"
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
- [ ] I have read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Database migrations

- [ ] No schema changes (skip this section)
- [ ] Schema changes included
  - [ ] Migration file generated with `pnpm --filter @clipforge/db generate`
  - [ ] Migration tested locally against a fresh DB
  - [ ] Migration is backwards-compatible (no data loss on existing prod data)
  - [ ] Rollback plan documented in PR description

## Deployment notes

Anything operators need to know when deploying this change (env var changes, new secrets, new indexes, etc.):

<!--
  Examples:
  - "Run `pnpm db:migrate` after deploy"
  - "Set PROVIDER_CONFIG_OVERRIDE env var in worker"
  - "Restart worker pods to pick up the new provider handler"
-->
