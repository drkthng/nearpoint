# Cloud session plan

Credit deadline: **4 Nov 2026, 23:59 PT = 5 Nov 2026, 08:59 Leipzig time.** Unused credit is lost.
Check the "Cloud session credits" card at claude.ai/code after the first session to see what one session costs, then pace the rest.

Each session = one cloud session at claude.ai/code on this repo, committing directly to `main` (no branches, no PRs).
Paste the prompt below, replacing `<ID>`.

```
You are working on session <ID> of docs/sessions.md in this repo.
Read CLAUDE.md, docs/protocol.md, docs/sessions.md (section <ID>) and the code you will touch.
Plan first and list open questions, then implement directly on main.
Done when the acceptance criteria are met, `npm test` and `npm run typecheck` pass, and
docs/session-notes/<ID>.md summarises what you built, decisions taken and open issues.
Commit and push to main when done (`git pull --rebase origin main` first).
```

## Waves

| Wave | Sessions | Can run in parallel | Needs on main first |
|---|---|---|---|
| 1 | S1, S2, S3, S4 | yes | S0 (skeleton) |
| 2 | S5, then S6 | no | wave 1 |
| 3 | S7, S8 | yes | S5 |
| 4 | S9 | – | everything |

---

## S1 — Renderer (WebGL2 + CPU reference)
Build `src/render/`: a CPU reference renderer (pure TS, returns Uint8ClampedArray RGBA for given patches,
canvas size, λ, σ, carrier, mean, seed) and a WebGL2 renderer using the same uniforms as `gabor.frag.glsl`.
Layout helpers in `src/core/layout.ts`: patch positions for SINGLE, LM (collinear at ±dλ along the bar axis)
and CROWD (n flankers; default 3×3 grid aligned with bars), for all four orientations.
Acceptance:
- Layout tests: flankers lie on the bar axis for 0/45/90/135°; distances equal d·λ within 0.01 px.
- CPU renderer tests: dithered mean of a uniform field within 0.05 code values of target; linear-luminance
  Michelson contrast measured at a patch centre row within 2 % of specified; orientation of the carrier verified.
- `debug.html` page renders a static stimulus from URL query parameters (condition, cpd, theta, sep, contrast).

## S2 — Trial engine and frame scheduler
Pure state machine in `src/core/trial.ts` that turns a trial spec into an explicit frame list
(fixation 200 ms → blank 300 ms + jitter 0–250 ms → interval 1 [stim D frames, optional blank ISI + mask D frames]
→ gap 500 ms → interval 2 → response) using `framesFor` at a given refresh rate. A browser player in
`src/app/player.ts` presents frames with requestAnimationFrame and returns a timing log.
Acceptance:
- Tests: frame counts for published durations at 60 and 120 Hz; target appears in exactly one interval;
  both intervals contain flankers and masks; jitter bounded; seeded randomisation of target interval.
- Timing-log analyser (pure) flags trials with any interval > 1.5x nominal; tested with synthetic timestamp arrays.

## S3 — Curriculum engine
`src/core/curriculum.ts`: given `docs/curriculum.json` and a session history (per-block thresholds), produce the
next session plan. Rules from docs/protocol.md: one parameter changed per session, orientation rotation every
2 sessions, SF raised on criterion, plateau stop, min/max sessions.
Acceptance:
- Unit tests for each rule; property-based tests (fast-check allowed as dev dependency): never more than one
  parameter changes between consecutive sessions; orientation cycles through all four; SF stays within 2–8.
- Simulation: a simulated observer whose threshold improves 2 % per session produces a plausible 25–40 session program.

## S4 — Data layer
`src/data/`: IndexedDB schema for calibrations, sessions, blocks, trials (including timing logs), outcome tests.
CSV export (one file per table) and JSON backup/restore.
Acceptance:
- Tests with fake-indexeddb (dev dependency): round-trip of a full session; schema versioning/migration test;
  CSV columns documented in `docs/data-dictionary.md`.

## S5 — App shell, calibration, training flow
Screens: start (disclaimer: personal research tool, not a medical device; recommend eye exam), calibration
(px/mm by matching an ID-1 card, 85.60 × 53.98 mm; distance instructions for a 40 cm stand plus optional
blind-spot check; refresh measurement; checklist: max brightness, auto-brightness/True Tone/Night Shift off,
dim room, no reading glasses), training session runner wiring S1–S4, per-trial feedback, per-block results card
(threshold and a difficulty index relative to past sessions), history view with threshold charts (inline SVG).
Acceptance: full session runnable end to end in `npm run dev`; invalid-timing trials visibly counted; data persisted.

## S6 — Outcome tests (separate from training)
Near letter acuity at 40 cm in 0.1 logMAR steps, 5 letters per line, uncrowded and crowded, unlimited and
time-limited presentation; reading-speed test with timed sentences at decreasing size; contrast thresholds at
2/4/6 cpd with their own stimulus path. Printable SVG near chart generator (two letter orders) for paper testing.
Use an openly licensed optotype font or draw letters as SVG paths; check licences.
Acceptance: scoring functions unit-tested (logMAR per letter scoring, reading speed in wpm); results stored via S4.

## S7 — PWA and deployment
Web app manifest, service worker (offline), Screen Wake Lock during sessions, fullscreen, landscape hint,
iPad home-screen install notes in README. Verify `deploy-pages.yml` (or document an alternative static host).
Acceptance: Lighthouse PWA checks pass in CI or are documented; app works offline after first load.

## S8 — End-to-end tests in CI
Playwright with headless Chromium in GitHub Actions: render each condition and compare GPU output with the CPU
reference statistically (dithering noise tolerated); run a scripted training block with an automated responder;
assert timing logs exist and invalid trials are excluded. Upload screenshots as artefacts.
Acceptance: e2e job green in CI.

## S9 — Audit
Fresh session: review the codebase against CLAUDE.md non-negotiables and docs/protocol.md; write findings to
`docs/session-notes/S9.md` with severity; fix all high-severity findings.
