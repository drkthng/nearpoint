# Training protocol

Published values come from Polat et al. 2012 (Sci Rep 2:278, PC, UC Berkeley) and Yehezkel et al. 2016
(Sci Rep 6:25188, iPhone/iPod/PC, GlassesOff). Oryx (2026) cites this work; its exact algorithm is not public.

## Published parameters

| Parameter | Published value | Source |
|---|---|---|
| Viewing | 40 cm, both eyes open, habitual distance correction, no near correction | 2012, 2016 |
| Environment | Dark room, display at maximum luminance (~120 cd/m² on iOS) | 2016 |
| Stimulus | Gabor patches, σ allowing at least 2 visible cycles | 2012 |
| Spatial frequency | 2–8 cycles/degree; start chosen from initial acuity | 2016 |
| Patch size | 0.18–1° | 2016 |
| Orientations | 0, 45, 90, 135°; target and flankers always iso-oriented | 2016 |
| SINGLE | Target alone | 2012, 2016 |
| LM | Target + 2 collinear flankers; flanker contrast 40 % (2012) / 60 % (2016); target–flanker distance 2–4 λ, several per session | 2012, 2016 |
| CROWD | Target + 4–11 iso-oriented flankers, collinear or not, several distances | 2016 |
| Backward masking | Flankers (or crowd array) re-presented after ISI; mask duration = target duration | 2012, 2016 |
| ISI | 68, 83, 116, 150 ms (2016); 60–240 ms in 30 ms steps (2012) | |
| Target duration | 34, 68, 116 ms (iOS) = 2, 4, 7 frames at 60 Hz; 60–120 ms (PC) | 2016, 2012 |
| Task | 2-interval forced choice: which interval held the target | 2012, 2016 |
| Trial timing | Fixation circle 0.7° for 200 ms; 300 ms blank before each interval; intervals 500 ms apart; temporal jitter | 2012 |
| Feedback | Auditory and visual after every trial | 2012, 2016 |
| Within session | Contrast threshold by staircase per block; contrast floor just above 1 % on 8-bit displays | 2016 |
| Between sessions | Change one parameter at a time based on previous session; orientation every 2 sessions; spatial frequency raised after a contrast criterion is reached | 2012, 2016 |
| Dose | ~210 trials/session on iOS (~12 min); ~350 on PC (~30 min); ≥ 3 sessions/week; 25–65 sessions; stop at plateau, minimum 25 | 2016 |
| Reported effect | Near VA 0.31 → 0.13 logMAR (n = 119); reading speed at minimal print 52 → 77 wpm (n = 63) | 2016 |

Oryx (public): 30–40 daily sessions, up to 10 minutes each; calibration step; per-block score and difficulty card.

## Equations

Gabor luminance: `L(x,y) = L0 · [1 + Σ_i C_i · exp(−r_i² / 2σ²) · cos(2π u_i / λ)]`, `u = dx·cos θc + dy·sin θc`,
θc = carrier direction (perpendicular to the bars). Collinear flankers sit along the bar axis at ± d·λ.

Geometry: `mm per degree = 2 · D · tan(0.5°)` (6.98 mm at 40 cm); `λ_px = pxPerDegree / cpd`.

Blur disc (for reasoning, not used at runtime): `β [rad] ≈ pupil [m] × defocus [D]`.

## Our choices (not published; revisit with data)

| Choice | Value | Rationale |
|---|---|---|
| Staircase | 2-down/1-up, 0.1 log10 step, threshold = geometric mean of last 8 reversals (min 4) | Simple, validated against simulated observer in `src/core/core.test.ts` |
| Contrast floor | 0.3 % | Dithering makes sub-1 % steps meaningful on average; verify with photometer |
| σ | σ = λ | ≈ 2 visible cycles |
| Spatial-frequency step criterion | Raise cpd one step on the ladder 2 → 3 → 4 → 6 → 8 when the geometric mean of the previous session's block thresholds is < 5 %; only in sessions without an orientation change | Published: raised after a contrast criterion; criterion value and ladder are placeholders |
| Plateau rule | Stop (only from session 25 on) when the mean log10 score of the last 4 scored sessions at the current cpd is less than 0.01 log10 better than the mean of the 4 before them; needs ≥ 8 scored sessions at the current cpd; always stop at 65. Score = geometric mean of the session's converged block thresholds (non-converged blocks ignored) | Published: stop at plateau, minimum 25; definition, window and 0.01 margin are ours (window means average out staircase noise; 2 %/session learning moves the windows ≈ 0.035 log10 apart) |
| Orientation rotation | Every 2 sessions: the 3rd, 5th, 7th, … sessions (0-based index 2, 4, 6, …) rotate 0 → 45 → 90 → 135 → 0; rotation has priority over a cpd raise, which is then re-evaluated in the next session; rotation every session is rejected when only one change per session is allowed | Published: orientation every 2 sessions, one parameter change per session |
| Within-block parameter lists | Each trial draws sep_lambda and isi_ms uniformly (seeded) from the block's lists; one staircase per block | Published: "several distances per session"; per-value staircases would need more trials than a block has |
| Schedule | daily, ≤ 12 min | Between Oryx (10 min daily) and GlassesOff (12 min, ≥ 3/week) |
| Flanker contrast | 60 % | 2016 protocol |
| Crowding layout | 3×3 grid, offsets i·dλ·b + j·dλ·c (i, j ∈ {−1, 0, 1}, centre excluded); n ∈ {2, 4, 6, 8}, filled in order: collinear pair, pair along the carrier, diagonals | Literature gives counts (4–11) but not positions; a grid aligned with the bars keeps the collinear pair identical to LM |
| Backward-masking layouts | BM-T: target alone, mask = collinear flanker pair; BM-LM: LM, mask = same pair; BM-CROWD: CROWD, mask = same crowd array | Published: "flankers (or crowd array) re-presented after ISI"; for BM-T the mask flankers are our assumption |
| Target absent (2IFC blank interval) | Target patch omitted; flankers unchanged | Only the target differs between intervals |
| Patch support | Each patch evaluated within 3.5σ of its centre (CPU and GPU identical) | Envelope < 0.22 % beyond; bounds CPU cost |
| Mean luminance | 0.214 linear (sRGB code ≈ 127.5, mid-grey) | Maximises symmetric contrast headroom on an sRGB fallback |
| Dither hash (GPU) | Integer PCG hash of (pixel x, pixel y, 32-bit per-frame seed) | sin-based hashes lose precision at large pixel coordinates; CPU uses mulberry32 (same distribution, different stream) |
| Trial sequence | Fixation 200 ms → blank 300 ms + jitter → interval 1 → gap 500 ms → interval 2 → response; every segment in whole frames (`framesFor`). The 500 ms gap runs from the end of interval 1 (after the mask, if any) to the start of interval 2. | Published elements (2012); one pre-blank with jitter before interval 1 rather than before each interval keeps the 500 ms inter-interval gap fixed |
| Temporal jitter | Uniform 0–250 ms in whole frames (max = floor(250·hz/1000) frames, never above 250 ms), added to the pre-interval blank | "Temporal jitter" is published without a range |
| Fixation mark | Shown only during the 200 ms fixation segment | Published sequence; revisit if fixation is unstable |
| ISI | Blank frames between target offset and mask onset (not onset-to-onset) | Published values do not say which; offset-to-onset is the common definition |
| Target interval | 50/50 per trial from the seeded RNG | Standard 2IFC |
| Late-frame rule | Every frame of the trial (fixation to end of interval 2) is checked; interval > 1.5× nominal ⇒ invalid; N frames are logged with N+1 rAF timestamps | CLAUDE.md non-negotiable 2 |
| Training device | Samsung Galaxy S24, Chrome PWA, landscape, fixed 60 Hz ("Standard" motion smoothness), "Natural" screen mode, max brightness | The 2016 study ran on iPhone/iPod; a phone at 40 cm matches it; 60 Hz keeps published durations at 2/4/7 frames |
| Block length | A block ends after its planned number of timing-valid trials, or after 1.5× that many attempts | Invalid-timing trials do not update the staircase (non-negotiable 2) but must not make a block endless |
| Per-trial draws | sep_lambda, then isi_ms (masked only), then target interval and jitter, all from the session's seeded RNG | Sessions can be replayed from the stored seed |
| Relative index | (1 − threshold / median of your past thresholds for the same condition and cpd) × 100 %; positive = better | Oryx shows a per-block difficulty card; its formula is not public |
| Card calibration | px/mm from matching an ID-1 card (85.60 × 53.98 mm) on screen | ISO/IEC 7810 ID-1 size; no ruler needed |
| Blind-spot distance check | Optional; distance = offset / tan(15°) | Blind spot ≈ 15° temporal to fixation (textbook value); rough check only |
| Outcome: optotypes | 10 Sloan letters (C D H K N O R S V Z) drawn by us as stroked centre-line paths on a 5 × 5 grid (stroke = 1/5 height), clipped to the box | No font file, so no licence question; approximation of Sloan's design, not a certified chart |
| Outcome: near acuity | Lines +1.0 … −0.3 logMAR in 0.1 steps, 5 letters per line; crowded = ETDRS spacing (1 letter width edge to edge), uncrowded = one letter at a time; start at 0.7, go up until a line has ≥ 4 correct, then down until a line has ≥ 3 errors; score = largest tested line + 0.1 − 0.02 × letters correct; lines with letters < 5 device px or wider than the screen are not offered | Standard per-letter logMAR scoring; start/stop rules follow common ETDRS practice |
| Outcome: time-limited letters | 300 ms fixation cross, then the letters for 250 ms (whole frames); a presentation with a late frame is repeated with new letters (at most 4 times) | Time-limited near acuity has no published duration here; 250 ms is below typical saccade latency |
| Outcome: reading speed | Own 10-word sentences; print size = x-height in logMAR (+1.0 … −0.2), font x-height measured on the device; tap to show, tap when read aloud, then enter misread words; wpm = 60 × (10 − errors) / s; stop after ≥ 5 errors or "could not read"; reading acuity = largest size + 0.1 − 0.01 × words correct; CPS = smallest size such that every size down to it reads at ≥ 80 % of their mean speed; MRS = that mean | MNREAD-style metrics (MNREAD sentences are copyrighted); the CPS rule is a simple plateau criterion |
| Outcome: contrast sensitivity | Isolated vertical Gabor (σ = λ) at 2, 4, 6 cpd, 2IFC, 200 ms per interval; fixation 200 ms, blank 400 ms, gap 500 ms; 3-down/1-up, 0.1 log10 step, start 10 %, floor 0.2 %; stop at 10 reversals, 60 valid trials or 90 attempts; threshold = geometric mean of the last 6 reversals; no per-trial feedback | Separate stimulus path from training (non-negotiable 6); 3-down/1-up targets 79.4 %; no feedback so the test measures rather than trains |
| Outcome: printable chart | A4 SVG in mm, lines +1.0 … −0.2 at the calibrated distance, two fixed letter orders (A, B), 100 mm check bar | −0.3 at 40 cm is ≈ 0.29 mm high, below common print quality |
| Instructions and practice | Block cards show two example pictures (CPU reference render, target at 50 % so it is easy to see) and a plain-language rule ("middle filled or gap"); "Practice first" runs 6 trials per block, saved as a test run, never counted | Published studies give instructions and practice but do not describe them; a phone user without an experimenter needs pictures |
| Disturbed rounds | Rotation/resize, a hidden page or a lost GPU context at any point of a round (stimulus or answer phase) discards the round (not stored, staircase unchanged) and pauses | A round the participant did not fully see, or answered on a blank screen, carries no information |
| Outcome-test schedule | Baseline before training session 1, again after every 10 completed sessions, and at program end; the start screen shows when they are due | Published studies test before and after training; intermediate points every 10 sessions show the time course |

## Open questions
- Exact SF-step criterion and plateau rule used commercially.
- Crowding layouts: 4–11 flankers in the literature; > 8 layouts undefined. Ours supports 2, 4, 6, 8 on a 3×3 grid aligned with the bars (see Our choices).
- Whether 120 Hz panels should be locked to 60 Hz for comparability with published durations.
