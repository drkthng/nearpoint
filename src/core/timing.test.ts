import { describe, expect, it } from "vitest";
import { analyzeTiming } from "./timing";
import { mulberry32 } from "./rng";

/** Build N+1 timestamps from N intervals. */
function fromIntervals(iv: number[], t0 = 1000): number[] {
  const t = [t0];
  for (const d of iv) t.push(t[t.length - 1] + d);
  return t;
}
const flat = (n: number, d: number) => Array.from({ length: n }, () => d);

describe("analyzeTiming", () => {
  it("accepts perfect 60 Hz", () => {
    const ts = Array.from({ length: 101 }, (_, k) => (k * 1000) / 60);
    const a = analyzeTiming(ts, 60);
    expect(a.valid).toBe(true);
    expect(a.lateFrames).toEqual([]);
    expect(a.frameCount).toBe(100);
    expect(a.maxIntervalMs).toBeCloseTo(16.667, 2);
  });

  it("flags a late frame at the 1.5x threshold", () => {
    const iv = flat(100, 1000 / 60);
    iv[37] = 25.1;
    const a = analyzeTiming(fromIntervals(iv), 60);
    expect(a.valid).toBe(false);
    expect(a.lateFrames).toEqual([37]);
    expect(a.reasons[0].startsWith("1 late frame(s) > 25.00 ms")).toBe(true);
    iv[37] = 24.9;
    expect(analyzeTiming(fromIntervals(iv), 60).valid).toBe(true);
  });

  it("scales the threshold with refresh rate", () => {
    const iv = flat(50, 1000 / 120);
    const ok = analyzeTiming(fromIntervals(iv), 120);
    expect(ok.thresholdMs).toBeCloseTo(12.5, 10);
    iv[10] = 12.6;
    const bad = analyzeTiming(fromIntervals(iv), 120);
    expect(bad.valid).toBe(false);
    expect(bad.lateFrames).toEqual([10]);
  });

  it("tolerates +-2 ms jitter", () => {
    const r = mulberry32(3);
    const iv = Array.from({ length: 200 }, () => 16.667 + (r() - 0.5) * 4);
    expect(analyzeTiming(fromIntervals(iv), 60).valid).toBe(true);
  });

  it("flags non-increasing timestamps", () => {
    const ts = fromIntervals(flat(20, 16.667));
    ts[6] = ts[5];
    const a = analyzeTiming(ts, 60);
    expect(a.valid).toBe(false);
    expect(a.nonIncreasing).toContain(5);
    expect(a.reasons.some((s) => s.includes("non-increasing"))).toBe(true);
  });

  it("checks expectedFrames", () => {
    const ts = fromIntervals(flat(99, 1000 / 60)); // 100 timestamps
    const a = analyzeTiming(ts, 60, 100);
    expect(a.valid).toBe(false);
    expect(a.reasons).toContain("expected 101 timestamps for 100 frames (got 100)");
    expect(analyzeTiming(fromIntervals(flat(100, 1000 / 60)), 60, 100).valid).toBe(true);
  });

  it("reports too few timestamps without throwing; bad hz throws", () => {
    const a = analyzeTiming([5], 60);
    expect(a.valid).toBe(false);
    expect(a.reasons).toEqual(["need at least 2 timestamps (got 1)"]);
    expect(a.maxIntervalMs).toBe(0);
    expect(() => analyzeTiming([0, 16], 0)).toThrow("hz must be > 0 (got 0)");
  });

  it("treats exactly 1.5x nominal as on time, just above as late", () => {
    const at = flat(10, 20);
    at[4] = 30;
    const a = analyzeTiming(fromIntervals(at), 50);
    expect(a.thresholdMs).toBe(30);
    expect(a.valid).toBe(true);
    expect(a.lateFrames).toEqual([]);
    at[4] = 30.01;
    const b = analyzeTiming(fromIntervals(at), 50);
    expect(b.valid).toBe(false);
    expect(b.lateFrames).toEqual([4]);
  });

  it("a NaN timestamp makes the analysis invalid", () => {
    const ts = fromIntervals(flat(10, 1000 / 60));
    ts[5] = NaN;
    const a = analyzeTiming(ts, 60);
    expect(a.valid).toBe(false);
    expect(a.nonIncreasing).toEqual([4, 5]);
  });

  it("reports a late final interval as the last frame", () => {
    const iv = flat(10, 1000 / 60);
    iv[9] = 40;
    const a = analyzeTiming(fromIntervals(iv), 60, 10);
    expect(a.valid).toBe(false);
    expect(a.lateFrames).toEqual([9]);
  });
});
