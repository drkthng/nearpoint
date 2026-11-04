import type { ChangeKind } from "../core/curriculum";
import type { Condition, Orientation } from "../core/protocol";
import type { StoredTiming } from "./timing-record";

export const DB_NAME = "nearpoint";
export const STORES = ["calibrations", "sessions", "blocks", "trials", "outcomeTests"] as const;
export type StoreName = (typeof STORES)[number];

export interface Calibration {
  id?: number;
  createdAt: string;
  pxPerMm: number;
  distanceCm: number;
  hzMeasured: number;
  hz: number;
  devicePixelRatio: number;
  screenWidthPx: number;
  screenHeightPx: number;
  method: "card" | "ruler" | "manual";
  userAgent: string;
  note?: string;
}

export interface SessionRow {
  id?: number;
  startedAt: string;
  endedAt: string | null;
  status: "in-progress" | "completed" | "aborted";
  sessionIndex: number;
  calibrationId: number | null;
  curriculumVersion: number;
  cpd: number;
  thetaDeg: Orientation;
  change: ChangeKind;
  reason: string;
  abortReason?: string;
  /** Seed of the session's mulberry32 stream, so plans/trials can be replayed. */
  rngSeed?: number;
  appVersion?: string;
  /** Interval ticks (sound at each interval onset) were on; undefined for sessions before the setting existed. */
  intervalTicks?: boolean;
}

export interface BlockRow {
  id?: number;
  sessionId: number;
  blockIndex: number;
  condition: Condition;
  cpd: number;
  thetaDeg: Orientation;
  durMs: number;
  trialsPlanned: number;
  flankContrast: number | null;
  nFlankers: number | null;
  sepLambda: number[];
  isiMs: number[];
  threshold: number | null;
  reversals: number[];
  validTrials: number;
  invalidTrials: number;
}

export interface TrialRow {
  id?: number;
  sessionId: number;
  blockId: number;
  trialIndex: number;
  at: string;
  contrast: number;
  sepLambda: number | null;
  isiMs: number | null;
  flankerContrast?: number | null;
  targetInterval: 1 | 2;
  response: 1 | 2 | null;
  correct: boolean | null;
  rtMs: number | null;
  /** Must equal timing.analysis.valid (denormalised for indexing/CSV). */
  valid: boolean;
  timing: StoredTiming;
}

export interface OutcomeTestRow {
  id?: number;
  createdAt: string;
  kind: string;
  calibrationId: number | null;
  summary: Record<string, number | string | null>;
  details: unknown;
}

export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

/**
 * Migrations. MIGRATIONS[i] upgrades the database from version i to i + 1.
 *
 * To change the schema: APPEND a new function to this array (never edit or reorder an existing
 * one: databases in the field have already run it), then set SCHEMA_VERSION = MIGRATIONS.length
 * (it is derived below, so appending is enough). Backups made at older versions must be
 * transformed by restoreBackup once a migration changes row shapes.
 */
export const MIGRATIONS: readonly Migration[] = [
  // v0 -> v1: initial stores and indexes.
  (db, tx) => {
    for (const name of STORES) db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
    tx.objectStore("calibrations").createIndex("createdAt", "createdAt");
    tx.objectStore("sessions").createIndex("startedAt", "startedAt");
    tx.objectStore("blocks").createIndex("sessionId", "sessionId");
    tx.objectStore("trials").createIndex("sessionId", "sessionId");
    tx.objectStore("trials").createIndex("blockId", "blockId");
    tx.objectStore("outcomeTests").createIndex("createdAt", "createdAt");
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;
