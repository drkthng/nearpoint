import { describe, expect, it } from "vitest";
import { blindSpotDistanceMm, estimateRefresh, pxPerMmFromCard, refreshWarnings } from "./calibration";

const ts = (n: number, dt: number) => Array.from({ length: n }, (_, i) => i * dt);

describe("card calibration", () => {
  it("computes px/mm", () => {
    expect(pxPerMmFromCard(326.1, 1)).toBeCloseTo(326.1 / 85.6, 9);
    expect(pxPerMmFromCard(326.1, 2.625)).toBeCloseTo((326.1 * 2.625) / 85.6, 9);
  });
  it("throws on invalid input", () => {
    expect(() => pxPerMmFromCard(0, 1)).toThrow("invalid card width or devicePixelRatio");
    expect(() => pxPerMmFromCard(300, NaN)).toThrow();
    expect(() => pxPerMmFromCard(-1, 2)).toThrow();
  });
  it("blind-spot distance", () => {
    const tan = Math.tan((15 * Math.PI) / 180);
    expect(blindSpotDistanceMm(400 * tan * 16, 16)).toBeCloseTo(400, 9);
    expect(() => blindSpotDistanceMm(0, 16)).toThrow();
    expect(() => blindSpotDistanceMm(100, -1)).toThrow();
  });
});

describe("estimateRefresh", () => {
  it("snaps clean rates", () => {
    const a = estimateRefresh(ts(61, 1000 / 60));
    expect(a.hz).toBe(60);
    expect(a.hzMeasured).toBeCloseTo(60, 6);
    expect(estimateRefresh(ts(61, 1000 / 120)).hz).toBe(120);
  });
  it("median robust, p90 nearest rank", () => {
    const t = [0];
    for (let i = 1; i <= 60; i++) t.push(t[i - 1] + (i % 10 === 0 ? 2 : 1) * (1000 / 60));
    const e = estimateRefresh(t);
    expect(e.samples).toBe(60);
    expect(e.medianMs).toBeCloseTo(1000 / 60, 9);
    // 6 doubled of 60; rank ceil(0.9*60)=54 -> still 54 normal values below it
    expect(e.p90Ms).toBeCloseTo(1000 / 60, 9);
    expect(e.hz).toBe(60);
  });
  it("p90 picks the long interval when >10% are long", () => {
    const t = [0];
    for (let i = 1; i <= 20; i++) t.push(t[i - 1] + (i % 5 === 0 ? 2 : 1) * 10);
    expect(estimateRefresh(t).p90Ms).toBe(20); // 4 of 20 long; rank 18 is long
  });
  it("needs 10 timestamps", () => {
    expect(() => estimateRefresh(ts(9, 16))).toThrow("need at least 10 timestamps (got 9)");
  });
});

describe("refreshWarnings", () => {
  it("clean 60 Hz", () => expect(refreshWarnings(estimateRefresh(ts(61, 1000 / 60)))).toEqual([]));
  it("30 Hz", () => {
    const w = refreshWarnings(estimateRefresh(ts(61, 1000 / 30)));
    expect(w).toHaveLength(1);
    expect(w[0].startsWith("Refresh rate is below 60 Hz")).toBe(true);
  });
  it("120 Hz", () => {
    const w = refreshWarnings(estimateRefresh(ts(61, 1000 / 120)));
    expect(w.join(" ")).toContain("Motion smoothness");
  });
  it("irregular", () => {
    const t = [0];
    for (let i = 1; i <= 20; i++) t.push(t[i - 1] + (i % 4 === 0 ? 3 : 1) * (1000 / 60));
    expect(refreshWarnings(estimateRefresh(t)).some((s) => s.startsWith("Frame timing is irregular"))).toBe(true);
  });
});
