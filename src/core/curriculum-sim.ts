import type { BlockResult, SessionPlan, SessionRecord } from "./curriculum";
import { nextSession } from "./curriculum";
import { makeObserver } from "./observer";
import type { Condition, Curriculum } from "./protocol";
import { mulberry32 } from "./rng";
import { Staircase } from "./staircase";

/**
 * Simulated-observer model for whole-program tests. The factors are
 * illustrative, NOT published values; LM < 1 reflects collinear facilitation
 * at 2-4 lambda separation.
 */
export interface SimModel {
  alpha0: number; // Weibull alpha for SINGLE at 4 cpd, 0 deg, session 0
  beta: number;
  guess: number;
  lapse: number;
  improvementPerSession: number; // 0.02 = alpha shrinks 2 % per completed session
  cpdExponent: number; // alpha ∝ (cpd / 4)^cpdExponent
  conditionFactor: Record<Condition, number>;
  obliqueFactor: number; // multiplier for 45 and 135 deg
}

export const DEFAULT_SIM_MODEL: SimModel = {
  alpha0: 0.06,
  beta: 3,
  guess: 0.5,
  lapse: 0.02,
  improvementPerSession: 0.02,
  cpdExponent: 1,
  conditionFactor: { SINGLE: 1, LM: 0.8, CROWD: 1.5, "BM-T": 1.3, "BM-LM": 1.5, "BM-CROWD": 1.8 },
  obliqueFactor: 1.1,
};

export function observerAlpha(
  m: SimModel,
  sessionIndex: number,
  cpd: number,
  thetaDeg: number,
  condition: Condition,
): number {
  return (
    m.alpha0 *
    Math.pow(1 - m.improvementPerSession, sessionIndex) *
    Math.pow(cpd / 4, m.cpdExponent) *
    m.conditionFactor[condition] *
    (thetaDeg === 45 || thetaDeg === 135 ? m.obliqueFactor : 1)
  );
}

export interface SimResult {
  plans: SessionPlan[];
  sessions: SessionRecord[];
  stopReason: string;
}

export function simulateProgram(c: Curriculum, m: SimModel, seed: number): SimResult {
  const rand = mulberry32(seed);
  const plans: SessionPlan[] = [];
  const sessions: SessionRecord[] = [];
  for (;;) {
    const r = nextSession(c, sessions);
    if (r.stop) return { plans, sessions, stopReason: r.reason };
    const plan = r.plan;
    const blocks: BlockResult[] = [];
    for (const block of plan.blocks) {
      const stair = new Staircase({
        start: c.staircase.start,
        step: c.staircase.step,
        down: c.staircase.down,
        floor: c.staircase.floor,
      });
      const obs = makeObserver(
        {
          alpha: observerAlpha(m, plan.sessionIndex, block.cpd, block.theta_deg, block.condition),
          beta: m.beta,
          guess: m.guess,
          lapse: m.lapse,
        },
        rand,
      );
      for (let i = 0; i < block.trials; i++) stair.update(obs(stair.contrast));
      blocks.push({ condition: block.condition, threshold: stair.threshold() });
    }
    plans.push(plan);
    sessions.push({ params: plan.params, blocks });
  }
}
