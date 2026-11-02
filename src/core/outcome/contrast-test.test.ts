import { describe, expect, it } from "vitest";
import { DEFAULT_OBSERVER, makeObserver, weibullInverse } from "../observer";
import { mulberry32 } from "../rng";
import { CONTRAST_TEST, ContrastTestRun, contrastTestFrames } from "./contrast-test";

describe("contrastTestFrames", () => {
  it("whole frames at 60 Hz: 12 fixation + 24 blank + 12 stim + 30 gap + 12 stim", () => {
    const f = contrastTestFrames(60, 1);
    expect(f).toHaveLength(12 + 24 + 12 + 30 + 12);
    expect(f.filter((x) => x.showFixation)).toHaveLength(12);
    expect(f.filter((x) => x.phase === "stim" && x.interval === 1)).toHaveLength(12);
    expect(f.filter((x) => x.phase === "stim" && x.interval === 2)).toHaveLength(12);
  });

  it("target in exactly one interval, never flankers", () => {
    for (const ti of [1, 2] as const) {
      for (const hz of [60, 120]) {
        const f = contrastTestFrames(hz, ti);
        const intervals = new Set(f.filter((x) => x.showTarget).map((x) => x.interval));
        expect([...intervals]).toEqual([ti]);
        expect(f.some((x) => x.showFlankers)).toBe(false);
        expect(f.filter((x) => x.showTarget)).toHaveLength(Math.round((CONTRAST_TEST.durMs * hz) / 1000));
      }
    }
  });
});

describe("ContrastTestRun", () => {
  it("simulated observer: 3-down/1-up recovers the 79.4 % point (100 seeds)", () => {
    const target = Math.log10(weibullInverse(0.5 ** (1 / 3), DEFAULT_OBSERVER));
    const logs: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const run = new ContrastTestRun(4, mulberry32(seed));
      const obs = makeObserver(DEFAULT_OBSERVER, mulberry32(seed + 5000));
      while (!run.done) {
        const t = run.next();
        const ok = obs(t.contrast);
        run.record(ok ? t.targetInterval : t.targetInterval === 1 ? 2 : 1, true);
      }
      const r = run.result();
      if (r.threshold !== null) logs.push(Math.log10(r.threshold));
    }
    const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
    console.log(`contrast test mean log10 threshold ${mean.toFixed(3)} vs target ${target.toFixed(3)} (n=${logs.length})`);
    expect(logs.length).toBeGreaterThanOrEqual(95);
    expect(Math.abs(mean - target)).toBeLessThan(0.1);
  });

  it("timing-invalid trials are recorded but never move the staircase; attempts are capped", () => {
    const run = new ContrastTestRun(2, mulberry32(1));
    const c0 = run.next().contrast;
    run.record(1, false);
    for (let i = 0; i < 20; i++) {
      const t = run.next();
      expect(t.contrast).toBe(c0);
      run.record(t.targetInterval, false);
    }
    expect(run.result().validTrials).toBe(0);
    expect(run.result().invalidTrials).toBe(21);
    while (!run.done) run.record(run.next().targetInterval, false);
    expect(run.trials).toHaveLength(CONTRAST_TEST.maxAttempts);
    expect(run.result().threshold).toBeNull();
  });

  it("discard forgets the pending trial; record without next throws", () => {
    const run = new ContrastTestRun(6, mulberry32(2));
    run.next();
    run.discard();
    expect(() => run.record(1, true)).toThrow();
    expect(run.trials).toHaveLength(0);
  });

  it("logCS = −log10 threshold", () => {
    const run = new ContrastTestRun(4, mulberry32(3));
    while (!run.done) {
      const t = run.next();
      run.record(t.contrast > 0.01 ? t.targetInterval : t.targetInterval === 1 ? 2 : 1, true);
    }
    const r = run.result();
    expect(r.threshold).not.toBeNull();
    expect(r.logCS).toBeCloseTo(-Math.log10(r.threshold!), 10);
  });
});

describe("ContrastTestRun limits", () => {
  it("a shortened run stops after maxTrials valid trials", () => {
    const run = new ContrastTestRun(4, mulberry32(4), { maxTrials: 5 });
    let n = 0;
    while (!run.done) {
      run.record(run.next().targetInterval, true);
      n++;
    }
    expect(n).toBe(5);
  });
});
