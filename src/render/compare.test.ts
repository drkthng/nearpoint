import { describe, expect, it } from "vitest";
import { stimulusPatches } from "../core/layout";
import { DEFAULT_MEAN_LUMINANCE, renderCpu } from "./cpu";
import { compareWithReference } from "./compare";

const W = 160;
const H = 128;
const lam = 12;
const base = {
  width: W,
  height: H,
  lambdaPx: lam,
  carrierRad: 0,
  mean: DEFAULT_MEAN_LUMINANCE,
  patches: stimulusPatches({
    condition: "LM", thetaDeg: 0, sepLambda: 3, lambdaPx: lam, cx: W / 2, cy: H / 2,
    targetContrast: 0.2, flankerContrast: 0.6, targetPresent: true,
  }),
};

describe("compareWithReference", () => {
  it("a dithered CPU render with another seed passes against the reference", () => {
    const ref = renderCpu({ ...base, dither: true, seed: 1 });
    const other = renderCpu({ ...base, dither: true, seed: 999 });
    const s = compareWithReference(other.rgba, ref.linear, W, H, DEFAULT_MEAN_LUMINANCE);
    expect(s.reasons).toEqual([]);
    expect(s.ok).toBe(true);
    expect(s.stimulusPixels).toBeGreaterThan(1000);
    expect(s.maxResidual).toBeLessThanOrEqual(1);
  });

  it("detects a wrong contrast", () => {
    const ref = renderCpu({ ...base, dither: true, seed: 1 });
    const wrong = renderCpu({ ...base, patches: base.patches.map((p) => ({ ...p, contrast: p.contrast * 1.1 })), dither: true, seed: 2 });
    expect(compareWithReference(wrong.rgba, ref.linear, W, H, DEFAULT_MEAN_LUMINANCE).ok).toBe(false);
  });

  it("detects a missing dither (rounding bias in flat regions is caught by the block means)", () => {
    const ref = renderCpu({ ...base, patches: [], mean: 0.2, dither: true, seed: 1 });
    const flat = renderCpu({ ...base, patches: [], mean: 0.2, dither: false, seed: 1 });
    const s = compareWithReference(flat.rgba, ref.linear, W, H, 0.2);
    expect(s.ok).toBe(false);
  });

  it("detects a mirrored image and non-grey pixels", () => {
    const ref = renderCpu({ ...base, carrierRad: Math.PI / 4, dither: true, seed: 1 });
    const flipped = new Uint8ClampedArray(ref.rgba.length);
    for (let y = 0; y < H; y++) flipped.set(ref.rgba.subarray(4 * W * y, 4 * W * (y + 1)), 4 * W * (H - 1 - y));
    expect(compareWithReference(flipped, ref.linear, W, H, DEFAULT_MEAN_LUMINANCE).ok).toBe(false);
    const tinted = new Uint8ClampedArray(ref.rgba);
    tinted[1] = (tinted[1] + 1) % 256;
    expect(compareWithReference(tinted, ref.linear, W, H, DEFAULT_MEAN_LUMINANCE).nonGrey).toBe(1);
  });
});
