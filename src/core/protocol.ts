/**
 * Curriculum data model. Durations are stored in ms (protocol values from the literature)
 * and converted to whole frames at runtime with framesFor(ms, measuredHz).
 */
export type Condition = "SINGLE" | "LM" | "CROWD" | "BM-T" | "BM-LM" | "BM-CROWD";
export type Orientation = 0 | 45 | 90 | 135;

export interface Block {
  condition: Condition;
  cpd: number; // 2..8 in the published protocol
  theta_deg: Orientation;
  dur_ms: number; // target (and mask) duration
  trials: number;
  flank_contrast?: number; // 0..1, required for flanked and masked conditions
  sep_lambda?: number[]; // target-flanker distances in wavelengths
  n_flankers?: number; // crowding: 4..11 in the published protocol
  isi_ms?: number[]; // backward-mask delays
}

export interface Progression {
  change_one_param_per_session: boolean;
  rotate_orientation_every_n_sessions: number;
  raise_cpd_when_threshold_below: number; // placeholder, not published
  stop_when_plateau_sessions: number; // placeholder, not published
  min_sessions: number;
  max_sessions: number;
}

export interface Curriculum {
  version: 1;
  distance_cm: number;
  staircase: { start: number; step: number; down: number; floor: number };
  session_template: Block[];
  progression: Progression;
}

const ORIENTATIONS: readonly number[] = [0, 45, 90, 135];
const FLANKED: readonly Condition[] = ["LM", "CROWD", "BM-T", "BM-LM", "BM-CROWD"];
const MASKED: readonly Condition[] = ["BM-T", "BM-LM", "BM-CROWD"];

/** Returns a list of human-readable problems; empty means valid. */
export function validateCurriculum(c: Curriculum): string[] {
  const errs: string[] = [];
  if (c.version !== 1) errs.push("version must be 1");
  if (!(c.distance_cm >= 25 && c.distance_cm <= 60)) errs.push("distance_cm should be 25..60 (protocol: 40)");
  if (!(c.staircase.down >= 1)) errs.push("staircase.down must be >= 1");
  if (!(c.staircase.start > 0 && c.staircase.start <= 1)) errs.push("staircase.start must be in (0, 1]");
  if (c.session_template.length === 0) errs.push("session_template is empty");
  c.session_template.forEach((b, i) => {
    const at = `block ${i} (${b.condition})`;
    if (!(b.cpd >= 1 && b.cpd <= 12)) errs.push(`${at}: cpd out of range`);
    if (!ORIENTATIONS.includes(b.theta_deg)) errs.push(`${at}: theta_deg must be 0/45/90/135`);
    if (!(b.dur_ms > 0)) errs.push(`${at}: dur_ms must be > 0`);
    if (!(Number.isInteger(b.trials) && b.trials > 0)) errs.push(`${at}: trials must be a positive integer`);
    if (FLANKED.includes(b.condition)) {
      if (!(b.flank_contrast !== undefined && b.flank_contrast > 0 && b.flank_contrast <= 1))
        errs.push(`${at}: flank_contrast in (0, 1] required`);
      if (!b.sep_lambda || b.sep_lambda.length === 0) errs.push(`${at}: sep_lambda required`);
    }
    if (b.condition.endsWith("CROWD") && !(b.n_flankers !== undefined && b.n_flankers >= 2))
      errs.push(`${at}: n_flankers >= 2 required for crowding`);
    if (MASKED.includes(b.condition) && (!b.isi_ms || b.isi_ms.length === 0)) errs.push(`${at}: isi_ms required`);
  });
  const p = c.progression;
  if (p.min_sessions > p.max_sessions) errs.push("progression: min_sessions > max_sessions");
  return errs;
}
