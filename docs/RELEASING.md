# Release Process

> How ClipForge is versioned, tagged, and shipped. **Maintained by the core team; read carefully if you're a maintainer.**

## Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0) — breaking API changes, schema migrations that require manual steps, or fundamental architectural changes
- **MINOR** (1.0.0 → 1.1.0) — backwards-compatible features, new endpoints, new providers
- **PATCH** (1.0.0 → 1.0.1) — backwards-compatible bug fixes, security patches, docs

Pre-release tags use the suffix `-rc.N` (e.g. `1.1.0-rc.1`).

## Release cadence

- **Patch releases**: as needed, typically within 1-3 days of a fix
- **Minor releases**: every 2-4 weeks
- **Major releases**: when multi-tenant lands (estimated Q4 2026) or when a major architectural change is needed

## Roles

| Role | Responsibilities |
|------|-----------------|
| **Release manager** (rotating) | Cuts the release, writes notes, ships the tag |
| **Techseria engineering** | Code review, security review, merge to main |
| **Techseria security** | Reviews security-sensitive changes before release |
| **Techseria support** | Pre-announces breaking changes to users |

## Process

### 1. Branch and freeze

```bash
# Create a release branch
git checkout -b release/v1.1.0 main

# Bump versions in all package.json files
pnpm -r version 1.1.0 --no-git-tag-version

# Update CHANGELOG.md (move Unreleased → [1.1.0] - YYYY-MM-DD)
# Update docs/RELEASE_NOTES.md if this is a notable release
```

### 2. Build and test

```bash
# Full CI suite
pnpm typecheck && pnpm lint && pnpm test && pnpm build

# Build Docker images locally
docker compose build api worker web
```

### 3. Tag the release

```bash
git add -A
git commit -m "chore(release): v1.1.0"

# Annotated tag
git tag -a v1.1.0 -m "v1.1.0 - 2026-09-15

Highlights:
- Feature A
- Feature B
- Fix for C (issue #123)"

git push origin release/v1.1.0
git push origin v1.1.0
```

### 4. Publish Docker images

The CI workflow (`.github/workflows/release.yml`) automatically:

1. Runs the full test suite on the tag
2. Builds and pushes multi-arch (amd64 + arm64) images to `ghcr.io/techseria/clipforge-{api,worker,web}:v1.1.0`
3. Creates a GitHub Release with auto-generated changelog

Verify the images:

```bash
docker pull ghcr.io/techseria/clipforge-api:v1.1.0
docker pull ghcr.io/techseria/clipforge-worker:v1.1.0
docker pull ghcr.io/techseria/clipforge-web:v1.1.0
```

### 5. Publish to npm (if applicable)

We don't currently publish to npm, but if we ever do:

```bash
# Authenticate
npm login

# Publish the packages we want public
pnpm --filter @clipforge/shared publish --access public
```

### 6. Announce

- [ ] **GitHub Release** — auto-created by CI; verify the changelog and edit if needed
- [ ] **GitHub Discussions** — pin a "v1.1.0 Released" announcement
- [ ] **Docs site** — deploy the updated docs (if we have a separate site)
- [ ] **Email** — send to opt-in announcement list (managed in Techseria's CRM)
- [ ] **Twitter / LinkedIn** — post from @techseria
- [ ] **Slack community** — if/when we have one

### 7. Pre-release testing (for major / minor releases)

For non-patch releases, do a private beta:

1. Tag a `-rc.1` and push to `ghcr.io/techseria/clipforge-*:1.1.0-rc.1`
2. Ask 2-3 volunteer users to deploy in a staging environment
3. Collect feedback for 3-5 days
4. Cut a `-rc.2` if needed
5. Final release after no critical issues for 48h

## Hotfix process

For urgent security or data-loss bugs:

```bash
# Branch from the affected release tag, not from main
git checkout -b hotfix/v1.0.1 v1.0.0

# Fix + tests
git commit -m "fix(api): patch SQL injection in /me endpoint (CVE-2026-XXXX)"

# Tag and push
git tag -a v1.0.1 -m "v1.0.1 - critical security fix"
git push origin hotfix/v1.0.1
git push origin v1.0.1

# Merge back to main
git checkout main
git merge --no-ff v1.0.1
git push origin main
```

CI will publish the patch release and a GitHub advisory.

## Deprecation policy

- **Deprecate a feature**: announce in release notes, log a warning at runtime, keep working for at least 2 minor releases
- **Remove a feature**: announce in the major release that removes it; provide a migration path

## Security disclosures

If a security issue is found in a released version:

1. Fix is developed in a private branch / fork
2. CVE is requested
3. Patch release is shipped with a [GitHub Security Advisory](https://github.com/techseria/clipforge/security/advisories)
4. Coordinated public disclosure (typically 7-14 days after the patch ships)

See [SECURITY.md](../SECURITY.md) for the full disclosure process.

## Version support matrix

| Version | Status | Support ends |
|---------|--------|-------------|
| 1.0.x | ✅ Active | 2027-07-01 (12 months) |
| < 1.0 | ❌ End-of-life | already ended |

We commit to supporting the current MAJOR.MINOR for at least 12 months after release. Critical security patches are backported to the previous MAJOR for 6 months.

## Checklist (copy-paste for each release)

```markdown
## Release: vX.Y.Z

### Pre-release
- [ ] All open PRs for this milestone merged
- [ ] CHANGELOG.md updated
- [ ] docs/RELEASE_NOTES.md updated (if minor or major)
- [ ] All package.json versions bumped
- [ ] CI green on main
- [ ] Docker images build locally
- [ ] Beta testers (if minor+) signed off

### Tag and ship
- [ ] Annotated tag created with release notes in body
- [ ] Tag pushed
- [ ] CI published Docker images
- [ ] GitHub Release created with changelog
- [ ] npm packages published (if applicable)

### Announce
- [ ] Discussion pinned
- [ ] Email sent
- [ ] Social posts scheduled
- [ ] Slack notification

### Post-release
- [ ] No critical issues in 48h
- [ ] Support requests triaged
- [ ] Roadmap updated (if scope changed)
```

---

Questions about the release process? Email <maintainers@techseria.com>.