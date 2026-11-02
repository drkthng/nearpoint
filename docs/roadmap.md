# Roadmap and status

The single source of truth for **where the project is** and **what comes next**. Every session reads this
file first and updates it last. What each session builds (scope, acceptance criteria) is in
`docs/sessions.md`; this file only tracks state and hand-offs.

## How a session uses this file

1. Read CLAUDE.md, then this file.
2. **Claim** a session: take the first row in the status table whose status is `next` and whose
   "Needs" are all `done`. Set it to `in progress (<date>)`, commit only that change
   ("Claim S<n>"), `git pull --rebase origin main`, push. If the rebase conflicts on that row, another
   session claimed it first: drop your change and claim the next eligible row.
   If the operator named a session ID in the prompt, claim that one instead.
3. Read that session's section in `docs/sessions.md`, its "Hand-offs in" below, `docs/protocol.md`, and the
   code you will touch. Work as CLAUDE.md describes.
4. When done: set your row to `done`, add a link to your notes, set any rows whose "Needs" are now all
   `done` to `next`, add hand-offs for later sessions under "Hand-offs" (append under your own heading
   only), and move items in "Backlog" you created or resolved. Commit with your last commit, pull with
   rebase, push.

Edit only your own row and your own hand-off heading, so parallel sessions do not conflict.

Prompt to start any session:

```
Read CLAUDE.md and docs/roadmap.md, claim the next eligible session as described there, and carry it out.
```

## Status

| Session | Title | Wave | Needs | Status | Notes |
|---|---|---|---|---|---|
| S0 | Skeleton | 0 | – | done | `docs/session-notes/S0.md` |
| S1 | Renderer (WebGL2 + CPU reference), layout, rename | 1 | S0 | done | `docs/session-notes/S1.md` |
| S2 | Trial engine and frame scheduler | 1 | S0 | in progress (2026-11-02) | |
| S3 | Curriculum engine | 1 | S0 | next | |
| S4 | Data layer | 1 | S0 | next | |
| S5 | App shell, calibration, training flow | 2 | S1, S2, S3, S4 | blocked | |
| S6 | Outcome tests | 2 | S5 | blocked | |
| S7 | PWA and deployment | 3 | S5 | blocked | |
| S8 | End-to-end tests in CI | 3 | S5 | blocked | |
| S9 | Audit | 4 | S1–S8 | blocked | |

Statuses: `blocked` (needs not done), `next` (claimable), `in progress (<date>)`, `done`.

## Hand-offs

Facts a later session needs that are not obvious from the code. Append under your own session heading.

### From S1
- **S2**: build each interval from `stimulusPatches()` (target frame) and `maskPatches()` (BM mask frame) in
  `src/core/layout.ts`; the blank 2IFC interval uses `targetPresent: false` (target omitted, flankers kept).
  `WebGLStimulusRenderer.draw()` needs a **new seed every frame**. Use `fitCanvasToDevicePixels()` for the
  stimulus canvas. Patch limit is 12 (`MAX_PATCHES`).
- **S5**: `src/app/debug-params.ts` shows the URL-parameter pattern; `debug.html` is a second Vite entry
  (`vite.config.ts`), so new pages must be added there too.
- **S8**: the shader has never been compiled in CI. Load `debug.html?...&seed=N` in Playwright, fail on
  shader compile errors, compare read-back pixels with `renderCpu()` statistically (CPU dither = mulberry32,
  GPU dither = PCG, different streams). A `uDither` uniform (u = 0.5) would allow an exact comparison.

## Backlog

Open issues not owned by a scheduled session. Add `(from S<n>)`; remove when resolved, saying where.

- Shader compiles and renders in desktop Chrome on Windows (operator check, 2 Nov 2026: WebGL2, backing
  1921×901 at DPR 1.104, CROWD stimulus centred). Still unchecked: iPad Safari (operator) and CI (S8). (from S1)
- Desktop refresh measured ≈ 30 Hz on the operator's machine (power saving or throttling?). Check on the
  iPad before relying on frame timing (S2/S5). (from S1)
- Crowding layouts with more than 8 flankers are undefined. (from S1)
- `fitCanvasToDevicePixels()` and the WebGL draw path have no unit tests (browser only; S8). (from S1)
