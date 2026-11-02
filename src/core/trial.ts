import type { Condition } from "./protocol";
import { framesFor } from "./geometry";

export type Phase = "fixation" | "blank" | "stim" | "isi" | "mask" | "gap";

export interface FrameSpec {
  phase: Phase;
  /** 0 = outside the two observation intervals. */
  interval: 0 | 1 | 2;
  /** Only in "stim" frames of the target interval. */
  showTarget: boolean;
  /** "stim" frames of flanked conditions, and all "mask" frames. */
  showFlankers: boolean;
  /** Only in "fixation" frames. */
  showFixation: boolean;
}

/** A run of identical frames. */
export interface Segment extends FrameSpec {
  frames: number;
}

export interface TrialSpec {
  condition: Condition;
  /** Measured (snapped) refresh rate, > 0. */
  hz: number;
  /** Target duration; the mask duration is the same; > 0. */
  durMs: number;
  /** Blank between target offset and mask onset; required (> 0) for BM-*, ignored otherwise. */
  isiMs?: number;
}

export interface TrialTiming {
  fixationMs: number;
  preBlankMs: number;
  jitterMaxMs: number;
  gapMs: number;
}

export const DEFAULT_TRIAL_TIMING: TrialTiming = {
  fixationMs: 200,
  preBlankMs: 300,
  jitterMaxMs: 250,
  gapMs: 500,
};

export interface TrialPlan {
  spec: TrialSpec;
  targetInterval: 1 | 2;
  jitterFrames: number;
  segments: Segment[];
  /** Sum of segment frames. */
  totalFrames: number;
}

export function isMasked(c: Condition): boolean {
  return c === "BM-T" || c === "BM-LM" || c === "BM-CROWD";
}

/** True when the stim frame itself contains flankers (not SINGLE, not BM-T). */
export function hasFlankers(c: Condition): boolean {
  return c === "LM" || c === "CROWD" || c === "BM-LM" || c === "BM-CROWD";
}

export function maxJitterFrames(jitterMaxMs: number, hz: number): number {
  return Math.floor((jitterMaxMs * hz) / 1000 + 1e-9);
}

/**
 * Turn a trial spec into an explicit whole-frame plan for a 2-interval forced-choice trial.
 * Consumes exactly two draws from `rand`: target interval, then jitter.
 * The response phase is not part of the frame plan.
 */
export function buildTrial(
  spec: TrialSpec,
  rand: () => number,
  timing: TrialTiming = DEFAULT_TRIAL_TIMING,
): TrialPlan {
  const { condition, hz, durMs, isiMs } = spec;
  if (!Number.isFinite(hz) || hz <= 0) throw new Error(`hz must be > 0 (got ${hz})`);
  if (!Number.isFinite(durMs) || durMs <= 0) throw new Error(`durMs must be > 0 (got ${durMs})`);
  for (const f of ["fixationMs", "preBlankMs", "gapMs"] as const) {
    const v = timing[f];
    if (!Number.isFinite(v) || v <= 0) throw new Error(`timing.${f} invalid (got ${v})`);
  }
  if (!Number.isFinite(timing.jitterMaxMs) || timing.jitterMaxMs < 0) {
    throw new Error(`timing.jitterMaxMs invalid (got ${timing.jitterMaxMs})`);
  }
  const masked = isMasked(condition);
  if (masked && (isiMs === undefined || !Number.isFinite(isiMs) || isiMs <= 0)) {
    throw new Error(`isiMs > 0 required for ${condition} (got ${isiMs})`);
  }

  const targetInterval: 1 | 2 = rand() < 0.5 ? 1 : 2;
  const jitterFrames = Math.floor(rand() * (maxJitterFrames(timing.jitterMaxMs, hz) + 1));

  const D = framesFor(durMs, hz);
  const off = { showTarget: false, showFlankers: false, showFixation: false };
  const segments: Segment[] = [];
  segments.push({
    phase: "fixation",
    interval: 0,
    ...off,
    showFixation: true,
    frames: framesFor(timing.fixationMs, hz),
  });
  segments.push({
    phase: "blank",
    interval: 0,
    ...off,
    frames: framesFor(timing.preBlankMs, hz) + jitterFrames,
  });
  for (const k of [1, 2] as const) {
    if (k === 2) {
      segments.push({ phase: "gap", interval: 0, ...off, frames: framesFor(timing.gapMs, hz) });
    }
    segments.push({
      phase: "stim",
      interval: k,
      ...off,
      showTarget: k === targetInterval,
      showFlankers: hasFlankers(condition),
      frames: D,
    });
    if (masked) {
      segments.push({
        phase: "isi",
        interval: k,
        ...off,
        frames: framesFor(isiMs as number, hz),
      });
      segments.push({ phase: "mask", interval: k, ...off, showFlankers: true, frames: D });
    }
  }
  const totalFrames = segments.reduce((s, seg) => s + seg.frames, 0);
  return { spec, targetInterval, jitterFrames, segments, totalFrames };
}

/** One FrameSpec per frame (no `frames` field), in order. */
export function expandFrames(plan: TrialPlan): FrameSpec[] {
  const out: FrameSpec[] = [];
  for (const seg of plan.segments) {
    const { frames, ...spec } = seg;
    for (let i = 0; i < frames; i++) out.push({ ...spec });
  }
  return out;
}
