import { describe, expect, it } from "vitest";
import { srgbEncode, toCode8 } from "../core/luminance";
import { renderCpu, type CpuRenderOptions } from "./cpu";

const N = 256;
const LAMBDA = 16;
const base = (o: Partial<CpuRenderOptions> = {}): CpuRenderOptions => ({
  width: N,
  height: N,
  patches: [{ x: 128.5, y: 128.5, contrast: 0.1 }],
  lambdaPx: LAMBDA,
  carrierRad: 0,
  dither: false,
  seed: 1,
  ...o,
});
const patchAt = (c: number) => [{ x: 128.5, y: 128.5, contrast: c }];

function rowVals(r: { linear: Float32Array }): number[] {
  const v: number[] = [];
  for (let x = 112; x <= 144; x++) v.push(r.linear[128 * N + x]);
  return v;
}
function colVals(r: { linear: Float32Array }): number[] {
  const v: number[] = [];
  for (let y = 112; y <= 144; y++) v.push(r.linear[y * N + 128]);
  return v;
}
const range = (v: number[]) => Math.max(...v) - Math.min(...v);
function michelson(v: number[]): number {
  const hi = Math.max(...v);
  const lo = Math.min(...v);
  return (hi - lo) / (hi + lo);
}

describe("renderCpu", () => {
  it("1. Michelson contrast matches C for a flat envelope", () => {
    for (const C of [0.01, 0.1, 0.5]) {
      const r = renderCpu(base({ patches: patchAt(C), sigmaPx: 320 }));
      const M = michelson(rowVals(r));
      expect(Math.abs(M - C)).toBeLessThanOrEqual(0.005 * C);
    }
  });

  it("2. default sigma: centre value and envelope-reduced Michelson", () => {
    const C = 0.1;
    const r = renderCpu(base({ patches: patchAt(C) }));
    const centre = r.linear[128 * N + 128] / 0.214 - 1;
    expect(Math.abs(centre - C)).toBeLessThanOrEqual(0.005 * C);
    // Peak at dx=0 (1+C), trough at dx=+-lambda/2 where envelope e = exp(-(8^2)/(2*16^2)) = exp(-1/8):
    // M = (C + C e) / (2 + C - C e) < C.
    const e = Math.exp(-1 / 8);
    const expected = (C * (1 + e)) / (2 + C * (1 - e));
    const M = michelson(rowVals(r));
    expect(Math.abs(M - expected)).toBeLessThanOrEqual(0.005 * expected);
  });

  it("3. orientation: theta 0 varies along x, theta 90 along y", () => {
    const a = renderCpu(base({ sigmaPx: 320 }));
    expect(range(colVals(a))).toBeLessThan(0.01 * range(rowVals(a)));
    const b = renderCpu(base({ sigmaPx: 320, carrierRad: Math.PI / 2 }));
    expect(range(rowVals(b))).toBeLessThan(0.01 * range(colVals(b)));
  });

  it("4. far field is mean grey; undithered codes use u=0.5; alpha 255", () => {
    const r = renderCpu(base({ patches: patchAt(0.5) }));
    expect(Math.abs(r.linear[5 * N + 5] - 0.214)).toBeLessThan(1e-6);
    for (let i = 0; i < N * N; i++) {
      expect(r.rgba[4 * i]).toBe(toCode8(r.linear[i], 0.5));
      expect(r.rgba[4 * i + 3]).toBe(255);
    }
  });

  it("5. dithered uniform field averages to the exact encoded value", () => {
    const r = renderCpu(base({ patches: [], dither: true, seed: 12345 }));
    let sum = 0;
    for (let i = 0; i < N * N; i++) {
      sum += r.rgba[4 * i];
      expect(r.rgba[4 * i + 1]).toBe(r.rgba[4 * i]);
      expect(r.rgba[4 * i + 2]).toBe(r.rgba[4 * i]);
    }
    expect(Math.abs(sum / (N * N) - srgbEncode(0.214) * 255)).toBeLessThan(0.05);
  });

  it("6. dithering is unbiased over a patch region", () => {
    const r = renderCpu(base({ patches: patchAt(0.2), dither: true, seed: 7 }));
    let sum = 0;
    let n = 0;
    for (let y = 96; y < 160; y++) {
      for (let x = 96; x < 160; x++) {
        const i = y * N + x;
        sum += r.rgba[4 * i] - srgbEncode(r.linear[i]) * 255;
        n++;
      }
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
  });

  it("7. deterministic per seed, differs across seeds", () => {
    const a = renderCpu(base({ dither: true, seed: 1 }));
    const a2 = renderCpu(base({ dither: true, seed: 1 }));
    const b = renderCpu(base({ dither: true, seed: 2 }));
    expect(Array.from(a.rgba)).toEqual(Array.from(a2.rgba));
    expect(Array.from(a.rgba)).not.toEqual(Array.from(b.rgba));
  });

  it("8. clamps luminance to [0, 1]", () => {
    const r = renderCpu(base({ patches: patchAt(6) }));
    for (let i = 0; i < N * N; i++) {
      expect(r.linear[i]).toBeGreaterThanOrEqual(0);
      expect(r.linear[i]).toBeLessThanOrEqual(1);
    }
  });

  it("9. validates inputs", () => {
    expect(() => renderCpu(base({ width: 0 }))).toThrow("width and height must be positive integers (got 0x256)");
    expect(() => renderCpu(base({ width: 2.5 }))).toThrow("width and height must be positive integers (got 2.5x256)");
    expect(() => renderCpu(base({ lambdaPx: 0 }))).toThrow("lambdaPx must be > 0 (got 0)");
    expect(() => renderCpu(base({ sigmaPx: 0 }))).toThrow("sigmaPx must be > 0 (got 0)");
    expect(() => renderCpu(base({ mean: 1.5 }))).toThrow("mean must be in [0, 1] (got 1.5)");
  });
});
