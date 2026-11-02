import { describe, expect, it } from "vitest";
import { mulberry32 } from "../core/rng";
import { analyzeTiming } from "../core/timing";
import type { TrialTimingLog } from "../core/timing";
import { buildTrial, expandFrames } from "../core/trial";
import { compressFrames, expandSegments, fromStoredTiming, toStoredTiming } from "./timing-record";

const plan = buildTrial({ condition: "BM-CROWD", hz: 60, durMs: 68, isiMs: 83 }, mulberry32(1));
const frames = expandFrames(plan);

describe("timing-record", () => {
  it("compress/expand round trip matches plan segments", () => {
    const seg = compressFrames(frames);
    expect(seg).toEqual(plan.segments);
    expect(expandSegments(seg)).toEqual(frames);
  });

  it("empty list gives []", () => {
    expect(compressFrames([])).toEqual([]);
    expect(expandSegments([])).toEqual([]);
  });

  it("stored timing round trips and is plain JSON", () => {
    const timestamps = Array.from({ length: frames.length + 1 }, (_, k) => (k * 1000) / 60);
    const log: TrialTimingLog = {
      hz: 60,
      intended: frames,
      timestamps,
      analysis: analyzeTiming(timestamps, 60, frames.length),
    };
    const stored = toStoredTiming(log);
    expect(fromStoredTiming(stored)).toEqual(log);
    expect(fromStoredTiming(JSON.parse(JSON.stringify(stored)))).toEqual(log);
  });
});
