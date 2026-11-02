# S1 cloud session prompt (temporary)

Handoff file for one cloud session. This file is your complete task. It has three parts:

- **A. Operating mode: conductor.** How you work. Read this before anything else.
- **B. Task.** What to build. This is the operator's spec, changed in one way: you work on `main` instead
  of a branch and a PR, because CLAUDE.md requires it.
- **C. Finish.** How you close the session. This includes deleting this file.

---

## A. Operating mode: conductor

You are the **conductor**. You run on Opus, which is expensive, so you use it for thinking and not for
typing. You read, decide, write work orders that leave nothing to guess, send them to cheaper subagents,
and judge what comes back. **You do not write implementation code, tests or docs yourself.**

If your system prompt says you are not an Opus model, say so in your first message and carry on anyway.

### Who does what

| Role | Model | Does | Never |
|---|---|---|---|
| Conductor (you) | Opus | Reads the required files. Writes the plan and every work order. Takes all design decisions. Reviews results. Runs the final checks. Commits, rebases and pushes. Resolves rebase conflicts. | Edits files under `src/`, `docs/`, or any config file, except under the escalation rule below |
| Builder | `sonnet` | Work with math, types or judgement: `layout.ts`, `cpu.ts`, `webgl.ts`, `debug.ts` and their tests, plus the independent review | Commits, pushes, touches files outside its work order |
| Runner | `haiku` | Mechanical work: the rename and grep, running checks and reporting the output word for word, `protocol.md` edits you dictate, writing session notes from your bullet list | Makes design decisions |

How to dispatch:

- Use the Agent tool with `subagent_type: "general-purpose"` and **always set `model` explicitly**
  (`"sonnet"` or `"haiku"`).
- Never use `subagent_type: "fork"`. A fork inherits your Opus model and your full context, which defeats
  the purpose.
- To send a correction or follow-up, use SendMessage to the same agent. It keeps its context, so this costs
  less than starting a new agent.

### Work orders

A subagent starts with **zero context**. It has not seen this file, CLAUDE.md or your reasoning. Every work
order must stand on its own. Write each one in this structure:

```
WORK ORDER <id>: <title>                         model: sonnet|haiku
Goal:          one sentence.
Read first:    exact paths, and what to look for in each.
Touch only:    exact paths to create or modify. Nothing else.
Spec:          exported names with full TypeScript signatures and types; formulas written out;
               conventions restated in full (coordinates, units, angle definitions, vectors b and c),
               never "as above" or "as discussed". Copy the real signatures of the existing functions
               it must use (gaborValue, toCode8, srgbEncode, mulberry32, lambdaPx, ...) from the source.
Errors:        exact error conditions and exact error message strings.
Tests:         file path; each test with concrete inputs, expected values and tolerances.
Rules:         the CLAUDE.md non-negotiables that apply, restated; no Math.random (use mulberry32
               from src/core/rng.ts); no new runtime dependencies; do not change behaviour of existing
               src/core modules; do not commit or push.
Verify:        exact commands, which must be green before reporting.
Report (<= 30 lines): files changed; last lines of each verify command; every deviation from the
               spec, marked DEVIATION, with the reason; anything you were unsure about.
```

Before you dispatch, check the order against this test: could a capable developer who has never seen this
repo finish it **without asking a single question**? Are all numbers, names, paths and tolerances given? Is
"done" checkable by running a command? If any answer is no, rewrite the order.

Write orders for `haiku` more literally than orders for `sonnet`: give exact strings to find and replace,
and exact lines to add. Tell `haiku` to **stop and report** when it meets an ambiguity. Tell `sonnet` to
pick the option most consistent with the spec and flag it as a DEVIATION.

### Suggested work-order sequence

You may refine this plan, but keep the split by model.

| WO | Model | Scope | After |
|---|---|---|---|
| 0 | haiku | Step 0 rename | – |
| 1 | sonnet | Step 1: `src/core/layout.ts`, `layout.test.ts`, the Open questions and Our choices notes in `docs/protocol.md` | 0 |
| 2 | sonnet | Step 2: `src/render/cpu.ts`, `cpu.test.ts` | 1 |
| 3 | sonnet | Step 3: `src/render/webgl.ts`, the uniform-packing test, the canvas sizing helper | 1 (runs **in parallel** with 2: send both Agent calls in one message) |
| 4 | sonnet | Step 4: `debug.html`, `src/app/debug.ts`, `vite.config.ts` build input | 2, 3 |
| V | haiku | `npm run typecheck`, `npm test` (report wall time; must stay under ~30 s), `npm run build` (confirm `dist/` contains both `index.html` and `debug.html`) | 4 |
| R | sonnet | **Read-only** review of the whole diff against section B's tests, constraints and definition of done, and against the 9 CLAUDE.md non-negotiables. Output: a table with criterion, PASS/FAIL, and evidence as file:line | V |
| N | haiku | `docs/session-notes/S1.md`, written from a bullet list of facts and decisions that you supply | R |

WO2 and WO3 share one working tree. While one of them is mid-edit, the other may see broken files. So in
those two work orders:

- Each agent runs **only its own test file** (`npx vitest run <its test file>`).
- Each agent reports typecheck errors in files outside its own scope without trying to fix them.

You run the full suite once both agents have returned.

### Review, commit, push (conductor)

After each work order returns:

1. Run `git status --short` and `git diff --stat`.
2. Read only the parts that carry decisions: the public API, the conventions, and the test assertions.
   Line-by-line review is the job of WO-R, not yours.
3. Run the verify commands yourself, piping the output through `| tail -n 30`. If something fails, do not
   investigate it yourself; that belongs in a corrective work order.
4. Commit with a clear message. One commit per step; the rename keeps its own commit as specified.
5. Run `git pull --rebase origin main`, then `git push origin HEAD:main`. Other sessions (S2–S4) may be
   pushing to main at the same time. Resolve conflicts so that both sides keep their intent.

If the environment refuses a push to `main`, push to a branch named `s1-renderer` instead. Do **not** open a
pull request, and say so in your final message.

### When a subagent fails

1. Do not fix it yourself. Send a corrective order via SendMessage that names the exact failure (test name,
   error text, file:line) and the exact result you expect.
2. If `haiku` fails twice on the same order, re-issue the order to `sonnet`.
3. If `sonnet` fails twice on the same order, you may make the fix yourself. Keep it minimal, and record it
   in the session notes under "Conductor interventions" with a one-line reason.

### Keep your own context lean

- Read the required files once and copy the exact signatures into your work orders.
- Ask for short reports, not file dumps.
- Do not stop to wait for answers from the operator. When something is ambiguous, decide as described in
  section B, write the decision down, and keep going.

### Known traps (found while writing this file)

- The old name `near-vision-trainer` also appears twice in `package-lock.json` (both `"name"` fields) and
  in the echo line of `scripts/cloud-setup.sh`.
- `vite.config.ts` imports `defineConfig` from `"vitest/config"`. Add `build.rollupOptions.input` (for
  `index.html` and `debug.html`) in that same file.
- `tsconfig.json` already includes `vite/client` types, so `import frag from "./gabor.frag.glsl?raw"`
  typechecks.
- `webgl.ts` must not touch the DOM when the module loads. The uniform-packing test imports it in Node.
- `src/core/protocol.ts` defines `Condition = "SINGLE" | "LM" | "CROWD" | "BM-T" | "BM-LM" | "BM-CROWD"`.
  Decide how the layout function maps the BM-* conditions onto the base layouts, and document the mapping.
- `gabor.frag.glsl` already computes `p = vec2(gl_FragCoord.x, uViewportH - gl_FragCoord.y)` and dithers
  with a hash of `gl_FragCoord.xy`. Check that `uSeed` actually feeds the hash.
- Where this file's test tolerances are stricter than those in `docs/sessions.md` (for example 0.5 % against
  2 % for Michelson contrast), this file wins.

---

## B. Task

You are working in the "nearpoint" repository (currently still named "near-vision-trainer" inside the files).
This is session S1 from docs/sessions.md. Work directly on `main` as CLAUDE.md requires: no branch, no pull
request. Commit in small steps and push to `origin/main` as described in section A.

### Context
nearpoint is a personal research instrument that reimplements the published Polat/GlassesOff perceptual-learning
protocol for presbyopia: 2-interval forced-choice detection of brief, low-contrast Gabor targets with collinear
flankers, crowding and backward masking, with adaptive difficulty. Target device: iPad Safari (PWA), 40 cm,
full brightness. Stack: TypeScript (strict), Vite, Vitest, WebGL2. Cloud sessions are headless: there is no
display, so rendering correctness is verified via a CPU reference renderer and unit tests.

Before writing code, read in this order: CLAUDE.md (project rules, especially the 9 non-negotiables),
docs/protocol.md, docs/sessions.md (section S1), and all of src/core/ and src/render/gabor.frag.glsl.
Then write a short plan and list open questions. If something is ambiguous, choose the option most consistent
with CLAUDE.md and docs/protocol.md, document the decision, and keep going. Do not invent "published" protocol
values; anything not in docs/protocol.md goes under "Our choices" with a rationale.

### Step 0: rename (small, separate commit)
Rename the project to "nearpoint": package.json name, README.md title and intro, CLAUDE.md heading,
index.html <title> and <h1>. Use this README intro / repo description:
"Perceptual-learning trainer for near vision. Adaptive Gabor contrast detection with collinear flankers,
crowding and backward masking, reimplementing the published Polat/GlassesOff protocol. Frame-exact WebGL2,
dithered sub-1 % contrast, simulated-observer tests. Personal research tool, not a medical device."
grep for remaining "near-vision-trainer" strings and replace them, except the file name of
docs/research/oryx-near-vision-report.html. Run tests, commit as "Rename project to nearpoint".

### Step 1: stimulus layout (src/core/layout.ts, pure)
- Coordinates: device pixels, origin top-left, y down. Pixel centres at (x + 0.5, y + 0.5).
- Orientation θ in degrees is the orientation of the bars, 0 = vertical. Bar axis b = (sin θ, −cos θ);
  carrier direction c = (cos θ, sin θ) (perpendicular to the bars). The renderer's carrier angle is θ in radians,
  consistent with gaborValue() in src/core/luminance.ts.
- Export a function that, given condition (SINGLE | LM | CROWD; masked variants reuse these layouts), θ,
  separation in wavelengths, λ in px, canvas centre, target contrast, flanker contrast, number of crowding
  flankers and whether the target is present, returns a list of patches {x, y, contrast}.
- LM: two flankers at centre ± d·λ·b. CROWD: 3×3 grid aligned with b and c (offsets i·d·λ·b + j·d·λ·c,
  i, j in {−1, 0, 1}, centre excluded). Support nFlankers in {2, 4, 6, 8} with a deterministic order:
  collinear pair, then the pair along c, then diagonals. Reject other counts with a clear error and note
  "4–11 flankers in the literature; > 8 layouts undefined" under Open questions in docs/protocol.md.
- Also export a helper for a mask frame: the flanker layout without the target.

### Step 2: CPU reference renderer (src/render/cpu.ts)
- Input: width, height, patches, λ px, σ px (default σ = λ), carrier angle, mean linear luminance (default 0.214),
  dither on/off, seed.
- Sum gaborValue() contributions in linear luminance within radius 3.5σ of each patch, L = mean · (1 + sum),
  clamp, then encode with toCode8() using mulberry32(seed) for the dither. Return RGBA Uint8ClampedArray and,
  for tests and debugging, the Float32Array of linear luminance.
- Must be pure TypeScript with no DOM, so it runs in Vitest on Node.

### Step 3: WebGL2 renderer (src/render/webgl.ts)
- Uses src/render/gabor.frag.glsl (import with Vite ?raw) plus a full-screen-triangle vertex shader.
  Context options: antialias false, alpha false, premultipliedAlpha false, preserveDrawingBuffer false.
- Keep it thin. Put all uniform packing into a pure exported function (patch list → typed arrays + count;
  throw if more than MAX_PATCHES = 12) and unit-test that function.
- Coordinate convention must match the CPU renderer exactly: the shader computes
  p = (gl_FragCoord.x, viewportHeight − gl_FragCoord.y), which equals (x + 0.5, y + 0.5) in top-left pixel
  coordinates. Add a comment and a test-documented note on this.
- Add a helper that sizes a canvas backing store to exact device pixels (devicePixelRatio; use
  ResizeObserver with devicePixelContentBoxSize where available) so the browser never rescales the stimulus.
- New seed uniform every frame.

### Step 4: debug page
- debug.html + src/app/debug.ts, registered as a second Vite entry (build.rollupOptions.input) so
  `npm run build` emits both pages.
- Reads URL query parameters: condition, cpd, theta, sep (λ), tc (target contrast), fc (flanker contrast,
  default 0.6), nflank, distanceCm (default 40), pxPerMm (default 1/0.078), mean. Computes λ px with
  lambdaPx(). Renders a static stimulus with WebGL2, falling back to the CPU renderer via putImageData if
  WebGL2 is unavailable, and shows a small readout: px/deg, λ px, σ px, renderer used, devicePixelRatio,
  canvas backing size. Plain DOM, no framework.

### Tests (Vitest, seeded RNG only, no Math.random)
- Layout: flankers lie on the bar axis for θ = 0/45/90/135 (cross product of offset with b ≈ 0) at distance d·λ
  within 0.01 px; target exactly at centre; CROWD counts and order correct, no duplicate positions; invalid counts throw.
- CPU renderer, dither off: Michelson contrast of a single patch measured on the linear field along the carrier
  through the centre equals the specified contrast within 0.5 %; for θ = 0 luminance varies along x and is
  constant along y at the centre column (the bars are vertical); mean luminance far from patches equals the
  specified mean.
- CPU renderer, dither on: over a uniform field the mean code value is within 0.05 of srgbEncode(mean) · 255;
  over a patch region the mean absolute bias between dithered codes and the undithered encoded values is < 0.05.
- Uniform packing: correct array lengths, order and count; more than 12 patches throws.
- Keep the whole suite under 30 s; use small canvases (e.g. 256 × 256) in tests.

### Constraints
- Follow every non-negotiable in CLAUDE.md. No runtime dependencies added. Dev dependencies only with a
  one-line justification in the session notes.
- Do not change the behaviour of existing src/core modules; extending them is fine if tests cover it.
- Do not touch docs/session-notes/ files of other sessions.

### Definition of done
- `npm run typecheck`, `npm test` and `npm run build` all pass.
- docs/session-notes/S1.md: what was built, key decisions (coordinate conventions, crowding layout), test
  summary, open issues, suggestions for S2 (trial engine) and S8 (GPU vs CPU comparison in CI), and a
  "Conductor log": one line per work order with its model and the number of attempts it took.
- All commits pushed to `origin/main`. No pull request.

---

## C. Finish

1. Check every point of the definition of done against WO-V and WO-R.
2. In the last commit, delete this file with `git rm tmp/S1-prompt.md`, together with any other files you
   created under `tmp/`. Then pull with rebase, and push.
3. End the session with a final message of no more than 15 lines. Use the heading
   "S1: rename to nearpoint + stimulus layout and renderers". Cover what was built, the key decisions, the
   test summary, any conductor interventions, and open issues.
