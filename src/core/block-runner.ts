import type { Block, Curriculum } from "./protocol";
import { buildTrial, hasFlankers, isMasked, type TrialPlan } from "./trial";
import { Staircase } from "./staircase";

export const MAX_ATTEMPT_FACTOR = 1.5;

export interface TrialSetup {
  trialIndex: number;
  contrast: number;
  sepLambda: number | null;
  isiMs: number | null;
  plan: TrialPlan;
}
export interface TrialOutcome {
  response: 1 | 2;
  timingValid: boolean;
}
export interface BlockRunResult {
  threshold: number | null;
  reversals: number[];
  validTrials: number;
  invalidTrials: number;
  attempts: number;
  finalContrast: number;
}

export class BlockRunner {
  private readonly sc: Staircase;
  private pending: TrialSetup | null = null;
  private valid = 0;
  private invalid = 0;
  private attempts = 0;

  constructor(
    private readonly block: Block,
    staircase: Curriculum["staircase"],
    private readonly hz: number,
    private readonly rand: () => number,
  ) {
    this.sc = new Staircase({ start: staircase.start, step: staircase.step, down: staircase.down, floor: staircase.floor });
  }

  get done(): boolean {
    return this.valid >= this.block.trials || this.attempts >= Math.ceil(this.block.trials * MAX_ATTEMPT_FACTOR);
  }

  next(): TrialSetup {
    if (this.done) throw new Error("block is done");
    if (this.pending) throw new Error("previous trial not recorded");
    const b = this.block;
    const pick = (l: number[]) => l[Math.floor(this.rand() * l.length)];
    const sepLambda = (hasFlankers(b.condition) || isMasked(b.condition)) && b.sep_lambda?.length ? pick(b.sep_lambda) : null;
    const isiMs = isMasked(b.condition) && b.isi_ms?.length ? pick(b.isi_ms) : null;
    const plan = buildTrial({ condition: b.condition, hz: this.hz, durMs: b.dur_ms, isiMs: isiMs ?? undefined }, this.rand);
    this.pending = { trialIndex: this.attempts, contrast: this.sc.contrast, sepLambda, isiMs, plan };
    return this.pending;
  }

  /** Drops the pending trial without counting it (no attempt, no staircase change), e.g. after an aborted playback. */
  discard(): void {
    if (!this.pending) throw new Error("no trial pending");
    this.pending = null;
  }

  record(o: TrialOutcome): { correct: boolean; counted: boolean } {
    const p = this.pending;
    if (!p) throw new Error("no trial pending");
    this.pending = null;
    const correct = o.response === p.plan.targetInterval;
    this.attempts++;
    if (o.timingValid) {
      this.sc.update(correct);
      this.valid++;
      return { correct, counted: true };
    }
    this.invalid++;
    return { correct, counted: false };
  }

  result(): BlockRunResult {
    return {
      threshold: this.sc.threshold(),
      reversals: this.sc.reversals.map((x) => 10 ** x),
      validTrials: this.valid,
      invalidTrials: this.invalid,
      attempts: this.attempts,
      finalContrast: this.sc.contrast,
    };
  }
}
