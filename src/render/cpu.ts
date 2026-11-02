/**
 * CPU reference renderer: the test oracle for the GPU shader.
 * Pure TypeScript, no DOM. Uses gaborValue / toCode8 from src/core/luminance.ts.
 */
import type { Patch } from "../core/layout";
import { gaborValue, toCode8 } from "../core/luminance";
import { mulberry32 } from "../core/rng";

export const DEFAULT_MEAN_LUMINANCE = 0.214; // linear; sRGB ~ mid-grey
export const SUPPORT_RADIUS_SIGMA = 3.5; // patch evaluated where dx^2+dy^2 <= (3.5 sigma)^2; GPU uses the same cutoff

export interface CpuRenderOptions {
  width: number;
  height: number;
  patches: readonly Patch[];
  lambdaPx: number;
  sigmaPx?: number;
  carrierRad: number;
  mean?: number;
  dither: boolean;
  seed: number;
}

export interface CpuRenderResult {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  linear: Float32Array;
}

export function renderCpu(o: CpuRenderOptions): CpuRenderResult {
  const { width, height, lambdaPx } = o;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`width and height must be positive integers (got ${width}x${height})`);
  }
  if (!(Number.isFinite(lambdaPx) && lambdaPx > 0)) {
    throw new Error(`lambdaPx must be > 0 (got ${lambdaPx})`);
  }
  if (o.sigmaPx !== undefined && !(Number.isFinite(o.sigmaPx) && o.sigmaPx > 0)) {
    throw new Error(`sigmaPx must be > 0 (got ${o.sigmaPx})`);
  }
  if (o.mean !== undefined && !(o.mean >= 0 && o.mean <= 1)) {
    throw new Error(`mean must be in [0, 1] (got ${o.mean})`);
  }

  const sigma = o.sigmaPx ?? lambdaPx;
  const mean = o.mean ?? DEFAULT_MEAN_LUMINANCE;
  const R = SUPPORT_RADIUS_SIGMA * sigma;
  const R2 = R * R;

  const s = new Float64Array(width * height);
  for (const p of o.patches) {
    const x0 = Math.max(0, Math.floor(p.x - R));
    const x1 = Math.min(width - 1, Math.ceil(p.x + R));
    const y0 = Math.max(0, Math.floor(p.y - R));
    const y1 = Math.min(height - 1, Math.ceil(p.y + R));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - p.y;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - p.x;
        if (dx * dx + dy * dy <= R2) {
          s[y * width + x] += gaborValue(dx, dy, lambdaPx, sigma, o.carrierRad, p.contrast);
        }
      }
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  const linear = new Float32Array(width * height);
  const rand = mulberry32(o.seed);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const L = Math.min(1, Math.max(0, mean * (1 + s[i])));
      linear[i] = L;
      const u = o.dither ? rand() : 0.5;
      const code = toCode8(L, u);
      rgba[4 * i] = code;
      rgba[4 * i + 1] = code;
      rgba[4 * i + 2] = code;
      rgba[4 * i + 3] = 255;
    }
  }
  return { width, height, rgba, linear };
}
