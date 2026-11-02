import type { Block, Condition, Curriculum, Orientation } from "./protocol";
import { validateCurriculum } from "./protocol";

export const CPD_LADDER: readonly number[] = [2, 3, 4, 6, 8];
export const ORIENTATION_CYCLE: readonly Orientation[] = [0, 45, 90, 135];
export const PLATEAU_MARGIN_LOG10 = 0.01;

export interface SessionParams { cpd: number; thetaDeg: Orientation }
/**
 * threshold null = staircase did not converge (fewer than 4 reversals); such blocks are ignored
 * by sessionScore. A session with no converged block neither raises cpd nor counts towards the plateau.
 */
export interface BlockResult {
  condition: Condition;
  threshold: number | null;
  blockIndex?: number;
  validTrials?: number;
  invalidTrials?: number;
}
export interface SessionRecord { params: SessionParams; blocks: BlockResult[] }
export type ChangeKind = "none" | "orientation" | "cpd" | "orientation+cpd";
/**
 * Within a block, each trial draws sep_lambda and isi_ms uniformly at random (seeded) from the
 * block's lists; one staircase per block.
 */
export interface SessionPlan {
  sessionIndex: number;
  params: SessionParams;
  blocks: Block[];
  change: ChangeKind;
  reason: string;
}
export type NextSession =
  | { stop: false; plan: SessionPlan }
  | { stop: true; reason: string; sessionsCompleted: number };

/** Geometric mean of the non-null block thresholds; null if none. */
export function sessionScore(r: SessionRecord): number | null {
  const ts = r.blocks.map((b) => b.threshold).filter((t): t is number => t !== null);
  if (ts.length === 0) return null;
  return Math.exp(ts.reduce((a, t) => a + Math.log(t), 0) / ts.length);
}

export function nextCpd(cpd: number): number {
  const i = CPD_LADDER.indexOf(cpd);
  if (i < 0) throw new Error(`cpd ${cpd} not in CPD_LADDER`);
  return CPD_LADDER[Math.min(i + 1, CPD_LADDER.length - 1)];
}

export function nextOrientation(t: Orientation): Orientation {
  const i = ORIENTATION_CYCLE.indexOf(t);
  return ORIENTATION_CYCLE[(i + 1) % ORIENTATION_CYCLE.length];
}

/**
 * Window-mean plateau test. Takes the trailing run of sessions at the last session's cpd, drops
 * unscored (null) sessions, and compares the mean log10 score of the last k scored sessions with
 * the mean of the k before them. Plateau when the last k improved on the previous k by less than
 * marginLog10. Needs at least 2k scored sessions at the current cpd, otherwise false.
 */
export function isPlateau(
  history: readonly SessionRecord[],
  plateauSessions: number,
  marginLog10: number = PLATEAU_MARGIN_LOG10,
): boolean {
  if (history.length === 0) return false;
  const lastCpd = history[history.length - 1].params.cpd;
  let start = history.length;
  while (start > 0 && history[start - 1].params.cpd === lastCpd) start--;
  const L: number[] = [];
  for (const r of history.slice(start)) {
    const s = sessionScore(r);
    if (s !== null) L.push(Math.log10(s));
  }
  const k = plateauSessions;
  if (L.length < 2 * k) return false;
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const recent = mean(L.slice(L.length - k));
  const before = mean(L.slice(L.length - 2 * k, L.length - k));
  return before - recent < marginLog10;
}

export function nextSession(c: Curriculum, history: readonly SessionRecord[]): NextSession {
  const errs = validateCurriculum(c);
  if (errs.length > 0) throw new Error(`invalid curriculum: ${errs.join("; ")}`);
  if (c.progression.change_one_param_per_session && c.progression.rotate_orientation_every_n_sessions < 2) {
    throw new Error("rotate_orientation_every_n_sessions must be >= 2 when change_one_param_per_session is true");
  }
  const first = c.session_template[0];
  if (!CPD_LADDER.includes(first.cpd)) throw new Error(`cpd ${first.cpd} not in CPD_LADDER`);
  const p = c.progression;
  const n = history.length;

  if (n >= p.max_sessions) return { stop: true, reason: "max_sessions reached", sessionsCompleted: n };
  if (n >= p.min_sessions && isPlateau(history, p.stop_when_plateau_sessions)) {
    return { stop: true, reason: "plateau", sessionsCompleted: n };
  }

  let params: SessionParams = { cpd: first.cpd, thetaDeg: first.theta_deg };
  let change: ChangeKind = "none";
  let reason = "first session";

  if (n >= 1) {
    const prev = history[n - 1].params;
    params = { ...prev };
    const every = p.rotate_orientation_every_n_sessions;
    const rotateDue = n % every === 0;
    const score = sessionScore(history[n - 1]);
    const cpdDue = score !== null && score < p.raise_cpd_when_threshold_below && prev.cpd < 8;
    const doRotate = rotateDue; // rotation always wins when due
    const doCpd = p.change_one_param_per_session ? !rotateDue && cpdDue : cpdDue;
    const parts: string[] = [];
    if (doRotate) {
      params.thetaDeg = nextOrientation(prev.thetaDeg);
      parts.push(`rotate orientation (every ${every} sessions)`);
    }
    if (doCpd) {
      params.cpd = nextCpd(prev.cpd);
      parts.push(
        `raise cpd ${prev.cpd} → ${params.cpd}: previous score ${score!.toFixed(3)} < ${p.raise_cpd_when_threshold_below}`,
      );
    }
    change = doRotate && doCpd ? "orientation+cpd" : doRotate ? "orientation" : doCpd ? "cpd" : "none";
    reason = parts.length ? parts.join("; ") : "no change";
  }

  const blocks = c.session_template.map((b) => ({
    ...b,
    ...(b.sep_lambda ? { sep_lambda: [...b.sep_lambda] } : {}),
    ...(b.isi_ms ? { isi_ms: [...b.isi_ms] } : {}),
    cpd: params.cpd,
    theta_deg: params.thetaDeg,
  }));
  return { stop: false, plan: { sessionIndex: n, params, blocks, change, reason } };
}
