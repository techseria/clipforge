# Roadmap

> What we're planning to build. **This is a living document** — priorities shift based on user feedback. Open an issue if you want to influence direction.

> **Current version:** [1.0.0](RELEASE_NOTES.md) — V1 is feature-complete and live-verified.

## How we prioritize

We use a rough RICE scoring (Reach × Impact × Confidence / Effort) and bias toward:

1. **Reliability** — making 1.0 more robust
2. **Workflow pain points** reported by users
3. **Multi-tenant** — once we have ≥3 self-hosted production users wanting isolation

## Now (V1.x — next 1-2 months)

Stabilization and incremental improvements based on V1 feedback.

- [ ] **Forced admin password change on first login** ([issue #42](https://github.com/techseria/clipforge/issues/42))
- [ ] **TOTP / WebAuthn MFA for admin accounts**
- [ ] **HSM-backed JWT_SECRET rotation** without forced re-login
- [ ] **Per-project quota overrides** (e.g. one team has more Hailuo budget)
- [ ] **Better worker error reporting** — surface transient failures in the UI with auto-retry
- [ ] **Bulk regenerate** — pick N scenes, regenerate them all with one click
- [ ] **Per-scene audio waveform preview** before generation
- [ ] **Prompt library** — save + reuse prompts across projects
- [ ] **Project duplication** — clone a project as a starting point for the next version

## Next (V2 — next quarter)

Major features based on V1 user feedback.

### Multi-tenant & permissions
- [ ] **Organizations / workspaces** with member management
- [ ] **Seat-based permissions** (owner / admin / editor / viewer per workspace)
- [ ] **Project sharing** with link-based access (read-only or edit)
- [ ] **Audit log UI** — search + filter by user, action, time
- [ ] **SSO** (Google Workspace, Okta, Azure AD)

### Editor enhancements
- [ ] **Timeline editor** — trim mid-clip, rearrange within a scene
- [ ] **Text overlays** (add title cards via FFmpeg drawtext)
- [ ] **Real-time multi-user collaboration** (Yjs + WebSocket)
- [ ] **Stitch scenes manually** with a separate "merge preview" before running the FFmpeg job
- [ ] **Auto-reframe** — generate 16:9, 9:16, 1:1 in one pass via FFmpeg crop + pad
- [ ] **Color grading presets** matched across providers

### More providers
- [ ] **OpenAI Sora** (when API GA)
- [ ] **Runway Gen-3**
- [ ] **Luma Dream Machine**
- [ ] **Stable Video Diffusion** (self-hosted, on-prem option)
- [ ] **Local Stable Diffusion** via ComfyUI bridge

### Cost optimization
- [ ] **Smart model selection** — auto-pick Veo Flash for drafts, Veo Pro for finals
- [ ] **Cost estimator** — show projected $ per scene before generating
- [ ] **Spend alerts** — email/Slack when daily spend exceeds threshold
- [ ] **Cache layer** — reuse generated clips when prompt+seed match

## Later (V3+ — 6-12 months)

- [ ] **Mobile apps** (React Native, iOS + Android)
- [ ] **CLI** for batch generation from the terminal
- [ ] **Webhook integrations** (Zapier, n8n) for automation
- [ ] **Brand kit** — save logo, colors, fonts at workspace level
- [ ] **A/B testing** — generate 2 variants of a scene, track engagement
- [ ] **Template library** — pre-built projects for common use cases
- [ ] **Video analytics** — track who watched, where they dropped off (if hosted on your own CDN)
- [ ] **Custom model fine-tuning** (when providers support it)
- [ ] **On-prem / air-gapped deploy** option
- [ ] **Mobile SDK** to embed ClipForge into your own app

## Probably never

- ❌ **Real-time collaborative timeline editing** (Yjs works, but UX is hard)
- ❌ **Native desktop app** (Electron is too heavy; users prefer the web)
- ❌ **AI-generated music** (we'll integrate with existing providers, not build one)
- ❌ **AI-generated voiceover** (we'll integrate with ElevenLabs / MiniMax TTS, not build one)

## Contributing to the roadmap

The roadmap is shaped by user feedback. To influence direction:

1. **Search existing issues** to see if it's been discussed
2. **Open a [feature request](https://github.com/techseria/clipforge/issues/new?template=feature_request.md)** with the user impact
3. **Vote with 👍** on issues that matter to you — we use this to prioritize
4. **Join [Discussions](https://github.com/techseria/clipforge/discussions)** for the "Ideas" category

If you want to **build** something on the roadmap, see [CONTRIBUTING.md](../CONTRIBUTING.md) and the [issue tracker](https://github.com/techseria/clipforge/issues). We actively mentor first-time contributors and pair on larger features.

## How we ship

- **V1.x** — patch releases every 2-4 weeks
- **V2.0** — major release when multi-tenant ships (~3 months out)
- **V3.0** — when mobile apps + custom models are ready (~12 months out)

See [RELEASING.md](RELEASING.md) for the actual release process and version numbering.

---

Have an idea that's not on this list? Open an issue!