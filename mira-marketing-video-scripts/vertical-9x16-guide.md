# 9:16 Vertical Adaptation — Reels / Shorts / TikTok / WhatsApp Status

Turn any of the 16:9 videos (`video1`–`video4`, `teaser-8s`) into a **vertical 9:16** cut for mobile-first feeds. Two ways to do it — pick per clip.

---

## Method A — Re-generate natively in 9:16 (best quality, recommended)

Reuse the **same VISUAL PROMPT** from the scene, but change the framing tags. In the prompt, replace:

- `16:9, no on-screen text, no captions`
**with**
- `9:16 vertical, tall composition, subject centered, mobile-first framing, no on-screen text, no captions`

Then add this framing instruction to the end of each prompt:

> Compose vertically: keep the main subject and any UI cards **stacked in the centre third** of a tall frame, with clean headroom at the top and empty space at the bottom for captions. Avoid wide side-by-side layouts.

**Why:** The AI model recomposes for the tall frame instead of you cropping and losing the sides.

---

## Method B — Crop the 16:9 render to 9:16 (fastest)

In CapCut / Premiere / Resolve: set the sequence to 1080×1920, drop the 16:9 clip in, scale up ~1.8×, and keyframe the horizontal position to keep the subject centered ("pan & scan"). Add a subtle blurred-duplicate background to fill top/bottom if you don't want to scale so far.

**Use when:** you already rendered 16:9 and need vertical fast. **Risk:** you lose the left/right edges — check that Arjun / the key UI card stays in frame.

---

## Per-scene safe-framing rules (both methods)

| Element | Where to place it in the tall frame |
|---|---|
| **Arjun (person)** | Centre; frame chest-up so his face and the tablet both read on a phone. |
| **Holographic UI cards** | Centre third, stacked vertically — never a wide row. |
| **The control-room dashboard** | Push in closer than the 16:9 version; show 2–3 cards, not the whole wall. |
| **Wide plant establishing shots** | Shoot tighter / more vertical (a tall machine, a robotic arm reaching up) — a wide horizontal factory reads poorly vertical. |
| **End-card logo** | Upper-middle third, NOT dead centre (leave room for platform UI + captions at the bottom). |

## Text & caption rules for vertical
- Keep the **top ~12%** and **bottom ~18%** clear — platform UI (profile, buttons, captions) sits there.
- Put on-screen text in the **middle band**, large and short.
- Add **burned-in captions** of the VO (most vertical feeds autoplay muted) — big, high-contrast, centered.
- First on-screen word (`Meet MIRA.` / the hook) must appear in the **first 1 second**.

## Duration & pacing
- Vertical feeds are faster: consider trimming each 8s scene to ~6s if you chain them, or lead with the **`teaser-8s`** as a standalone Reel/Short.
- For a full vertical ad, 3 scenes (~18–24s) usually outperforms 4 — drop the weakest scene rather than crowding.

## Quick recipe per asset
- **Reels / Shorts hero:** `teaser-8s` in 9:16 (Method A) + burned-in captions.
- **Full vertical story:** `video1` or `video2`, Method A, trimmed to 3 scenes.
- **WhatsApp / status share:** `teaser-8s` vertical, silent-cut variant with big centered text.
