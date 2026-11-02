import { describe, expect, it } from "vitest";
import { playFrames } from "./player";
import { mulberry32 } from "../core/rng";
import { buildTrial, expandFrames, type FrameSpec } from "../core/trial";

function fakeRaf(times: number[]) {
  let i = 0;
  const f = (cb: (t: number) => void) => {
    const t = times[i++];
    queueMicrotask(() => cb(t));
  };
  return { raf: f, calls: () => i };
}
const perfect = (n: number) => Array.from({ length: n + 1 }, (_, k) => (k * 1000) / 60);
const mk = (i: number): FrameSpec => ({
  phase: i % 2 ? "blank" : "fixation",
  interval: 0,
  showTarget: false,
  showFlankers: false,
  showFixation: i % 2 === 0,
});
const ten = Array.from({ length: 10 }, (_, i) => mk(i));

describe("playFrames", () => {
  it("draws every frame in order and logs timing", async () => {
    const drawn: [FrameSpec, number][] = [];
    const log = await playFrames({
      frames: ten,
      hz: 60,
      raf: fakeRaf(perfect(10)).raf,
      drawFrame: (f, i) => drawn.push([f, i]),
      drawEnd: () => {},
    });
    expect(drawn.map((d) => d[1])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    drawn.forEach(([f, i]) => expect(f).toBe(ten[i]));
    expect(log.timestamps).toHaveLength(11);
    expect(log.analysis.valid).toBe(true);
    expect(log.intended).toEqual(ten);
    expect(log.intended).not.toBe(ten);
  });

  it("flags a late interval", async () => {
    const t = perfect(10);
    for (let k = 5; k <= 10; k++) t[k] += 40 - 1000 / 60;
    const log = await playFrames({ frames: ten, hz: 60, raf: fakeRaf(t).raf, drawFrame: () => {}, drawEnd: () => {} });
    expect(log.analysis.valid).toBe(false);
    expect(log.analysis.lateFrames).toEqual([4]);
  });

  it("rejects when drawFrame throws and stops scheduling", async () => {
    const err = new Error("boom");
    const r = fakeRaf(perfect(10));
    let calls = 0;
    await expect(
      playFrames({
        frames: ten,
        hz: 60,
        raf: r.raf,
        drawEnd: () => {},
        drawFrame: (_f, i) => {
          calls++;
          if (i === 3) throw err;
        },
      }),
    ).rejects.toBe(err);
    expect(calls).toBe(4);
    expect(r.calls()).toBe(4);
  });

  it("rejects empty frames", async () => {
    await expect(playFrames({ frames: [], hz: 60, drawFrame: () => {}, drawEnd: () => {} })).rejects.toThrow(
      "frames must not be empty",
    );
  });

  it("plays a full BM-CROWD trial", async () => {
    const plan = buildTrial({ condition: "BM-CROWD", hz: 60, durMs: 68, isiMs: 83 }, mulberry32(5));
    const frames = expandFrames(plan);
    let n = 0;
    const log = await playFrames({
      frames,
      hz: 60,
      raf: fakeRaf(perfect(frames.length)).raf,
      drawFrame: () => void n++,
      drawEnd: () => {},
    });
    expect(log.analysis.valid).toBe(true);
    expect(n).toBe(plan.totalFrames);
  });

  it("calls drawEnd once, after the last frame and before resolving", async () => {
    const order: string[] = [];
    let resolved = false;
    const p = playFrames({
      frames: ten,
      hz: 60,
      raf: fakeRaf(perfect(10)).raf,
      drawFrame: (_f, i) => order.push(`f${i}`),
      drawEnd: () => {
        expect(resolved).toBe(false);
        order.push("end");
      },
    }).then((l) => {
      resolved = true;
      return l;
    });
    await p;
    expect(order.filter((x) => x === "end")).toHaveLength(1);
    expect(order[order.length - 2]).toBe("f9");
    expect(order[order.length - 1]).toBe("end");
  });

  it("rejects when drawEnd throws", async () => {
    const err = new Error("end boom");
    await expect(
      playFrames({
        frames: ten,
        hz: 60,
        raf: fakeRaf(perfect(10)).raf,
        drawFrame: () => {},
        drawEnd: () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);
  });

  it("rejects invalid hz", async () => {
    await expect(playFrames({ frames: ten, hz: 0, drawFrame: () => {}, drawEnd: () => {} })).rejects.toThrow(
      "hz must be > 0 (got 0)",
    );
  });

  it("aborts mid-playback without further draws or raf calls", async () => {
    const ac = new AbortController();
    const r = fakeRaf(perfect(10));
    let draws = 0;
    let ended = 0;
    await expect(
      playFrames({
        frames: ten,
        hz: 60,
        raf: r.raf,
        signal: ac.signal,
        drawFrame: () => {
          draws++;
          if (draws === 3) ac.abort();
        },
        drawEnd: () => void ended++,
      }),
    ).rejects.toThrow("playback aborted");
    expect(draws).toBe(3);
    expect(r.calls()).toBe(4);
    expect(ended).toBe(0);
  });

  it("rejects immediately if already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const r = fakeRaf(perfect(10));
    await expect(
      playFrames({ frames: ten, hz: 60, raf: r.raf, signal: ac.signal, drawFrame: () => {}, drawEnd: () => {} }),
    ).rejects.toThrow("playback aborted");
    expect(r.calls()).toBe(0);
  });
});
