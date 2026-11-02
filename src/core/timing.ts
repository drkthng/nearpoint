import type { FrameSpec } from "./trial";

/**
 * Timing-log analysis for a trial's frame timestamps.
 *
 * Convention: `timestamps` are the requestAnimationFrame timestamps (ms) of the callback that
 * drew frame k, k = 0..N-1, plus one final callback after the last frame, so N frames give
 * N+1 timestamps. Interval k = t[k+1] - t[k] is how long frame k was on screen (to vsync
 * resolution). Any interval > LATE_FRAME_FACTOR x nominal marks the trial invalid.
 */
export const LATE_FRAME_FACTOR = 1.5;

export interface TimingAnalysis {
  /** True iff reasons is empty. */
  valid: boolean;
  nominalMs: number;
  thresholdMs: number;
  /** timestamps.length - 1 */
  frameCount: number;
  /** Largest t[k+1] - t[k] (0 if fewer than 2 timestamps). */
  maxIntervalMs: number;
  /** Indices k with t[k+1] - t[k] > thresholdMs (strictly greater). */
  lateFrames: number[];
  /** Indices k with t[k+1] - t[k] <= 0 (or NaN). */
  nonIncreasing: number[];
  reasons: string[];
}

export interface TrialTimingLog {
  hz: number;
  intended: FrameSpec[];
  timestamps: number[];
  analysis: TimingAnalysis;
}

export function analyzeTiming(
  timestamps: readonly number[],
  hz: number,
  expectedFrames?: number,
): TimingAnalysis {
  if (!Number.isFinite(hz) || hz <= 0) throw new Error(`hz must be > 0 (got ${hz})`);
  const nominalMs = 1000 / hz;
  const thresholdMs = LATE_FRAME_FACTOR * nominalMs;
  const n = timestamps.length;
  const lateFrames: number[] = [];
  const nonIncreasing: number[] = [];
  let maxIntervalMs = 0;
  for (let k = 0; k + 1 < n; k++) {
    const d = timestamps[k + 1] - timestamps[k];
    if (d > maxIntervalMs) maxIntervalMs = d;
    if (d > thresholdMs) lateFrames.push(k);
    // `!(d > 0)` also catches NaN from bad data.
    if (!(d > 0)) nonIncreasing.push(k);
  }
  const reasons: string[] = [];
  if (n < 2) reasons.push(`need at least 2 timestamps (got ${n})`);
  if (expectedFrames !== undefined && n !== expectedFrames + 1) {
    reasons.push(`expected ${expectedFrames + 1} timestamps for ${expectedFrames} frames (got ${n})`);
  }
  if (lateFrames.length > 0) {
    reasons.push(
      `${lateFrames.length} late frame(s) > ${thresholdMs.toFixed(2)} ms (max ${maxIntervalMs.toFixed(2)} ms)`,
    );
  }
  if (nonIncreasing.length > 0) reasons.push(`${nonIncreasing.length} non-increasing timestamp(s)`);
  return {
    valid: reasons.length === 0,
    nominalMs,
    thresholdMs,
    frameCount: Math.max(0, n - 1),
    maxIntervalMs,
    lateFrames,
    nonIncreasing,
    reasons,
  };
}
