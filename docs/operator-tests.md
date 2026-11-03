# Operator tests (things only you can test)

Cloud sessions and CI cover the logic, the shader maths (under a software GPU), the data layer, offline
caching and a scripted session in headless Chrome. What they cannot cover is the **real phone**: its
GPU, its 60 Hz display, touch, fullscreen, wake lock, the physical size of things on screen, the printed
chart and your own eyes. That is this list. Order matters: do A → H once, in one sitting if you can
(about 1.5 h), and report back as in section I.

Expected values below assume a **Galaxy S24** (6.2", 2340 × 1080, 416 ppi) at **40 cm**.

---

## A. Put the app on an HTTPS address (once, about 15 min)

Install, offline mode and the screen wake lock only work over HTTPS. Data never leaves the phone; the
host only serves the app's files.

Recommended: **Cloudflare Pages** (free, works with a private repository).
1. On a computer: dash.cloudflare.com → sign up / log in → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git** (the wording may be "Import an existing Git repository").
2. Authorise GitHub and select only the repository `drkthng/nearpoint`.
3. Build settings: framework preset **None**, build command `npm run build`, build output directory
   `dist`. Under environment variables add `NODE_VERSION` = `22`.
4. **Save and deploy**. Wait for "Success" (about 1–2 min).

Expected: a URL like `https://nearpoint-xxxx.pages.dev`. Open it on the computer: the start screen with
the "not a medical device" text appears. Every push to `main` redeploys automatically.

(Alternative: GitHub → Settings → Pages → Source "GitHub Actions", then Actions → "Deploy to GitHub
Pages" → Run workflow. Only works for a private repository on a paid GitHub plan.)

## B. Install on the phone (5 min)

1. Phone settings first (needed for every session):
   Settings → Display → **Motion smoothness: Standard**; **Screen mode: Natural**;
   **Adaptive brightness: off**; **Eye comfort shield: off**; brightness slider at **maximum**;
   battery **power saving off**. Media volume about half.
2. Open the URL from A in **Chrome** (not Samsung Internet).
3. Chrome menu ⋮ → **Add to home screen** → **Install**.

Expected:
- A grey icon with a striped patch appears on the home screen.
- Opening it: no address bar, landscape; Android's status/navigation bars stay visible on the menus
  (sessions and tests switch to fullscreen). **Close app** on the start screen closes it, or shows how.
- Start screen shows "Storage: granted" or "persisted" (if it says "denied", tell me; data could then
  be evicted under storage pressure, so backups matter more).

## C. Calibrate (10 min) — in the installed app

You need: a bank card (or any ID-1 card), a tape measure or a 40 cm string, a phone stand.

1. Start screen → **Calibrate**.
2. Tick all checklist boxes (only after actually doing them).
3. **Card size**: hold the card flat against the screen, top-left corner on the outline's corner.
   Drag the slider, then fine-tune with − / + until the outline matches the card edges exactly.
4. Distance: leave 40. Set up the stand so the screen is 40 cm from the bridge of your nose.
5. Optional blind-spot check: from 40 cm, close your **left** eye, look at the **+** with the right eye,
   move the slider until the dot vanishes, tap **Dot disappeared**.
6. **Measure refresh rate** (keep the phone still, don't touch the screen), then **Save calibration**.

Expected:
- Card readout: **≈ 16.4 px/mm** (16.1–16.7 is fine). Something like 8 or 33 means the outline was
  matched wrongly.
- Blind spot: **≈ 35–45 cm**. A rough check only; ignore it if it is odd.
- Refresh: **"60 Hz (measured 59.8–60.2 Hz)"** with **no** red warning.
  - "120 Hz" → Motion smoothness is not Standard.
  - "Frame timing is irregular" → close other apps and re-measure.
- Start screen afterwards: "Calibrated: today; 16.x px/mm, distance 40 cm, refresh 60 Hz".

## D. Smoke test of training (10 min) — in Chrome, not the installed app

Quick runs need the address bar, so use a normal Chrome tab on the **same URL** (it shares the data
with the installed app). Quick runs are saved as test runs and never count as training. The same
explanation is in the app: training screen → "How a trial works", and a hint on every block card.

**What you do in one round (about 2 s):** every block card shows two example pictures of what to look for.
1. Phone in the stand at 40 cm, landscape. Keep your eyes on the **middle** of the screen.
2. A small dark circle appears in the middle = "look here now".
3. Then come **two short moments**, half a second apart. Striped blobs pop up at those moments.
4. Your job: find the faint patch **in the middle**. It is there at only **one** of the two moments.
   - Block 1: the patch pops up only once → was it early (left) or late (right)?
   - Blocks 2–4: helper blobs pop up **both** times, so the two moments look almost the same. Look at
     the middle: one time there is a **gap** (empty), the other time the gap is **filled** (the blobs
     merge into one long band). Pick the time when the middle was filled.
5. The screen then shows 1 (left) and 2 (right): tap **left** = first time, **right** = second time.
6. Beep + green circle = right, buzz + red circle = wrong. It gets fainter after two right answers, so
   you will soon be guessing often. That is intended; always pick one.

**Steps:**
1. Open `https://<your-site>/#train?quick=1&trials=6` → read "How a trial works" → **Start**.
2. On each block card read the hint → **Tap to start** → do 6 trials. 4 blocks, about 3 min in total.
   (In the normal training screen the button **Practice first (short, not counted)** does the same.)

Expected:
- The page goes fullscreen with a uniform mid-grey background. There is no visible noise, no banding and
  no blotches; the dithering is invisible at 40 cm.
- Block 1 ("Single target"): one patch of **vertical** stripes at the centre, about **1.7 mm stripe
  period** (4 cycles/degree) and roughly 1 cm across. It starts clearly visible (20 %) and gets
  fainter as you answer correctly.
- Block 2 ("Target with two flankers"): two strong patches **above and below** the target, on the line
  of the stripes.
- Block 3 ("Flankers, then mask"): the flanker pair flashes again shortly after the target.
- Block 4 ("Target in a crowd"): the target is surrounded by 8 patches.
- After every answer you hear a **high beep (correct) or low buzz (wrong)** and the ring turns green or red.
- Bottom-left counter: "Trial k · invalid timing: n". **n should stay at 0–1.**
- Block cards show "Valid trials: 6 · invalid timing: 0" (or 1).
- End: "Session complete … Quick test run: not stored as a completed session."

Also try these three things during the smoke test:
- **Home button** mid-trial, then return → "Paused — tap to continue". That trial is not counted.
- **Rotate to portrait** mid-block → "Turn the phone to landscape." Back to landscape → "Paused".
- **Stop** (top right) → confirm → back to the start screen. History → "Aborted and test sessions"
  lists the run.

## E. Baseline outcome tests (about 35 min) — in the installed app, before the first real session

Start screen → **Outcome tests**. Same stand, 40 cm, both eyes open, no reading glasses, same lighting
each time. Do them in this order:

1. **Near acuity — crowded → Start.** Enter each line's letters left to right with the keypad.
   Guess when unsure.
   - **Physical size check (important):** when the first line (0.7 logMAR) is shown, measure a letter's
     height with a ruler. Expected **2.9 mm** (letters at 1.0 logMAR would be 5.8 mm).
     More than 0.2 mm off means the card calibration is off; redo C.
   - Result: a logMAR value, typically about −0.1 to +0.5 for presbyopes without reading glasses.
     Watch for "may be better/worse" warnings.
2. **Near acuity — crowded → Time-limited.** A cross, then the line flashes for 250 ms; enter what you saw.
   - Expected: a flash that is short but clearly a flash. The result is equal to or worse than the
     unlimited one. "Presentations repeated because of timing glitches" is absent or 1–2.
3. **Near acuity — uncrowded** (Start, then Time-limited): single letters.
   - Expected: equal to or slightly better than crowded.
4. **Reading speed → Start.** Tap **Show**, read the sentence **aloud** at your normal fast pace, tap
   anywhere the moment you finish, then enter the number of misread or skipped words.
   - Expected: 7–12 sentences, with speeds of roughly **120–200 words/min** at the large sizes, dropping
     at the small ones. The result shows maximum reading speed, critical print size and reading acuity.
     Tell me if the timing felt wrong (for example, the "tap when done" did not react at once).
5. **Contrast sensitivity → Start** (about 10 min, 3 runs: 2, 4, 6 cycles/degree). A faint patch is in
   one of two flashes. Tap left (first) or right (second). There is no beep: that is intentional.
   - Expected: each run ends with a threshold (not "not converged"), roughly **0.5–5 %**, and
     "Invalid timing" 0–2 per run.

History → "Outcome tests" should list all of them with today's date.

## F. Printed chart (15 min)

1. Outcome tests → **Download chart A (SVG)** on a computer (or open it and print from the browser).
2. Print on A4 with scaling **100 % / Actual size** (not "fit to page").
3. Measure the **100 mm bar**: it must be **100 mm ± 1 mm**. Measure a top-line (1.0) letter:
   **5.8 mm** tall.
4. Read it at 40 cm in good, even light. Stop after a line with 3 or more errors. Score = top line
   (1.0) + 0.1 − 0.02 × letters correct.

Expected: the paper score is within **±0.1 logMAR** (one line) of the app's "crowded, unlimited"
result. A bigger gap suggests a calibration or lighting problem.

## G. Offline, wake lock, update (10 min)

1. **Wake lock**: Settings → Display → Screen timeout → **30 seconds** (temporarily). In the installed
   app start a quick run in Chrome (D) or a real session, and on a "Tap to start" card wait **60 s**
   without touching. Expected: the screen stays on. Then set the timeout back.
2. **Offline**: open the installed app once, then turn on **Airplane mode**, swipe the app away from
   recent apps, and open it again from the home screen. Expected: the start screen appears, Outcome
   tests and History open, and a session can start. Turn Airplane mode off afterwards.
3. **Update** (only after the next push to `main`): open the app twice. Expected: a yellow banner "A
   new version of nearpoint is ready" with **Reload**. Tapping it reloads, and your data is still there.

## H. First real training session (15 min)

Start screen → **Start training** (installed app).

Expected:
- The plan says "Session 1, 4 cpd, orientation 0°", with 4 blocks (40 / 50 / 50 / 50 trials). It takes
  about 12–15 min.
- Invalid timing per block is **0–2** (anything over about 5 % of trials means something is wrong).
- The session summary has a threshold for every block (not "–"), typically about 1–20 %.
  - At 90 %: you never saw the target.
  - At 0.3 %: the floor; tell me.
- History shows Session 1 in the table and the threshold chart.

Then **Data → Download backup (JSON)** and **Export CSV** (allow multiple downloads). Expected: 1 JSON
and 5 CSV files in Downloads. Keep the backup somewhere off the phone.

## I. What to send back

Paste into the chat:
1. The calibration line from the start screen (px/mm, Hz), plus the measured letter height (E1) and
   the printed bar (F3).
2. The per-block "Valid / invalid timing" numbers from D and H.
3. All outcome results (E) and the paper score (F).
4. Anything that looked or felt wrong: visible noise or banding, patches not centred, a ring of the wrong
   size, laggy taps, no sound, the screen dimming, fullscreen not working. A screenshot helps
   (Power + Volume down).
5. If invalid timing is above about 5 %: attach `trials.csv` from the CSV export.
