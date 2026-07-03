# Governance

> How ClipForge is governed. **Read this if you want to influence the project's direction.**

## Project status

ClipForge is an **open-source project sponsored by [Techseria](https://techseria.com)**, the original author and copyright holder.

- **Owner**: Techseria (https://techseria.com)
- **License**: GNU AGPL v3 (see [LICENSE](LICENSE))
- **Trademark**: "ClipForge" and the logo are trademarks of Techseria

## Decision-making model

We use a **lazy consensus** model with explicit escalation paths:

### Tier 1: Routine (any maintainer)

Any maintainer can decide on their own:

- Bug fixes that don't change behavior
- Documentation improvements
- Refactoring that doesn't change behavior
- Dependency updates within `pnpm audit` advisory levels (patch + minor)

**Process**: open a PR → 1 approval from another maintainer → merge.

### Tier 2: Normal (maintainer team)

Decisions affecting users in observable ways:

- New features
- API additions (new endpoints, new fields)
- Performance optimizations
- Non-trivial dependency updates

**Process**: open a Discussion (Ideas category) → wait 3 business days for feedback → if no strong objections, a maintainer opens a PR → 1 approval → merge.

### Tier 3: Major (maintainer team + Techseria)

Decisions with lasting impact:

- Breaking API changes
- Schema migrations requiring manual user steps
- License interpretation questions
- Governance changes
- Trademark usage policy

**Process**: open a Discussion (Governance category) → minimum 7 days for feedback → simple majority of maintainers → if it affects Techseria's commercial interests, Techseria has final say on commercial questions.

### Tier 4: Security (security team only)

Security decisions bypass normal process:

- Vulnerability disclosures
- Security advisories
- Patches to critical CVEs
- Coordinated disclosure timing

**Process**: handled by the Techseria Security Team in private. Public disclosure after patches ship.

## Voting

When a vote is required:

- Each active maintainer gets one vote
- Quorum: 2/3 of active maintainers must vote
- Passing: simple majority of votes cast
- Tie: release manager breaks the tie
- Security votes: Techseria Security Team has veto power

## Conflict resolution

If two maintainers disagree:

1. **Discuss in the PR** — try to reach consensus
2. **Escalate to Discussions** — if no resolution in 2 business days, open a discussion with the options laid out
3. **Maintainer vote** — simple majority after 5 business days of discussion
4. **Final escalation** — Techseria has final say on:
   - Commercial questions (e.g. "is this OK to use in a commercial product?")
   - Trademark questions (e.g. "can I use the ClipForge name in my fork?")
   - License questions (e.g. "does this PR require a CLA?")

## Code of Conduct enforcement

The [Code of Conduct](CODE_OF_CONDUCT.md) is enforced by the Techseria Community Team. Reports go to <conduct@techseria.com>. See the Code of Conduct for the enforcement ladder.

## Project ownership transfer

In the unlikely event that Techseria decides to transfer ownership of the project (e.g. to a foundation):

1. Techseria would announce the intent 6 months in advance
2. The new owner would be a recognized non-profit foundation (e.g. Linux Foundation, Apache Foundation, or similar)
3. The license would remain AGPL v3
4. Existing maintainers would retain their roles
5. The project name "ClipForge" and trademarks would transfer with the project

This has not happened and is not planned.

## Sponsorship

Techseria funds the day-to-day maintenance of ClipForge. We also accept sponsorship from third parties:

- **GitHub Sponsors** — see [`.github/FUNDING.yml`](.github/FUNDING.yml)
- **Open Collective** — coming soon
- **Direct sponsorship** — email <partnerships@techseria.com> for arrangements

Sponsor benefits:
- Logo placement on the project website (Tier 1+)
- Priority support (Tier 2+)
- Roadmap input (Tier 3+)

**No sponsor** has commit access or governance rights. Sponsorship is purely financial.

## What Techseria commits to

As the project owner, Techseria commits to:

- Maintaining the project as AGPL-licensed open source for at least 5 years
- Providing security patches for the current MAJOR version for 12 months after release
- Not relicensing the project under more restrictive terms (e.g. proprietary)
- Responding to maintainer nominations within 30 days
- Resolving disputes that escalate beyond the maintainer team
- Funding infrastructure (CI, Docker registry, hosting) for the public project

Techseria **does not** commit to:

- A specific release cadence (we aim for ~monthly minor releases but it's best-effort)
- Backward compatibility for any specific API endpoint beyond its deprecation period
- Supporting every possible deployment topology
- Free commercial support (see [SUPPORT.md](SUPPORT.md) for paid tiers)

## Changes to this document

This document is itself governed by Tier 3 process. Any change to the governance model requires:

1. Public discussion for at least 14 days
2. Approval by 2/3 of active maintainers
3. Techseria's explicit consent (since they own the trademark and could be affected)

---

Questions about governance? Email <maintainers@techseria.com>.

*Last updated: 2026-07-03*