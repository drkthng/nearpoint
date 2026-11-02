/**
 * Contrast-threshold outcome test at 2, 4 and 6 cpd. Its own stimulus path: an isolated, vertical
 * Gabor at the screen centre in a 2IFC trial built here (not by the training trial engine), with
 * its own 3-down/1-up staircase settings and stop rule. Pure logic, no DOM.
 */
import { framesFor } from "../geometry";
import { Staircase } from "../staircase";
import type { FrameSpec } from "../trial";

export const CONTRAST_TEST_CPD: readonly number[] = [2, 4, 6];
export const CONTRAST_TEST = {
  thetaDeg: 0,
  durMs: 200,
  fixationMs: 200,
  preBlankMs: 400,
  gapMs: 500,
  start: 0.1,
  step: 0.1,
  down: 3,
  floor: 0.002,
  ceil: 0.9,
  /** Stop after this many reversals … */
  stopReversals: 10,
  /** … or this many timing-valid trials … */
  maxTrials: 60,
  /** … or this many attempts (valid + invalid). */
  maxAttempts: 90,
  /** Threshold = geometric mean of the last n reversals (needs at least minReversals). */
  thresholdReversals: 6,
  minReversals: 4,
} as const;

export interface ContrastTestFrame extends FrameSpec {
  /** Only true in the target interval's stimulus frames. */
  showTarget: boolean;
}

function frame(phase: FrameSpec["phase"], interval: 0 | 1 | 2, showTarget: boolean, showFixation: boolean): ContrastTestFrame {
  return { phase, interval, showTarget, showFlankers: false, showFixation };
}

/** Fixation → blank → interval 1 → gap → interval 2, in whole frames. */
export function contrastTestFrames(hz: number, targetInterval: 1 | 2): ContrastTestFrame[] {
  const c = CONTRAST_TEST;
  const out: ContrastTestFrame[] = [];
  const push = (n: number, f: ContrastTestFrame): void => {
    for (let i = 0; i < n; i++) out.push({ ...f });
  };
  push(framesFor(c.fixationMs, hz), frame("fixation", 0, false, true));
  push(framesFor(c.preBlankMs, hz), frame("blank", 0, false, false));
  push(framesFor(c.durMs, hz), frame("stim", 1, targetInterval === 1, false));
  push(framesFor(c.gapMs, hz), frame("gap", 0, false, false));
  push(framesFor(c.durMs, hz), frame("stim", 2, targetInterval === 2, false));
  return out;
}

export interface ContrastTestTrial {
  contrast: number;
  targetInterval: 1 | 2;
  response: 1 | 2;
  correct: boolean;
  valid: boolean;
}

export interface ContrastTestResult {
  cpd: number;
  threshold: number | null;
  /** log10 contrast sensitivity (−log10 threshold), null if not converged. */
  logCS: number | null;
  reversals: number[];
  validTrials: number;
  invalidTrials: number;
}

/** One staircase per spatial frequency. */
export class ContrastTestRun {
  private readonly sc = new Staircase({
    start: CONTRAST_TEST.start,
    step: CONTRAST_TEST.step,
    down: CONTRAST_TEST.down,
    floor: CONTRAST_TEST.floor,
    ceil: CONTRAST_TEST.ceil,
  });
  readonly trials: ContrastTestTrial[] = [];
  private pending: { contrast: number; targetInterval: 1 | 2 } | null = null;

  private readonly limits: { stopReversals: number; maxTrials: number; maxAttempts: number };

  /** `limits` shortens a run (test mode only). */
  constructor(
    readonly cpd: number,
    private readonly rand: () => number,
    limits: Partial<{ stopReversals: number; maxTrials: number; maxAttempts: number }> = {},
  ) {
    const c = CONTRAST_TEST;
    this.limits = { stopReversals: c.stopReversals, maxTrials: c.maxTrials, maxAttempts: c.maxAttempts, ...limits };
  }

  get validTrials(): number {
    return this.trials.filter((t) => t.valid).length;
  }

  get done(): boolean {
    const c = this.limits;
    return this.sc.reversals.length >= c.stopReversals || this.validTrials >= c.maxTrials || this.trials.length >= c.maxAttempts;
  }

  next(): { contrast: number; targetInterval: 1 | 2 } {
    if (this.done) throw new Error("run finished");
    this.pending = { contrast: this.sc.contrast, targetInterval: this.rand() < 0.5 ? 1 : 2 };
    return { ...this.pending };
  }

  /** Forget the pending trial (aborted playback); nothing is recorded. */
  discard(): void {
    this.pending = null;
  }

  record(response: 1 | 2, valid: boolean): ContrastTestTrial {
    const p = this.pending;
    if (!p) throw new Error("no pending trial");
    this.pending = null;
    const t: ContrastTestTrial = { ...p, response, correct: response === p.targetInterval, valid };
    this.trials.push(t);
    if (valid) this.sc.update(t.correct);
    return t;
  }

  result(): ContrastTestResult {
    const threshold = this.sc.threshold(CONTRAST_TEST.thresholdReversals, CONTRAST_TEST.minReversals);
    return {
      cpd: this.cpd,
      threshold,
      logCS: threshold === null ? null : -Math.log10(threshold),
      reversals: [...this.sc.reversals],
      validTrials: this.validTrials,
      invalidTrials: this.trials.length - this.validTrials,
    };
  }
}
