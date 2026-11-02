import { estimateRefresh, type RefreshEstimate } from "../core/calibration";

/** Resolves after n requestAnimationFrame callbacks (at least 1) with the last timestamp. rAF only, no timers. */
export function waitFrames(n: number): Promise<number> {
  return new Promise((resolve) => {
    let left = Math.max(1, Math.floor(n));
    const tick = (t: number): void => {
      left--;
      if (left <= 0) resolve(t);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Collects `samples` rAF timestamps (default 61 = 60 intervals) and estimates the refresh rate. */
export function measureRefreshNow(samples = 61): Promise<RefreshEstimate> {
  return new Promise((resolve, reject) => {
    const ts: number[] = [];
    const tick = (t: number): void => {
      ts.push(t);
      if (ts.length < samples) {
        requestAnimationFrame(tick);
        return;
      }
      try {
        resolve(estimateRefresh(ts));
      } catch (e) {
        reject(e);
      }
    };
    requestAnimationFrame(tick);
  });
}
