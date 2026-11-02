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
| Spatial-frequency step criterion | threshold < 5 % | Placeholder |
| Plateau rule | no threshold improvement over 4 sessions | Placeholder |
| Schedule | daily, ≤ 12 min | Between Oryx (10 min daily) and GlassesOff (12 min, ≥ 3/week) |
| Flanker contrast | 60 % | 2016 protocol |

## Open questions
- Exact SF-step criterion and plateau rule used commercially.
- Crowding layouts (positions of 4–11 flankers) are not fully specified; ours: 3×3 grid around the target, aligned with the bars.
- Whether 120 Hz panels should be locked to 60 Hz for comparability with published durations.
