/** Display geometry and frame timing. All stimulus specs are in degrees, ms and cycles/degree. */

/** Millimetres on screen subtended by one degree of visual angle at the given distance. */
export function mmPerDegree(distanceMm: number): number {
  return 2 * distanceMm * Math.tan((0.5 * Math.PI) / 180);
}

export function pxPerDegree(distanceMm: number, pxPerMm: number): number {
  return mmPerDegree(distanceMm) * pxPerMm;
}

/** Grating wavelength in device pixels for a given spatial frequency. */
export function lambdaPx(cpd: number, distanceMm: number, pxPerMm: number): number {
  if (!(cpd > 0)) throw new Error("cpd must be > 0");
  return pxPerDegree(distanceMm, pxPerMm) / cpd;
}

/** Nearest whole number of frames (at least 1) for a duration in ms. */
export function framesFor(ms: number, hz: number): number {
  return Math.max(1, Math.round((ms * hz) / 1000));
}

export function framesToMs(frames: number, hz: number): number {
  return (frames * 1000) / hz;
}

/** Snap a measured refresh rate to the nearest common panel rate. */
export function snapRefreshRate(measuredHz: number): number {
  const common = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  return common.reduce((best, c) => (Math.abs(c - measuredHz) < Math.abs(best - measuredHz) ? c : best), 60);
}
