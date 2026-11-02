import { describe, expect, it } from "vitest";
import { BlockRunner, type TrialSetup } from "./block-runner";
import { DEFAULT_OBSERVER, makeObserver, weibullInverse } from "./observer";
import { mulberry32 } from "./rng";
import type { Block } from "./protocol";

const SC = { start: 0.2, step: 0.1, down: 2, floor: 0.003 };
const BM: Block = { condition: "BM-LM", cpd: 4, theta_deg: 0, dur_ms: 68, trials: 50, flank_contrast: 0.6, sep_lambda: [3], isi_ms: [83, 116] };

function runAll(block: Block, seed: number, valid: (i: number) => boolean = () => true, answer?: (s: TrialSetup) => 1 | 2) {
  const r = new BlockRunner(block, SC, 60, mulberry32(seed));
  const setups: TrialSetup[] = [];
  while (!r.done) {
    const s = r.next();
    setups.push(s);
    r.record({ response: answer ? answer(s) : s.plan.targetInterval, timingValid: valid(s.trialIndex) });
  }
  return { r, setups };
}

describe("BlockRunner", () => {
  it("simulated observer converges near 70.7 %", () => {
    const target = Math.log10(weibullInverse(0.7071, DEFAULT_OBSERVER));
    const logs: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const rng = mulberry32(seed);
      const obs = makeObserver(DEFAULT_OBSERVER, mulberry32(seed + 1000));
      const r = new BlockRunner(BM, SC, 60, rng);
      while (!r.done) {
        const s = r.next();
        const ok = obs(s.contrast);
        r.record({ response: ok ? s.plan.targetInterval : s.plan.targetInterval === 1 ? 2 : 1, timingValid: true });
      }
      const t = r.result().threshold;
      if (t !== null) logs.push(Math.log10(t));
    }
    const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
    console.log(`block-runner mean log10 threshold ${mean.toFixed(4)} vs target ${target.toFixed(4)} (n=${logs.length})`);
    expect(logs.length).toBeGreaterThanOrEqual(90);
    expect(Math.abs(mean - target)).toBeLessThan(0.2);
  });

  it("all-invalid trials leave the staircase alone", () => {
    const { r, setups } = runAll(BM, 3, () => false);
    expect(setups.every((s) => s.contrast === 0.2)).toBe(true);
    const res = r.result();
    expect(res.attempts).toBe(75);
    expect(res.validTrials).toBe(0);
    expect(res.invalidTrials).toBe(75);
    expect(res.threshold).toBeNull();
    expect(setups[74].trialIndex).toBe(74);
  });

  it("mixed validity", () => {
    const { r } = runAll(BM, 4, (i) => (i + 1) % 5 !== 0);
    const res = r.result();
    expect(res.validTrials).toBe(50);
    expect(res.attempts).toBe(res.validTrials + res.invalidTrials);
    expect(res.attempts).toBe(62);
  });

  it("draws and determinism", () => {
    const { setups } = runAll(BM, 5);
    expect(setups.every((s) => s.sepLambda === 3 && (s.isiMs === 83 || s.isiMs === 116))).toBe(true);
    expect(new Set(setups.map((s) => s.isiMs)).size).toBe(2);
    const single: Block = { condition: "SINGLE", cpd: 4, theta_deg: 0, dur_ms: 68, trials: 20, sep_lambda: [3], isi_ms: [83] };
    const { setups: ss } = runAll(single, 6);
    expect(ss.every((s) => s.sepLambda === null && s.isiMs === null)).toBe(true);
    const lm: Block = { ...single, condition: "LM", flank_contrast: 0.6 };
    const { setups: ls } = runAll(lm, 6);
    expect(ls.every((s) => s.sepLambda === 3 && s.isiMs === null)).toBe(true);
    const a = runAll(BM, 7, () => true, (s) => (s.trialIndex % 3 ? 1 : 2)).setups;
    const b = runAll(BM, 7, () => true, (s) => (s.trialIndex % 3 ? 1 : 2)).setups;
    expect(b).toEqual(a);
  });

  it("discard drops the pending trial without counting it", () => {
    const r = new BlockRunner(BM, SC, 60, mulberry32(3));
    expect(() => r.discard()).toThrow("no trial pending");
    const first = r.next();
    r.discard();
    const second = r.next();
    expect(second.trialIndex).toBe(first.trialIndex);
    expect(second.contrast).toBe(first.contrast);
    r.record({ response: second.plan.targetInterval, timingValid: true });
    const res = r.result();
    expect(res.attempts).toBe(1);
    expect(res.validTrials).toBe(1);
    expect(res.invalidTrials).toBe(0);
  });

  it("errors", () => {
    const r = new BlockRunner(BM, SC, 60, mulberry32(1));
    expect(() => r.record({ response: 1, timingValid: true })).toThrow("no trial pending");
    r.next();
    expect(() => r.next()).toThrow("previous trial not recorded");
    const { r: d } = runAll({ ...BM, trials: 2 }, 1);
    expect(d.done).toBe(true);
    expect(() => d.next()).toThrow("block is done");
  });
});
