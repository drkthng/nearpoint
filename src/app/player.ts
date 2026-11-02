import type { FrameSpec } from "../core/trial";
import { analyzeTiming, type TrialTimingLog } from "../core/timing";

export type RafFn = (cb: (timestampMs: number) => void) => unknown;

export interface PlayOptions {
  frames: readonly FrameSpec[];
  hz: number;
  /** Must draw synchronously; called once per frame, every frame (the dither seed must change
   *  every frame, so unchanged frames are never skipped). */
  drawFrame: (frame: FrameSpec, index: number) => void;
  /** Draws the post-trial screen (mean grey / response screen); called synchronously in the final
   *  rAF callback so the last trial frame stays on screen exactly t[N] − t[N−1]. */
  drawEnd: () => void;
  /** Default: requestAnimationFrame, resolved at call time. */
  raf?: RafFn;
  /** Abort playback (rejects with "playback aborted"). S5 should abort on `visibilitychange`
   *  (a hidden tab stops rAF, so playback would otherwise never finish). */
  signal?: AbortSignal;
}

/**
 * Present `frames` one per requestAnimationFrame callback and return the timing log.
 *
 * Frame k's content is drawn inside the rAF callback whose timestamp is t[k] and becomes
 * visible at the following vsync; t[k+1] - t[k] therefore measures how long frame k stayed on
 * screen (content drawn at callback t[k] is presented one vsync later, as is frame k+1, so the
 * latency cancels). N frames give N+1 timestamps (one final callback); drawEnd must run in that
 * final callback so the post-trial screen replaces frame N-1 at the same latency, otherwise the
 * last frame's on-screen time would not equal t[N] - t[N-1]. The response phase is not part of
 * playback (S5). No timers are used: stimulus timing comes only from rAF.
 */
export function playFrames(o: PlayOptions): Promise<TrialTimingLog> {
  const { frames, hz, drawFrame, drawEnd, signal } = o;
  if (!(Number.isFinite(hz) && hz > 0)) return Promise.reject(new Error(`hz must be > 0 (got ${hz})`));
  if (frames.length === 0) return Promise.reject(new Error("frames must not be empty"));
  if (signal?.aborted) return Promise.reject(new Error("playback aborted"));
  const raf: RafFn = o.raf ?? ((cb) => requestAnimationFrame(cb));
  const n = frames.length;
  return new Promise<TrialTimingLog>((resolve, reject) => {
    const timestamps: number[] = [];
    let k = 0;
    const tick = (t: number): void => {
      if (signal?.aborted) {
        reject(new Error("playback aborted"));
        return;
      }
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
        try {
          drawEnd();
          resolve({ hz, intended: frames.slice(), timestamps, analysis: analyzeTiming(timestamps, hz, n) });
        } catch (e) {
          reject(e);
        }
      }
    };
    raf(tick);
  });
}
