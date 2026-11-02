import type { FrameSpec, Segment } from "../core/trial";
import type { TimingAnalysis, TrialTimingLog } from "../core/timing";

/** Compact, JSON-friendly form of a TrialTimingLog (intended frames run-length encoded). */
export interface StoredTiming {
  hz: number;
  segments: Segment[];
  timestamps: number[];
  analysis: TimingAnalysis;
}

function same(a: FrameSpec, b: FrameSpec): boolean {
  return (
    a.phase === b.phase &&
    a.interval === b.interval &&
    a.showTarget === b.showTarget &&
    a.showFlankers === b.showFlankers &&
    a.showFixation === b.showFixation
  );
}

/** Run-length encode: consecutive identical frames merge into one segment. */
export function compressFrames(frames: readonly FrameSpec[]): Segment[] {
  const out: Segment[] = [];
  for (const f of frames) {
    const last = out[out.length - 1];
    if (last && same(last, f)) last.frames++;
    else {
      out.push({
        phase: f.phase,
        interval: f.interval,
        showTarget: f.showTarget,
        showFlankers: f.showFlankers,
        showFixation: f.showFixation,
        frames: 1,
      });
    }
  }
  return out;
}

export function expandSegments(segments: readonly Segment[]): FrameSpec[] {
  const out: FrameSpec[] = [];
  for (const seg of segments) {
    const { frames, ...spec } = seg;
    for (let i = 0; i < frames; i++) out.push({ ...spec });
  }
  return out;
}

export function toStoredTiming(log: TrialTimingLog): StoredTiming {
  return {
    hz: log.hz,
    segments: compressFrames(log.intended),
    timestamps: [...log.timestamps],
    analysis: structuredClone(log.analysis),
  };
}

export function fromStoredTiming(t: StoredTiming): TrialTimingLog {
  return {
    hz: t.hz,
    intended: expandSegments(t.segments),
    timestamps: [...t.timestamps],
    analysis: structuredClone(t.analysis),
  };
}
