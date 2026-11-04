/**
 * When to (re)run the outcome tests (our choice, docs/protocol.md): a baseline before training
 * session 1, then after every OUTCOME_EVERY completed sessions, and when the program is complete.
 * Pure: works on completed-session timestamps and outcome-test timestamps.
 */
export const OUTCOME_EVERY = 10;

export interface OutcomeDue {
  due: boolean;
  reason: string;
}

/**
 * completedSessionsAt: ISO end (or start) times of completed training sessions, any order.
 * outcomeTestsAt: ISO times of real (non-test-run) outcome tests.
 */
export function outcomeDue(completedSessionsAt: readonly string[], outcomeTestsAt: readonly string[], programComplete = false): OutcomeDue {
  const sessions = [...completedSessionsAt].sort();
  const lastTest = [...outcomeTestsAt].sort().pop() ?? null;
  const n = sessions.length;
  if (lastTest === null) return { due: true, reason: n === 0 ? "Baseline: run the outcome tests before your first training session." : "No outcome tests yet: run them now." };
  const since = sessions.filter((t) => t > lastTest).length;
  if (programComplete && since > 0) return { due: true, reason: "Program complete: run the final outcome tests." };
  if (since >= OUTCOME_EVERY) return { due: true, reason: `${since} sessions since your last outcome tests: run them again.` };
  return { due: false, reason: `Next outcome tests after ${OUTCOME_EVERY - since} more session${OUTCOME_EVERY - since === 1 ? "" : "s"}.` };
}

/** Whole days between the last completed session and now; null if none. */
export function daysSinceLast(completedSessionsAt: readonly string[], nowIso: string): number | null {
  const last = [...completedSessionsAt].sort().pop();
  if (!last) return null;
  return Math.floor((Date.parse(nowIso) - Date.parse(last)) / 86_400_000);
}
