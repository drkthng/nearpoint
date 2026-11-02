/**
 * n-down / 1-up staircase on log10 contrast.
 * down = 2 converges near 70.7 % correct, down = 3 near 79.4 %.
 */
export interface StaircaseOptions {
  start: number; // initial contrast, 0..1
  step?: number; // step size in log10 units
  floor?: number; // minimum contrast
  ceil?: number; // maximum contrast
  down?: number; // consecutive correct answers needed to step down
}

export class Staircase {
  private logc: number;
  private readonly step: number;
  private readonly lo: number;
  private readonly hi: number;
  private readonly down: number;
  private streak = 0;
  private lastDir: -1 | 0 | 1 = 0;
  readonly reversals: number[] = [];
  trials = 0;
  correct = 0;

  constructor(o: StaircaseOptions) {
    if (!(o.start > 0)) throw new Error("start contrast must be > 0");
    this.step = o.step ?? 0.1;
    this.lo = Math.log10(o.floor ?? 0.003);
    this.hi = Math.log10(o.ceil ?? 0.9);
    this.down = o.down ?? 2;
    this.logc = Math.min(this.hi, Math.max(this.lo, Math.log10(o.start)));
  }

  get contrast(): number {
    return 10 ** this.logc;
  }

  update(isCorrect: boolean): void {
    this.trials++;
    let dir: -1 | 1;
    if (isCorrect) {
      this.correct++;
      this.streak++;
      if (this.streak < this.down) return;
      this.streak = 0;
      dir = -1;
    } else {
      this.streak = 0;
      dir = 1;
    }
    if (this.lastDir !== 0 && dir !== this.lastDir) this.reversals.push(this.logc);
    this.lastDir = dir;
    this.logc = Math.min(this.hi, Math.max(this.lo, this.logc + dir * this.step));
  }

  /** Geometric mean of the last n reversal contrasts, or null if too few reversals. */
  threshold(n = 8, minReversals = 4): number | null {
    if (this.reversals.length < minReversals) return null;
    const r = this.reversals.slice(-n);
    return 10 ** (r.reduce((a, b) => a + b, 0) / r.length);
  }
}

/** Target proportion correct of an n-down / 1-up rule: p^n = 0.5. */
export function convergencePoint(down: number): number {
  return 0.5 ** (1 / down);
}
