import { describe, expect, it } from "vitest";
import { framePatches } from "./frame-patches";
import { maskPatches } from "./layout";
import { mulberry32 } from "./rng";
import { buildTrial, expandFrames } from "./trial";

const base = { thetaDeg: 0, sepLambda: 3, lambdaPx: 16, cx: 128, cy: 128, targetContrast: 0.1, flankerContrast: 0.6 };

describe("framePatches", () => {
  const lp = { ...base, condition: "BM-LM" as const };
  const frames = expandFrames(buildTrial({ condition: "BM-LM", hz: 60, durMs: 68, isiMs: 83 }, mulberry32(1)));

  it("target-interval stim frames have target plus flankers", () => {
    const fs = frames.filter((f) => f.phase === "stim" && f.showTarget);
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) {
      const p = framePatches(f, lp);
      expect(p).toHaveLength(3);
      expect(p[0]).toEqual({ x: 128, y: 128, contrast: 0.1 });
    }
  });

  it("non-target stim frames have flankers only", () => {
    const fs = frames.filter((f) => f.phase === "stim" && !f.showTarget);
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) {
      const p = framePatches(f, lp);
      expect(p).toHaveLength(2);
      expect(p.every((q) => q.contrast === 0.6)).toBe(true);
    }
  });

  it("mask frames give the mask patches", () => {
    const fs = frames.filter((f) => f.phase === "mask");
    expect(fs.length).toBeGreaterThan(0);
    const expected = maskPatches({ ...lp, targetPresent: false });
    expect(expected).toHaveLength(2);
    for (const f of fs) expect(framePatches(f, lp)).toEqual(expected);
  });

  it("other phases give nothing", () => {
    for (const ph of ["fixation", "blank", "isi", "gap"]) {
      const fs = frames.filter((f) => f.phase === ph);
      expect(fs.length).toBeGreaterThan(0);
      for (const f of fs) expect(framePatches(f, lp)).toEqual([]);
    }
  });

  it("SINGLE non-target stim frames give []", () => {
    const fs = expandFrames(buildTrial({ condition: "SINGLE", hz: 60, durMs: 68 }, mulberry32(1)));
    const non = fs.filter((f) => f.phase === "stim" && !f.showTarget);
    expect(non.length).toBeGreaterThan(0);
    for (const f of non) expect(framePatches(f, { ...base, condition: "SINGLE" })).toEqual([]);
  });

  it("flanker and target presence match the frame flags for every condition", () => {
    const conds = ["SINGLE", "LM", "CROWD", "BM-T", "BM-LM", "BM-CROWD"] as const;
    for (const condition of conds) {
      const masked = condition.startsWith("BM");
      const spec = { condition, hz: 60, durMs: 68, ...(masked ? { isiMs: 83 } : {}) };
      const fr = expandFrames(buildTrial(spec, mulberry32(3)));
      const lp = { ...base, condition, nFlankers: 8 };
      for (const f of fr) {
        const p = framePatches(f, lp);
        const hasFlanker = p.some((q) => !(q.x === base.cx && q.y === base.cy));
        const hasTarget = p.some((q) => q.x === base.cx && q.y === base.cy);
        expect(hasFlanker, `${condition} ${f.phase} flankers`).toBe(f.showFlankers);
        expect(hasTarget, `${condition} ${f.phase} target`).toBe(f.showTarget);
      }
    }
  });

  it("BM-T mask frames give exactly 2 patches", () => {
    const fr = expandFrames(buildTrial({ condition: "BM-T", hz: 60, durMs: 68, isiMs: 83 }, mulberry32(3)));
    const masks = fr.filter((f) => f.phase === "mask");
    expect(masks.length).toBeGreaterThan(0);
    for (const f of masks) expect(framePatches(f, { ...base, condition: "BM-T" })).toHaveLength(2);
  });
});
