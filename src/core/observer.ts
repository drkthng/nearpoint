/** Simulated 2AFC observer with a Weibull psychometric function. */
export interface PsychometricParams {
  alpha: number; // scale (contrast)
  beta: number; // slope
  guess: number; // 0.5 for 2AFC
  lapse: number; // lapse rate
}

export const DEFAULT_OBSERVER: PsychometricParams = { alpha: 0.04, beta: 3, guess: 0.5, lapse: 0.02 };

export function weibull(c: number, p: PsychometricParams): number {
  return p.guess + (1 - p.guess - p.lapse) * (1 - Math.exp(-((c / p.alpha) ** p.beta)));
}

/** Contrast at which the psychometric function reaches proportion correct pc. */
export function weibullInverse(pc: number, p: PsychometricParams): number {
  const q = (pc - p.guess) / (1 - p.guess - p.lapse);
  if (q <= 0 || q >= 1) throw new Error(`pc ${pc} outside the reachable range`);
  return p.alpha * (-Math.log(1 - q)) ** (1 / p.beta);
}

export function makeObserver(p: PsychometricParams, rand: () => number): (contrast: number) => boolean {
  return (c) => rand() < weibull(c, p);
}
