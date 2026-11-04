import { expect, test } from "@playwright/test";
import { PHONE, calibrate, readStore, unexpected, watchErrors } from "./helpers";

interface Segment { frames: number }
interface Trial {
  sessionId: number; blockId: number; trialIndex: number; contrast: number; valid: boolean;
  correct: boolean | null; response: 1 | 2 | null;
  timing: { hz: number; segments: Segment[]; timestamps: number[]; analysis: { valid: boolean; frameCount: number; reasons: string[] } };
}
interface Block { id: number; sessionId: number; blockIndex: number; validTrials: number; invalidTrials: number; trialsPlanned: number }
interface Session { id: number; status: string; abortReason?: string; rngSeed?: number }

// Simulated frame clock. A shared CI machine renders SwiftShader too slowly for real 60 Hz, which made
// every trial invalid (flaky). Here rAF still paces the frames, but the timestamps it reports follow a
// perfect 60 Hz clock with one deliberately late frame (+50 ms, > 1.5 × 16.7 ms) every 200 frames.
// So both valid and invalid trials occur on any machine, and the test checks how they are logged and
// excluded. Real hardware timing is checked on the phone (docs/operator-tests.md).
test.use(PHONE);

test("scripted training session: timing logs stored, invalid trials excluded", async ({ page }, info) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => {
    const real = window.requestAnimationFrame.bind(window);
    let n = 0;
    let t = performance.now();
    window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
      real(() => {
        n++;
        t += n % 200 === 0 ? 50 : 1000 / 60;
        cb(t);
      });
  });
  await calibrate(page);

  await page.evaluate(() => {
    location.hash = "#train?quick=1&auto=1&trials=6";
  });
  await page.getByRole("heading", { name: "Session complete" }).waitFor({ timeout: 220_000 });
  await page.screenshot({ path: info.outputPath("session-complete.png") });
  const summary = await page.locator("main").innerText();
  expect(summary).toMatch(/Trials with invalid timing \(not counted\): \d+/);

  const sessions = await readStore<Session>(page, "sessions");
  expect(sessions).toHaveLength(1);
  expect(sessions[0].status).toBe("aborted");
  expect(sessions[0].abortReason).toBe("quick mode (test run)");
  expect(typeof sessions[0].rngSeed).toBe("number");

  const blocks = (await readStore<Block>(page, "blocks")).sort((a, b) => a.blockIndex - b.blockIndex);
  const trials = await readStore<Trial>(page, "trials");
  expect(blocks.length).toBeGreaterThanOrEqual(1);
  expect(trials.length).toBeGreaterThan(0);

  for (const t of trials) {
    const frames = t.timing.segments.reduce((a, s) => a + s.frames, 0);
    // N intended frames, N + 1 observed rAF timestamps
    expect(t.timing.timestamps).toHaveLength(frames + 1);
    expect(t.timing.analysis.frameCount).toBe(frames);
    expect(t.timing.hz).toBe(60);
    expect(t.valid).toBe(t.timing.analysis.valid);
    if (!t.valid) expect(t.timing.analysis.reasons.length).toBeGreaterThan(0);
  }

  const invalid = trials.filter((t) => !t.valid).length;
  const valid = trials.length - invalid;
  info.annotations.push({ type: "trials", description: `${valid} valid, ${invalid} invalid of ${trials.length}` });
  expect(valid).toBeGreaterThan(0);
  expect(invalid).toBeGreaterThan(0);
  expect(summary).toContain(`Trials with invalid timing (not counted): ${invalid}`);

  for (const b of blocks) {
    const bt = trials.filter((t) => t.blockId === b.id).sort((a, c) => a.trialIndex - c.trialIndex);
    // Block counts match the stored trials: invalid trials are counted separately ...
    expect(b.validTrials).toBe(bt.filter((t) => t.valid).length);
    expect(b.invalidTrials).toBe(bt.filter((t) => !t.valid).length);
    // ... the block ends after N valid trials or 1.5 N attempts ...
    expect(b.validTrials === b.trialsPlanned || bt.length >= Math.floor(1.5 * b.trialsPlanned)).toBe(true);
    // ... and an invalid trial never moves the staircase: the next trial keeps its contrast.
    for (let i = 0; i + 1 < bt.length; i++) if (!bt[i].valid) expect(bt[i + 1].contrast).toBe(bt[i].contrast);
  }
  expect(unexpected(errs)).toEqual([]);
});
