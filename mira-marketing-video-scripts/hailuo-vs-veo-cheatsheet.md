# Hailuo vs. Veo 3 — Shot-to-Tool Cheat Sheet

Which model to use for each shot, how to phrase prompts for each, and how to fix common failures. Both cap at ~8s/clip, so the whole campaign is built to be generated scene-by-scene and merged.

---

## Quick decision: which model for which shot?

| Shot type in these scripts | Best model | Why |
|---|---|---|
| Scenes with **spoken VO baked in** (any payoff line, teaser) | **Veo 3** | Native synced audio + dialogue; you can get VO + SFX in one render. |
| **Human close-ups** (Arjun tapping the tablet, his face, hands) | **Veo 3** | Stronger character consistency, faces, and hand/finger fidelity. |
| **Product-film beauty shots** — teal light waves, holographic UI cards, particle "leaks" | **Either** (Veo 3 slightly cleaner) | Both do stylized ambient light well; Veo holds detail better. |
| **Fast, cheap iteration / lots of variants** | **Hailuo** | Faster + cheaper per clip; great for trying camera moves. |
| **Big smooth camera moves** (crane-up, long dolly glide, overhead drift) | **Hailuo** | Very strong, fluid camera motion; use its Director/camera controls. |
| **Wide plant establishing shots** | **Either** | Both handle industrial environments; pick by cost/speed. |

**Rule of thumb:** *Veo 3 for anything with a face or a voice; Hailuo for motion-heavy or high-volume iteration.* Mixing models across scenes is fine — the shared STYLE BIBLE keeps them coherent (match grade in post).

---

## Prompt style per model

### MiniMax Hailuo
- Prefers **concise, comma-separated** prompts. Front-load the subject, then action, then camera, then style.
- Use its **camera-move keywords** explicitly: `push in`, `pull back`, `pan left`, `truck right`, `crane up`, `orbit`, `static`. (Or the Director-model bracket syntax if available in your version.)
- Keep to **one clear action per clip** — Hailuo drifts if you stack 3+ events.
- Negative/avoid: append `avoid: text, watermark, distorted faces, extra fingers, jitter`.
- Motion strength: keep medium; too high warps the UI cards.

**Hailuo-tuned example (Video 1, Scene 1):**
> Empty manufacturing plant at 3 A.M., a CNC motor with faint amber heat shimmer and thin smoke, blinking amber sensor LED, tense quiet mood. Camera: slow push in on the motor. Cool graphite tones, amber warning glow, cinematic, photorealistic, volumetric haze. avoid: text, watermark, distorted faces, jitter.

### Google Veo 3
- Handles **longer, descriptive, cinematic** prompts — describe lens, lighting, mood, and audio.
- Add an explicit **audio block** at the end: `Audio: [VO line] spoken calmly; soft ambient factory hum; a subtle confident chime.`
- For spoken lines, put the exact words in quotes and say who speaks (`narrator, calm, offscreen`).
- Specify lens/film language: `35mm, shallow depth of field, natural light, filmic grade`.
- Veo respects `no on-screen text` fairly well but still add it — and add text/logos in post anyway.

**Veo-tuned example (Video 1, Scene 4, with native audio):**
> Cinematic wide shot of a humming manufacturing plant, production line flowing, soft teal light pulsing across the scene like a calm presence. Slow crane-up and pull-back, settling to a minimal premium frame with empty center space. 35mm, shallow depth of field, cool graphite tones, electric-blue and soft-purple glow, success-green accents. Audio: narrator, calm and confident, offscreen, says "MIRA. Your Digital Facility Manager. Always on. Always learning. Always asking before she acts." Warm resolving music, soft brand whoosh at the end. no on-screen text.

---

## Known limitations & how these scripts already work around them

| Limitation (both models) | Workaround baked into the scripts |
|---|---|
| **Can't spell / render UI text reliably** | All labels (`Work order created`, KPI numbers, logo) are marked **ON-SCREEN TEXT (post)** — add them in your editor, never trust the model. |
| **8-second hard cap** | Every scene is authored as a self-contained 8s beat; merge in order per each `videoN.md`. |
| **Character drift across clips** | Fixed **STYLE BIBLE** description of Arjun (repeat it verbatim each prompt). On Veo, use the same seed / reference image across his scenes. |
| **Complex multi-action scenes warp** | Each scene is **one action + one camera move**. Don't merge two beats into one prompt. |
| **Color/grade mismatch between models** | Do a final **unifying color grade in post** so Hailuo + Veo clips match; the palette is specified so they start close. |
| **Hands / tapping look off** | Route the tablet-tap close-up (V3 S3) to **Veo 3**; if it still fails, cut wider or show the screen reacting instead of the finger. |
| **Audio not native (Hailuo)** | Use the `voiceover-script-sheet.md` + a music track in post; reserve Veo for scenes where you want native VO. |

---

## Consistency workflow (do this for a coherent final cut)
1. **Lock Arjun first.** Generate one clean Veo shot of Arjun, save a frame, and reuse it as a reference image / seed for all his scenes.
2. **Generate ambient/UI beauty shots on either model**, matching the palette tags.
3. **Pick a "hero grade"** from your best clip and match every other clip to it in post.
4. **Regenerate, don't fight the prompt** — if a clip drifts after 2 tries, change model or simplify the action rather than adding more words.
5. **Batch the teaser variants** on Hailuo (cheap iteration), finish the payoff scenes on Veo (audio + faces).

---

## Cost/speed note
- **Hailuo:** cheaper + faster → use for exploration, camera-move tests, and the 3 teaser variants.
- **Veo 3:** pricier + native audio + best faces → reserve for final payoff scenes and any clip with baked VO.
- Budget tip: storyboard-approve on Hailuo drafts, then re-render only the keeper scenes on Veo.
