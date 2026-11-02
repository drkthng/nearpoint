import { describe, expect, it } from "vitest";
import {
  buildTrial,
  expandFrames,
  hasFlankers,
  isMasked,
  maxJitterFrames,
  type FrameSpec,
  type TrialPlan,
} from "./trial";
import type { Condition } from "./protocol";
import { mulberry32 } from "./rng";

const CONDITIONS: Condition[] = ["SINGLE", "LM", "CROWD", "BM-T", "BM-LM", "BM-CROWD"];
const build = (c: Condition, hz = 60, durMs = 68, seed = 1, isiMs = 83): TrialPlan =>
  buildTrial({ condition: c, hz, durMs, isiMs }, mulberry32(seed));
const frames = (p: TrialPlan, phase: string, interval?: number) =>
  p.segments
    .filter((s) => s.phase === phase && (interval === undefined || s.interval === interval))
    .reduce((n, s) => n + s.frames, 0);

describe("buildTrial durations", () => {
  it("stim and mask frames follow framesFor", () => {
    const cases: [number, number, number][] = [
      [34, 2, 4],
      [68, 4, 8],
      [116, 7, 14],
    ];
    for (const [ms, f60, f120] of cases) {
      for (const [hz, f] of [[60, f60], [120, f120]] as const) {
        const p = build("BM-LM", hz, ms);
        expect(frames(p, "stim", 1)).toBe(f);
        expect(frames(p, "stim", 2)).toBe(f);
        expect(frames(p, "mask", 1)).toBe(f);
        expect(frames(p, "mask", 2)).toBe(f);
      }
    }
  });
  it("ISI frames follow framesFor", () => {
    const cases: [number, number, number][] = [
      [68, 4, 8],
      [83, 5, 10],
      [116, 7, 14],
      [150, 9, 18],
    ];
    for (const [ms, f60, f120] of cases) {
      expect(frames(build("BM-LM", 60, 68, 1, ms), "isi", 1)).toBe(f60);
      expect(frames(build("BM-LM", 120, 68, 1, ms), "isi", 2)).toBe(f120);
    }
  });
});

describe("fixed segments", () => {
  it("fixation, gap, blank", () => {
    for (const [hz, fix, gap, blank] of [[60, 12, 30, 18], [120, 24, 60, 36]]) {
      const p = build("SINGLE", hz);
      expect(frames(p, "fixation")).toBe(fix);
      expect(frames(p, "gap")).toBe(gap);
      expect(frames(p, "blank")).toBe(blank + p.jitterFrames);
    }
  });
});

describe("segment order", () => {
  it("SINGLE", () => {
    expect(build("SINGLE").segments.map((s) => s.phase)).toEqual([
      "fixation", "blank", "stim", "gap", "stim",
    ]);
  });
  it("BM-CROWD", () => {
    const p = build("BM-CROWD");
    expect(p.segments.map((s) => s.phase)).toEqual([
      "fixation", "blank", "stim", "isi", "mask", "gap", "stim", "isi", "mask",
    ]);
    expect(p.segments.map((s) => s.interval)).toEqual([0, 0, 1, 1, 1, 0, 2, 2, 2]);
  });
});

describe("target and flankers", () => {
  it("target appears in exactly one stim interval", () => {
    for (const c of CONDITIONS) {
      for (let seed = 0; seed < 200; seed++) {
        const p = build(c, 60, 68, seed);
        const t = expandFrames(p).filter((f) => f.showTarget);
        expect(t.length).toBe(4);
        expect(t.every((f) => f.phase === "stim" && f.interval === p.targetInterval)).toBe(true);
      }
    }
  });
  it("flankers and masks in both intervals", () => {
    for (const c of CONDITIONS) {
      const p = build(c);
      for (const k of [1, 2] as const) {
        const stim = p.segments.find((s) => s.phase === "stim" && s.interval === k)!;
        expect(stim.showFlankers).toBe(hasFlankers(c));
        const masks = p.segments.filter((s) => s.phase === "mask" && s.interval === k);
        if (isMasked(c)) {
          expect(masks.reduce((n, s) => n + s.frames, 0)).toBe(4);
          expect(masks.every((s) => s.showFlankers && !s.showTarget)).toBe(true);
        } else {
          expect(masks.length).toBe(0);
        }
      }
      if (!isMasked(c)) expect(p.segments.some((s) => s.phase === "isi")).toBe(false);
    }
    expect(hasFlankers("SINGLE")).toBe(false);
    expect(hasFlankers("BM-T")).toBe(false);
    for (const c of ["LM", "CROWD", "BM-LM", "BM-CROWD"] as Condition[]) expect(hasFlankers(c)).toBe(true);
  });
  it("fixation only in fixation frames", () => {
    const fr = expandFrames(build("LM"));
    expect(fr.every((f) => f.showFixation === (f.phase === "fixation"))).toBe(true);
  });
});

describe("jitter", () => {
  it("max jitter frames", () => {
    expect(maxJitterFrames(250, 60)).toBe(15);
    expect(maxJitterFrames(250, 120)).toBe(30);
  });
  it("bounded and covers the range", () => {
    for (const [hz, max] of [[60, 15], [120, 30]]) {
      const r = mulberry32(7);
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) {
        const p = buildTrial({ condition: "LM", hz, durMs: 68 }, r);
        expect(p.jitterFrames).toBeGreaterThanOrEqual(0);
        expect(p.jitterFrames).toBeLessThanOrEqual(max);
        seen.add(p.jitterFrames);
      }
      expect(seen.has(0)).toBe(true);
      expect(seen.has(max)).toBe(true);
    }
  });
});

describe("seeded randomisation", () => {
  it("balanced intervals, reproducible, two draws", () => {
    const r = mulberry32(42);
    let ones = 0;
    const seqA: [number, number][] = [];
    for (let i = 0; i < 1000; i++) {
      const p = buildTrial({ condition: "SINGLE", hz: 60, durMs: 68 }, r);
      if (p.targetInterval === 1) ones++;
      seqA.push([p.targetInterval, p.jitterFrames]);
    }
    expect(ones / 1000).toBeGreaterThanOrEqual(0.45);
    expect(ones / 1000).toBeLessThanOrEqual(0.55);
    const r2 = mulberry32(42);
    const seqB = seqA.map(() => {
      const p = buildTrial({ condition: "SINGLE", hz: 60, durMs: 68 }, r2);
      return [p.targetInterval, p.jitterFrames];
    });
    expect(seqB).toEqual(seqA);
    let calls = 0;
    const inner = mulberry32(5);
    buildTrial({ condition: "BM-LM", hz: 60, durMs: 68, isiMs: 83 }, () => (calls++, inner()));
    expect(calls).toBe(2);
  });
});

describe("expandFrames", () => {
  it("expands segments in order without a frames key", () => {
    const p = build("BM-LM", 120);
    const fr = expandFrames(p);
    const sum = p.segments.reduce((n, s) => n + s.frames, 0);
    expect(p.totalFrames).toBe(sum);
    expect(fr.length).toBe(sum);
    let i = 0;
    for (const s of p.segments) {
      const { frames: n, ...rest } = s;
      for (let j = 0; j < n; j++, i++) expect(fr[i]).toEqual(rest satisfies FrameSpec);
    }
    expect(fr.every((f) => !("frames" in f))).toBe(true);
  });
});

describe("errors", () => {
  const r = () => 0.5;
  it("validates inputs", () => {
    expect(() => buildTrial({ condition: "LM", hz: 0, durMs: 68 }, r)).toThrow("hz must be > 0 (got 0)");
    expect(() => buildTrial({ condition: "LM", hz: 60, durMs: 0 }, r)).toThrow("durMs must be > 0 (got 0)");
    expect(() => buildTrial({ condition: "BM-T", hz: 60, durMs: 68 }, r)).toThrow(
      "isiMs > 0 required for BM-T (got undefined)",
    );
    expect(() => buildTrial({ condition: "BM-LM", hz: 60, durMs: 68, isiMs: 0 }, r)).toThrow(
      "isiMs > 0 required for BM-LM (got 0)",
    );
    expect(() => buildTrial({ condition: "LM", hz: 60, durMs: 68 }, r)).not.toThrow();
  });
});
