/**
 * Stimulus layout: pure computation of Gabor patch centres and contrasts per trial condition.
 *
 * Conventions
 * - Coordinates are device pixels, origin top-left, x right, y down. Pixel (x, y) has its
 *   centre at (x + 0.5, y + 0.5).
 * - thetaDeg is the orientation of the bars, 0 = vertical bars. With t = thetaDeg * PI / 180:
 *   bar axis b = (sin t, -cos t); carrier direction c = (cos t, sin t) (perpendicular to the bars).
 *   The renderer's carrier angle (carrierRad passed to gaborValue) is t, so gaborValue's
 *   u = dx*cos(t) + dy*sin(t) is the coordinate along c.
 *   theta=0: c=(1,0), b=(0,-1) (vertical bars, luminance varies along x).
 *   theta=90: c=(0,1), b=(1,0) (horizontal bars).
 * - Separation sepLambda is in wavelengths; d_px = sepLambda * lambdaPx.
 * - A grid offset (i, j) is the vector i*D*b + j*D*c with D = d_px.
 */
import type { Condition } from "./protocol";

export type BaseLayout = "SINGLE" | "LM" | "CROWD";
export interface Patch { x: number; y: number; contrast: number }
export interface LayoutParams {
  condition: Condition;
  thetaDeg: number;
  sepLambda: number;
  lambdaPx: number;
  cx: number; cy: number;
  targetContrast: number;
  flankerContrast: number;
  nFlankers?: number;
  targetPresent: boolean;
}

export const CROWD_FLANKER_COUNTS: readonly number[] = [2, 4, 6, 8];

const LM_ORDER: readonly (readonly [number, number])[] = [[1, 0], [-1, 0]];
const CROWD_ORDER: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
];

export function carrierRad(thetaDeg: number): number {
  return (thetaDeg * Math.PI) / 180;
}

export function barAxis(thetaDeg: number): [number, number] {
  const t = carrierRad(thetaDeg);
  return [Math.sin(t), -Math.cos(t)];
}

export function carrierAxis(thetaDeg: number): [number, number] {
  const t = carrierRad(thetaDeg);
  return [Math.cos(t), Math.sin(t)];
}

export function baseLayout(condition: Condition): BaseLayout {
  switch (condition) {
    case "SINGLE":
    case "BM-T":
      return "SINGLE";
    case "LM":
    case "BM-LM":
      return "LM";
    case "CROWD":
    case "BM-CROWD":
      return "CROWD";
  }
}

export function maskLayout(condition: Condition): BaseLayout {
  switch (condition) {
    case "LM":
    case "BM-T":
    case "BM-LM":
      return "LM";
    case "CROWD":
    case "BM-CROWD":
      return "CROWD";
    default:
      throw new Error("condition SINGLE has no mask frame");
  }
}

function validate(p: LayoutParams, layout: BaseLayout): void {
  if (!Number.isFinite(p.lambdaPx) || p.lambdaPx <= 0) {
    throw new Error(`lambdaPx must be > 0 (got ${p.lambdaPx})`);
  }
  if (layout !== "SINGLE" && (!Number.isFinite(p.sepLambda) || p.sepLambda <= 0)) {
    throw new Error(`sepLambda must be > 0 (got ${p.sepLambda})`);
  }
  if (layout === "CROWD") {
    const n = p.nFlankers ?? 8;
    if (!CROWD_FLANKER_COUNTS.includes(n)) {
      throw new Error(`nFlankers must be one of 2, 4, 6, 8 (got ${n})`);
    }
  }
}

function flankers(p: LayoutParams, layout: BaseLayout): Patch[] {
  if (layout === "SINGLE") return [];
  const order = layout === "LM" ? LM_ORDER : CROWD_ORDER.slice(0, p.nFlankers ?? 8);
  const d = p.sepLambda * p.lambdaPx;
  const [bx, by] = barAxis(p.thetaDeg);
  const [kx, ky] = carrierAxis(p.thetaDeg);
  return order.map(([i, j]) => ({
    x: p.cx + i * d * bx + j * d * kx,
    y: p.cy + i * d * by + j * d * ky,
    contrast: p.flankerContrast,
  }));
}

export function stimulusPatches(p: LayoutParams): Patch[] {
  const layout = baseLayout(p.condition);
  validate(p, layout);
  const out: Patch[] = [];
  if (p.targetPresent) out.push({ x: p.cx, y: p.cy, contrast: p.targetContrast });
  out.push(...flankers(p, layout));
  return out;
}

export function maskPatches(p: LayoutParams): Patch[] {
  const layout = maskLayout(p.condition);
  validate(p, layout);
  return flankers(p, layout);
}
