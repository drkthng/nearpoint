import type { FrameSpec } from "../core/trial";
import { analyzeTiming, type TrialTimingLog } from "../core/timing";

export type RafFn = (cb: (timestampMs: number) => void) => unknown;

export interface PlayOptions {
  frames: readonly FrameSpec[];
  hz: number;
  /** Must draw synchronously; called once per frame, every frame (the dither seed must change
   *  every frame, so unchanged frames are never skipped). */
  drawFrame: (frame: FrameSpec, index: number) => void;
  /** Default: requestAnimationFrame, resolved at call time. */
  raf?: RafFn;
}

/**
 * Present `frames` one per requestAnimationFrame callback and return the timing log.
 *
 * Frame k's content is drawn inside the rAF callback whose timestamp is t[k] and becomes
 * visible at the following vsync; t[k+1] - t[k] therefore measures how long frame k stayed on
 * screen. N frames give N+1 timestamps (one final callback). The response phase is not part of
 * playback (S5). No timers are used: stimulus timing comes only from rAF.
 */
export function playFrames(o: PlayOptions): Promise<TrialTimingLog> {
  const { frames, hz, drawFrame } = o;
  if (frames.length === 0) return Promise.reject(new Error("frames must not be empty"));
  const raf: RafFn = o.raf ?? ((cb) => requestAnimationFrame(cb));
  const n = frames.length;
  return new Promise<TrialTimingLog>((resolve, reject) => {
    const timestamps: number[] = [];
    let k = 0;
    const tick = (t: number): void => {
      timestamps.push(t);
      if (k < n) {
        try {
          drawFrame(frames[k], k);
        } catch (e) {
          reject(e);
          return;
        }
        k++;
        raf(tick);
      } else {
        resolve({ hz, intended: frames.slice(), timestamps, analysis: analyzeTiming(timestamps, hz, n) });
      }
    };
    raf(tick);
  });
}
