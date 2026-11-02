import { describe, expect, it } from "vitest";
import {
  barAxis, carrierAxis, maskPatches, stimulusPatches, type LayoutParams,
} from "./layout";
import type { Condition } from "./protocol";

const THETAS = [0, 45, 90, 135];
const base = (over: Partial<LayoutParams> = {}): LayoutParams => ({
  condition: "LM", thetaDeg: 0, sepLambda: 3, lambdaPx: 16, cx: 128.5, cy: 100.25,
  targetContrast: 0.2, flankerContrast: 0.6, targetPresent: true, ...over,
});
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];

describe("layout", () => {
  it("LM flankers are collinear with the bars, 48 px away, opposite sides", () => {
    for (const th of THETAS) {
      const p = base({ thetaDeg: th });
      const ps = stimulusPatches(p);
      expect(ps).toHaveLength(3);
      expect(ps[0].x).toBe(p.cx);
      expect(ps[0].y).toBe(p.cy);
      expect(ps[0].contrast).toBe(p.targetContrast);
      const b = barAxis(th);
      const proj: number[] = [];
      for (const f of ps.slice(1)) {
        const dx = f.x - p.cx, dy = f.y - p.cy;
        expect(Math.abs(dx * b[1] - dy * b[0])).toBeLessThan(0.01);
        expect(Math.abs(Math.hypot(dx, dy) - 48)).toBeLessThan(0.01);
        expect(f.contrast).toBe(p.flankerContrast);
        proj.push(dot([dx, dy], b));
      }
      expect(Math.abs(proj[0] - 48)).toBeLessThan(0.01);
      expect(Math.abs(proj[1] + 48)).toBeLessThan(0.01);
    }
  });

  it("axis sanity", () => {
    const eq = (a: number[], e: number[]) => {
      expect(a[0]).toBeCloseTo(e[0], 12);
      expect(a[1]).toBeCloseTo(e[1], 12);
    };
    eq(barAxis(0), [0, -1]);
    eq(carrierAxis(0), [1, 0]);
    eq(barAxis(90), [1, 0]);
    eq(carrierAxis(90), [0, 1]);
    for (const th of THETAS) expect(dot(barAxis(th), carrierAxis(th))).toBeCloseTo(0, 12);
  });

  it("CROWD fills the documented order without overlaps", () => {
    const order = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (const n of [2, 4, 6, 8]) {
      for (const th of THETAS) {
        const p = base({ condition: "CROWD", thetaDeg: th, nFlankers: n });
        const ps = stimulusPatches(p);
        expect(ps).toHaveLength(1 + n);
        const b = barAxis(th), c = carrierAxis(th);
        expect(ps[0].x).toBe(p.cx);
        expect(ps[0].y).toBe(p.cy);
        expect(ps[0].contrast).toBe(p.targetContrast);
        ps.slice(1).forEach((f, k) => {
          const d = [f.x - p.cx, f.y - p.cy];
          expect(Math.abs(dot(d, b) - order[k][0] * 48)).toBeLessThan(0.01);
          expect(Math.abs(dot(d, c) - order[k][1] * 48)).toBeLessThan(0.01);
        });
        for (let a = 0; a < ps.length; a++) {
          for (let e = a + 1; e < ps.length; e++) {
            expect(Math.hypot(ps[a].x - ps[e].x, ps[a].y - ps[e].y)).toBeGreaterThan(0.01);
          }
        }
      }
    }
    expect(stimulusPatches(base({ condition: "CROWD" }))).toHaveLength(9);
  });

  it("invalid flanker counts throw", () => {
    for (const n of [0, 3, 5, 9, 11, 2.5]) {
      const p = base({ condition: "CROWD", nFlankers: n });
      const msg = `nFlankers must be one of 2, 4, 6, 8 (got ${n})`;
      expect(() => stimulusPatches(p)).toThrow(msg);
      expect(() => maskPatches(p)).toThrow(msg);
    }
  });

  it("target absent omits the target", () => {
    const lm = stimulusPatches(base({ targetPresent: false }));
    expect(lm).toHaveLength(2);
    expect(lm.some((q) => q.x === 128.5 && q.y === 100.25)).toBe(false);
    expect(stimulusPatches(base({ condition: "SINGLE", targetPresent: false }))).toEqual([]);
  });

  it("BM conditions map to base layouts and masks", () => {
    const pairs: [Condition, Condition][] = [["BM-T", "SINGLE"], ["BM-LM", "LM"], ["BM-CROWD", "CROWD"]];
    for (const [bm, plain] of pairs) {
      expect(stimulusPatches(base({ condition: bm, thetaDeg: 45 })))
        .toEqual(stimulusPatches(base({ condition: plain, thetaDeg: 45 })));
    }
    const lmFl = stimulusPatches(base({ condition: "LM" })).slice(1);
    expect(maskPatches(base({ condition: "BM-T" }))).toEqual(lmFl);
    expect(maskPatches(base({ condition: "BM-LM" }))).toEqual(lmFl);
    const cr = stimulusPatches(base({ condition: "CROWD", nFlankers: 6 })).slice(1);
    const m = maskPatches(base({ condition: "BM-CROWD", nFlankers: 6 }));
    expect(m).toEqual(cr);
    expect(m).toHaveLength(6);
    expect(m.some((q) => q.x === 128.5 && q.y === 100.25)).toBe(false);
    expect(() => maskPatches(base({ condition: "SINGLE" }))).toThrow("condition SINGLE has no mask frame");
  });

  it("validates lambdaPx and sepLambda", () => {
    expect(() => stimulusPatches(base({ lambdaPx: 0 }))).toThrow("lambdaPx must be > 0 (got 0)");
    expect(() => stimulusPatches(base({ sepLambda: 0 }))).toThrow("sepLambda must be > 0 (got 0)");
    expect(() => stimulusPatches(base({ condition: "SINGLE", sepLambda: 0 }))).not.toThrow();
  });
});
