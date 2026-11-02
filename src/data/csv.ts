import type { Segment } from "../core/trial";
import type { BackupFile, NearpointDb } from "./db";
import type { BlockRow, Calibration, OutcomeTestRow, SessionRow, StoreName, TrialRow } from "./schema";

export type CsvValue = string | number | boolean | null | undefined;
export interface CsvColumn<T> {
  name: string;
  get: (row: T) => CsvValue;
}

/** One CSV field (RFC 4180). null/undefined/NaN/Infinity -> empty; booleans -> 1/0. */
export function csvField(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (/[,"\r\n]/.test(v) || /^\s|\s$/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => csvField(c.name)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvField(c.get(r))).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let pending = false; // something has been read for the current row
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      pending = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      pending = true;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      pending = false;
    } else {
      field += ch;
      pending = true;
    }
  }
  if (pending) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "phase:interval:frames:flags" joined by ";"; flags = T (target), F (flankers), X (fixation). */
export function encodeSegments(s: readonly Segment[]): string {
  return s
    .map((g) => {
      const flags = (g.showTarget ? "T" : "") + (g.showFlankers ? "F" : "") + (g.showFixation ? "X" : "");
      return `${g.phase}:${g.interval}:${g.frames}:${flags}`;
    })
    .join(";");
}

export function decodeSegments(s: string): Segment[] {
  if (s === "") return [];
  return s.split(";").map((part) => {
    const [phase, interval, frames, flags = ""] = part.split(":");
    return {
      phase: phase as Segment["phase"],
      interval: Number(interval) as Segment["interval"],
      showTarget: flags.includes("T"),
      showFlankers: flags.includes("F"),
      showFixation: flags.includes("X"),
      frames: Number(frames),
    };
  });
}

const list = (a: readonly number[] | undefined): string => (a ? a.map(String).join(";") : "");

export const CALIBRATION_COLUMNS: readonly CsvColumn<Calibration>[] = [
  { name: "id", get: (r) => r.id },
  { name: "created_at", get: (r) => r.createdAt },
  { name: "px_per_mm", get: (r) => r.pxPerMm },
  { name: "distance_cm", get: (r) => r.distanceCm },
  { name: "hz_measured", get: (r) => r.hzMeasured },
  { name: "hz", get: (r) => r.hz },
  { name: "device_pixel_ratio", get: (r) => r.devicePixelRatio },
  { name: "screen_width_px", get: (r) => r.screenWidthPx },
  { name: "screen_height_px", get: (r) => r.screenHeightPx },
  { name: "method", get: (r) => r.method },
  { name: "user_agent", get: (r) => r.userAgent },
  { name: "note", get: (r) => r.note },
];

export const SESSION_COLUMNS: readonly CsvColumn<SessionRow>[] = [
  { name: "id", get: (r) => r.id },
  { name: "started_at", get: (r) => r.startedAt },
  { name: "ended_at", get: (r) => r.endedAt },
  { name: "status", get: (r) => r.status },
  { name: "session_index", get: (r) => r.sessionIndex },
  { name: "calibration_id", get: (r) => r.calibrationId },
  { name: "curriculum_version", get: (r) => r.curriculumVersion },
  { name: "cpd", get: (r) => r.cpd },
  { name: "theta_deg", get: (r) => r.thetaDeg },
  { name: "change", get: (r) => r.change },
  { name: "reason", get: (r) => r.reason },
];

export const BLOCK_COLUMNS: readonly CsvColumn<BlockRow>[] = [
  { name: "id", get: (r) => r.id },
  { name: "session_id", get: (r) => r.sessionId },
  { name: "block_index", get: (r) => r.blockIndex },
  { name: "condition", get: (r) => r.condition },
  { name: "cpd", get: (r) => r.cpd },
  { name: "theta_deg", get: (r) => r.thetaDeg },
  { name: "dur_ms", get: (r) => r.durMs },
  { name: "trials_planned", get: (r) => r.trialsPlanned },
  { name: "flank_contrast", get: (r) => r.flankContrast },
  { name: "n_flankers", get: (r) => r.nFlankers },
  { name: "sep_lambda", get: (r) => list(r.sepLambda) },
  { name: "isi_ms", get: (r) => list(r.isiMs) },
  { name: "threshold", get: (r) => r.threshold },
  { name: "reversals", get: (r) => list(r.reversals) },
  { name: "valid_trials", get: (r) => r.validTrials },
  { name: "invalid_trials", get: (r) => r.invalidTrials },
];

export const TRIAL_COLUMNS: readonly CsvColumn<TrialRow>[] = [
  { name: "id", get: (r) => r.id },
  { name: "session_id", get: (r) => r.sessionId },
  { name: "block_id", get: (r) => r.blockId },
  { name: "trial_index", get: (r) => r.trialIndex },
  { name: "at", get: (r) => r.at },
  { name: "contrast", get: (r) => r.contrast },
  { name: "sep_lambda", get: (r) => r.sepLambda },
  { name: "isi_ms", get: (r) => r.isiMs },
  { name: "target_interval", get: (r) => r.targetInterval },
  { name: "response", get: (r) => r.response },
  { name: "correct", get: (r) => r.correct },
  { name: "rt_ms", get: (r) => r.rtMs },
  { name: "valid", get: (r) => r.valid },
  { name: "timing_hz", get: (r) => r.timing?.hz },
  { name: "timing_frames", get: (r) => r.timing?.analysis.frameCount },
  { name: "timing_valid", get: (r) => r.timing?.analysis.valid },
  { name: "timing_max_interval_ms", get: (r) => r.timing?.analysis.maxIntervalMs },
  { name: "timing_late_frames", get: (r) => list(r.timing?.analysis.lateFrames) },
  { name: "timing_reasons", get: (r) => r.timing?.analysis.reasons.join(" | ") },
  { name: "timing_segments", get: (r) => (r.timing ? encodeSegments(r.timing.segments) : "") },
  { name: "timing_timestamps", get: (r) => list(r.timing?.timestamps) },
];

export const OUTCOME_TEST_COLUMNS: readonly CsvColumn<OutcomeTestRow>[] = [
  { name: "id", get: (r) => r.id },
  { name: "created_at", get: (r) => r.createdAt },
  { name: "kind", get: (r) => r.kind },
  { name: "calibration_id", get: (r) => r.calibrationId },
  { name: "summary", get: (r) => JSON.stringify(r.summary) },
  { name: "details", get: (r) => (r.details === undefined ? "" : JSON.stringify(r.details)) },
];

export const CSV_FILES: readonly { file: string; store: StoreName }[] = [
  { file: "calibrations.csv", store: "calibrations" },
  { file: "sessions.csv", store: "sessions" },
  { file: "blocks.csv", store: "blocks" },
  { file: "trials.csv", store: "trials" },
  { file: "outcome_tests.csv", store: "outcomeTests" },
];

/** Column definitions per file name (used by the dictionary-sync test). */
export const CSV_COLUMNS: Record<string, readonly CsvColumn<never>[]> = {
  "calibrations.csv": CALIBRATION_COLUMNS as readonly CsvColumn<never>[],
  "sessions.csv": SESSION_COLUMNS as readonly CsvColumn<never>[],
  "blocks.csv": BLOCK_COLUMNS as readonly CsvColumn<never>[],
  "trials.csv": TRIAL_COLUMNS as readonly CsvColumn<never>[],
  "outcome_tests.csv": OUTCOME_TEST_COLUMNS as readonly CsvColumn<never>[],
};

function render(store: StoreName, rows: readonly unknown[]): string {
  switch (store) {
    case "calibrations":
      return toCsv(rows as Calibration[], CALIBRATION_COLUMNS);
    case "sessions":
      return toCsv(rows as SessionRow[], SESSION_COLUMNS);
    case "blocks":
      return toCsv(rows as BlockRow[], BLOCK_COLUMNS);
    case "trials":
      return toCsv(rows as TrialRow[], TRIAL_COLUMNS);
    case "outcomeTests":
      return toCsv(rows as OutcomeTestRow[], OUTCOME_TEST_COLUMNS);
  }
}

export function backupToCsv(b: BackupFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { file, store } of CSV_FILES) out[file] = render(store, b[store]);
  return out;
}

export async function exportCsv(db: NearpointDb): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const { file, store } of CSV_FILES) out[file] = render(store, await db.all(store));
  return out;
}
