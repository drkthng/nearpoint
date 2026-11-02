import { snapRefreshRate } from "./geometry";

/** ISO/IEC 7810 ID-1 card size. */
export const ID1_CARD_MM = { width: 85.6, height: 53.98 } as const;

/** Device pixels per mm from the on-screen width (CSS px) of a matched ID-1 card. */
export function pxPerMmFromCard(cardWidthCssPx: number, devicePixelRatio: number): number {
  if (!Number.isFinite(cardWidthCssPx) || !Number.isFinite(devicePixelRatio) || cardWidthCssPx <= 0 || devicePixelRatio <= 0) {
    throw new Error(`invalid card width or devicePixelRatio`);
  }
  return (cardWidthCssPx * devicePixelRatio) / ID1_CARD_MM.width;
}

export const BLIND_SPOT_ANGLE_DEG = 15;

/** Viewing distance from the blind-spot offset (device px between fixation and the vanishing point). */
export function blindSpotDistanceMm(offsetDevicePx: number, pxPerMm: number, angleDeg = BLIND_SPOT_ANGLE_DEG): number {
  if (!(offsetDevicePx > 0) || !(pxPerMm > 0) || !(angleDeg > 0 && angleDeg < 90)) {
    throw new Error(`invalid blind-spot inputs`);
  }
  return offsetDevicePx / pxPerMm / Math.tan((angleDeg * Math.PI) / 180);
}

export interface RefreshEstimate {
  samples: number;
  medianMs: number;
  p90Ms: number;
  hzMeasured: number;
  hz: number;
}

export function estimateRefresh(timestamps: readonly number[]): RefreshEstimate {
  const n = timestamps.length;
  if (n < 10) throw new Error(`need at least 10 timestamps (got ${n})`);
  const iv: number[] = [];
  for (let i = 1; i < n; i++) iv.push(timestamps[i] - timestamps[i - 1]);
  const s = [...iv].sort((a, b) => a - b);
  const m = s.length;
  const medianMs = m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
  const p90Ms = s[Math.ceil(0.9 * m) - 1];
  const hzMeasured = 1000 / medianMs;
  return { samples: m, medianMs, p90Ms, hzMeasured, hz: snapRefreshRate(hzMeasured) };
}

export function refreshWarnings(e: RefreshEstimate): string[] {
  const w: string[] = [];
  if (e.hz < 60) {
    w.push(`Refresh rate is below 60 Hz (measured ${e.hzMeasured.toFixed(1)} Hz). Durations become coarse; check power saving and the display settings.`);
  } else if (e.hz > 60) {
    w.push(`Refresh rate is ${e.hzMeasured.toFixed(1)} Hz. On the Galaxy S24 set Motion smoothness to Standard (60 Hz) so durations match the published protocol.`);
  }
  if (e.p90Ms > 1.5 * e.medianMs) {
    w.push(`Frame timing is irregular (90th percentile ${e.p90Ms.toFixed(1)} ms vs median ${e.medianMs.toFixed(1)} ms). Close other apps and keep the screen on.`);
  }
  return w;
}
