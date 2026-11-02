/**
 * Statistical comparison of a rendered frame (GPU read-back or CPU) with the ideal, undithered
 * code values of the CPU reference. CPU dither = mulberry32 and GPU dither = PCG are different
 * random streams, so frames are compared through properties every correct renderer has:
 * - grey: R = G = B everywhere;
 * - bounded residual: code − ideal ∈ (−1, 1] for stochastic rounding (we allow a small float32 margin);
 * - unbiased: the mean residual is ≈ 0 over the frame and over the stimulus pixels (tolerance
 *   max(maxMeanResidual, 5 standard errors) for the stimulus pixels);
 * - local means agree: in every B × B block the mean code matches the ideal mean within a tolerance.
 * Pure: no DOM.
 */
import { srgbEncode } from "../core/luminance";

export interface CompareOptions {
  /** Residual magnitude allowed per pixel (exact maths gives ≤ 1). */
  maxResidual?: number;
  /** Allowed |mean residual| over all pixels and over stimulus pixels. */
  maxMeanResidual?: number;
  /** Block size for local means. */
  block?: number;
  /** Allowed |block mean − ideal block mean|. */
  maxBlockError?: number;
}

export interface CompareStats {
  pixels: number;
  stimulusPixels: number;
  nonGrey: number;
  maxResidual: number;
  meanResidual: number;
  meanResidualStimulus: number;
  maxBlockError: number;
  /** Residual standard deviation (uniform dither on a fractional code gives ≤ 0.5). */
  residualSd: number;
  ok: boolean;
  reasons: string[];
}

export const COMPARE_DEFAULTS: Required<CompareOptions> = {
  maxResidual: 1.05,
  maxMeanResidual: 0.05,
  block: 16,
  maxBlockError: 0.35,
};

/** Ideal (continuous) 8-bit code of each pixel from linear luminance. */
export function idealCodes(linear: Float32Array): Float64Array {
  const out = new Float64Array(linear.length);
  for (let i = 0; i < linear.length; i++) out[i] = srgbEncode(linear[i]) * 255;
  return out;
}

/**
 * rgba: width × height RGBA, rows top to bottom. linear: the CPU reference's linear luminance.
 * Stimulus pixels: |linear − mean| > 0.1 % of the mean.
 */
export function compareWithReference(
  rgba: Uint8Array | Uint8ClampedArray,
  linear: Float32Array,
  width: number,
  height: number,
  mean: number,
  o: CompareOptions = {},
): CompareStats {
  const opt = { ...COMPARE_DEFAULTS, ...o };
  const n = width * height;
  if (rgba.length !== 4 * n || linear.length !== n) throw new Error("size mismatch");
  const ideal = idealCodes(linear);
  let nonGrey = 0;
  let maxRes = 0;
  let sum = 0;
  let sum2 = 0;
  let sumS = 0;
  let nS = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[4 * i];
    if (rgba[4 * i + 1] !== r || rgba[4 * i + 2] !== r) nonGrey++;
    const d = r - ideal[i];
    sum += d;
    sum2 += d * d;
    if (Math.abs(d) > maxRes) maxRes = Math.abs(d);
    if (Math.abs(linear[i] - mean) > 0.001 * mean) {
      sumS += d;
      nS++;
    }
  }
  const B = opt.block;
  let maxBlock = 0;
  for (let by = 0; by + B <= height; by += B) {
    for (let bx = 0; bx + B <= width; bx += B) {
      let s = 0;
      for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) s += rgba[4 * (y * width + x)] - ideal[y * width + x];
      maxBlock = Math.max(maxBlock, Math.abs(s / (B * B)));
    }
  }
  const meanResidual = sum / n;
  const meanResidualStimulus = nS ? sumS / nS : 0;
  const residualSd = Math.sqrt(Math.max(0, sum2 / n - meanResidual * meanResidual));
  const reasons: string[] = [];
  if (nonGrey) reasons.push(`${nonGrey} non-grey pixels`);
  if (maxRes > opt.maxResidual) reasons.push(`max residual ${maxRes.toFixed(3)} > ${opt.maxResidual}`);
  if (Math.abs(meanResidual) > opt.maxMeanResidual) reasons.push(`mean residual ${meanResidual.toFixed(4)}`);
  // Few stimulus pixels (low contrast, small patches): allow 5 standard errors of the dither noise.
  const tolS = Math.max(opt.maxMeanResidual, nS ? (5 * residualSd) / Math.sqrt(nS) : 0);
  if (Math.abs(meanResidualStimulus) > tolS) reasons.push(`stimulus mean residual ${meanResidualStimulus.toFixed(4)} > ${tolS.toFixed(4)}`);
  if (maxBlock > opt.maxBlockError) reasons.push(`block error ${maxBlock.toFixed(3)} > ${opt.maxBlockError}`);
  return {
    pixels: n,
    stimulusPixels: nS,
    nonGrey,
    maxResidual: maxRes,
    meanResidual,
    meanResidualStimulus,
    maxBlockError: maxBlock,
    residualSd,
    ok: reasons.length === 0,
    reasons,
  };
}
