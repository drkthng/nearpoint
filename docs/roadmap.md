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
| S2 | Trial engine and frame scheduler | 1 | S0 | done | `docs/session-notes/S2.md` |
| S3 | Curriculum engine | 1 | S0 | done | `docs/session-notes/S3.md` |
| S4 | Data layer | 1 | S0 | done | `docs/session-notes/S4.md` |
| S5 | App shell, calibration, training flow | 2 | S1, S2, S3, S4 | done | `docs/session-notes/S5.md` |
| S6 | Outcome tests | 2 | S5 | next | |
| S7 | PWA and deployment | 3 | S5 | next | |
| S8 | End-to-end tests in CI | 3 | S5 | next | |
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

### From S2
- **S5**: per trial `buildTrial(spec, rng)` → `expandFrames` → `playFrames({frames, hz, drawFrame, drawEnd,
  signal})`. `drawFrame` = `framePatches(frame, layoutParams)` + `WebGLStimulusRenderer.draw` with a new
  seed, plus the fixation mark when `frame.showFixation`. `drawEnd` draws the response screen (required: it
  terminates the last stimulus frame). Abort with an `AbortController` on `visibilitychange`; after an abort
  or error, clear the screen yourself. Update the staircase only when `log.analysis.valid`; show the count of
  invalid trials.
- **S4**: persist one `TrialTimingLog` (src/core/timing.ts) per trial: hz, intended `FrameSpec[]`, N+1
  timestamps, analysis. Intended frames can be stored compactly as the plan's `segments`.
- **S8**: play one real trial in Playwright and assert N+1 timestamps and `analysis.valid` at 60 Hz.

### From S3
- **S5**: at session start call `nextSession(curriculum, history)` (src/core/curriculum.ts); on `stop` show
  "program complete". Show `plan.reason`. One `Staircase` per block (settings from `curriculum.staircase`);
  each trial draws sep_lambda / isi_ms uniformly from the block's lists with the seeded RNG. Record per block
  `{condition, threshold, blockIndex, validTrials, invalidTrials}`; `threshold` is `Staircase.threshold()`
  (null if not converged). Only timing-valid trials update the staircase.
- **S4**: persist `SessionPlan` and `SessionRecord` per session; `history` = completed sessions in order.

### From S4
- **S5**: `openDb({ onBlocked })` once at start (ask the user to close other tabs on `onBlocked`; reload after
  a `versionchange` closes the connection). Call `requestPersistence()` (src/data/persist.ts) on first run and
  show the result. Write rows as the session runs: calibration → session (`status: "in-progress"`, `rngSeed`,
  `appVersion`) → blocks → trials (`timing: toStoredTiming(log)`, `valid === log.analysis.valid`) → session
  completed/aborted (`abortReason`). `completedHistory()` feeds `nextSession`. Offer CSV export
  (`exportCsv`) and JSON backup (`exportBackup`) as downloads, plus a backup reminder. When filling the new
  optional fields, add them to `src/data/csv.ts` columns and `docs/data-dictionary.md` (the sync test enforces it).
- **S6**: outcome tests go into the `outcomeTests` store (`kind`, `summary`, `details`).

### From S5
- **Operator**: first real run on the Galaxy S24: `npm run dev -- --host`, open the shown network URL in
  Chrome, calibrate (card + 40 cm stand + checklist), run one session. Check the invalid-timing count shown
  on each block card; it should be near 0 at a fixed 60 Hz.
- **S6**: separate module and screen (non-negotiable 6); add a route in `src/app/routes.ts` and a start-screen
  button; reuse `src/app/dom.ts` and the latest calibration; store in `outcomeTests`.
- **S7**: the app already requests fullscreen, landscape lock and a wake lock on Start (all optional, in
  try/catch); keep them working inside the installed PWA.
- **S8**: use the test hook `#train?quick=1&auto=1&trials=4` after calibrating via the UI (tick all checklist
  boxes, "Measure refresh rate", "Save calibration"); wait for "Session complete"; read IndexedDB "nearpoint".
  Headless WebGL2 needs `--use-angle=swiftshader --enable-unsafe-swiftshader`; SwiftShader yields some
  timing-invalid trials, so assert they are counted and excluded, not that there are none.

## Backlog

Open issues not owned by a scheduled session. Add `(from S<n>)`; remove when resolved, saying where.

- Shader compiles and renders in desktop Chrome on Windows (operator check, 2 Nov 2026: WebGL2, backing
  1921×901 at DPR 1.104, CROWD stimulus centred). Still unchecked: Galaxy S24 Chrome (operator) and CI (S8). (from S1)
- Desktop refresh measured ≈ 30 Hz on the operator's machine (power saving or throttling?). At 30 Hz
  durations get coarse (34 ms → 1 frame); train at a fixed 60 Hz. (from S1, S2)
- Target device switched to Galaxy S24 (Chrome) on 2 Nov 2026 (CLAUDE.md, protocol.md "Training device").
  S5 calibration must not assume a pixel pitch; S7 writes Android install notes; S8 should emulate a
  phone viewport in landscape. (from S2)
- Crowding layouts with more than 8 flankers are undefined. (from S1)
- `fitCanvasToDevicePixels()` and the WebGL draw path have no unit tests (browser only; S8). (from S1)
