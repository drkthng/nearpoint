import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../core/rng";
import { analyzeTiming } from "../core/timing";
import { buildTrial, expandFrames } from "../core/trial";
import type { Segment } from "../core/trial";
import {
  CSV_COLUMNS,
  CSV_FILES,
  backupToCsv,
  csvField,
  decodeSegments,
  encodeSegments,
  exportCsv,
  parseCsv,
  toCsv,
} from "./csv";
import type { CsvColumn } from "./csv";
import { openDb } from "./db";
import type { BlockRow, Calibration, SessionRow, TrialRow } from "./schema";
import { toStoredTiming } from "./timing-record";

const T0 = "2026-11-02T09:00:00.000Z";

describe("csvField", () => {
  it("formats values", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(true)).toBe("1");
    expect(csvField(false)).toBe("0");
    expect(csvField(3.5)).toBe("3.5");
    expect(csvField(NaN)).toBe("");
    expect(csvField(Infinity)).toBe("");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField(" pad")).toBe('" pad"');
    expect(csvField("plain")).toBe("plain");
  });
});

describe("toCsv / parseCsv", () => {
  it("round trips awkward values", () => {
    type R = { a: string | null; b: number | undefined; c: string };
    const cols: CsvColumn<R>[] = [
      { name: "a", get: (r) => r.a },
      { name: "b", get: (r) => r.b },
      { name: "c", get: (r) => r.c },
    ];
    const rows: R[] = [
      { a: "x,y", b: 1, c: 'q"uote' },
      { a: null, b: undefined, c: "multi\r\nline\nbreak" },
      { a: " lead", b: 2.25, c: "" },
    ];
    const text = toCsv(rows, cols);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    const parsed = parseCsv(text);
    expect(parsed[0]).toEqual(["a", "b", "c"]);
    expect(parsed).toHaveLength(4);
    const unq = (v: string) => (v.startsWith('"') ? v.slice(1, -1).replace(/""/g, '"') : v);
    rows.forEach((r, i) => {
      const expected = cols.map((c) => unq(csvField(c.get(r))));
      expect(parsed[i + 1]).toEqual(expected);
    });
  });

  it("parses LF input and ignores the trailing newline", () => {
    expect(parseCsv('a,b\n1,"x\ny"\n')).toEqual([["a", "b"], ["1", "x\ny"]]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("segments", () => {
  it("round trips a BM-CROWD plan", () => {
    const plan = buildTrial({ condition: "BM-CROWD", hz: 60, durMs: 68, isiMs: 83 }, mulberry32(1));
    const segs = toStoredTiming({
      hz: 60,
      intended: expandFrames(plan),
      timestamps: [],
      analysis: analyzeTiming([], 60, 0),
    }).segments;
    expect(segs.length).toBeGreaterThan(3);
    expect(decodeSegments(encodeSegments(segs))).toEqual(segs);
  });

  it("encodes a known list exactly", () => {
    const base = { showTarget: false, showFlankers: false, showFixation: false };
    const s: Segment[] = [
      { ...base, phase: "fixation", interval: 0, showFixation: true, frames: 12 },
      { ...base, phase: "blank", interval: 0, frames: 23 },
      { ...base, phase: "stim", interval: 1, showTarget: true, showFlankers: true, frames: 4 },
    ];
    expect(encodeSegments(s)).toBe("fixation:0:12:X;blank:0:23:;stim:1:4:TF");
    expect(decodeSegments("")).toEqual([]);
  });
});

const cal: Calibration = {
  createdAt: T0, pxPerMm: 18.2, distanceCm: 40, hzMeasured: 59.98, hz: 60, devicePixelRatio: 3,
  screenWidthPx: 2340, screenHeightPx: 1080, method: "card", userAgent: "UA, with \"quotes\"",
};
const sess: SessionRow = {
  startedAt: T0, endedAt: null, status: "in-progress", sessionIndex: 0, calibrationId: 1,
  curriculumVersion: 1, cpd: 4, thetaDeg: 90, change: "none", reason: "first, ok",
};
const blk = (sessionId: number, blockIndex: number): BlockRow => ({
  sessionId, blockIndex, condition: blockIndex === 0 ? "LM" : "BM-CROWD", cpd: 4, thetaDeg: 90, durMs: 68,
  trialsPlanned: 2, flankContrast: 0.4, nFlankers: 2, sepLambda: [3, 4], isiMs: [83], threshold: 0.05,
  reversals: [0.1, 0.05], validTrials: 2, invalidTrials: 0,
});

function timing(seed: number) {
  const plan = buildTrial({ condition: "BM-CROWD", hz: 60, durMs: 68, isiMs: 83 }, mulberry32(seed));
  const intended = expandFrames(plan);
  const timestamps = Array.from({ length: intended.length + 1 }, (_, k) => (k * 1000) / 60 + 0.123456789);
  return {
    stored: toStoredTiming({ hz: 60, intended, timestamps, analysis: analyzeTiming(timestamps, 60, intended.length) }),
    targetInterval: plan.targetInterval,
  };
}

describe("export", () => {
  it("exports one file per table and round trips timing", async () => {
    const db = await openDb({ factory: new IDBFactory() });
    await db.add("calibrations", cal);
    const sid = await db.add("sessions", sess);
    const stored: ReturnType<typeof timing>["stored"][] = [];
    for (let b = 0; b < 2; b++) {
      const bid = await db.add("blocks", blk(sid, b));
      for (let k = 0; k < 2; k++) {
        const t = timing(b * 10 + k + 1);
        stored.push(t.stored);
        const row: TrialRow = {
          sessionId: sid, blockId: bid, trialIndex: k, at: T0, contrast: 0.1, sepLambda: 3, isiMs: 83,
          targetInterval: t.targetInterval, response: t.targetInterval, correct: true, rtMs: 640, valid: true,
          timing: t.stored,
        };
        await db.add("trials", row);
      }
    }
    const files = await exportCsv(db);
    expect(Object.keys(files)).toEqual(CSV_FILES.map((f) => f.file));
    expect(CSV_FILES.map((f) => f.file)).toEqual([
      "calibrations.csv", "sessions.csv", "blocks.csv", "trials.csv", "outcome_tests.csv",
    ]);
    for (const { file } of CSV_FILES) {
      expect(parseCsv(files[file])[0]).toEqual(CSV_COLUMNS[file].map((c) => c.name));
    }
    const trials = parseCsv(files["trials.csv"]);
    expect(trials).toHaveLength(5);
    const header = trials[0];
    const at = (row: string[], name: string) => row[header.indexOf(name)];
    trials.slice(1).forEach((row, i) => {
      expect(decodeSegments(at(row, "timing_segments"))).toEqual(stored[i].segments);
      expect(at(row, "timing_timestamps").split(";").map(Number)).toEqual(stored[i].timestamps);
      expect(at(row, "timing_frames")).toBe(String(stored[i].analysis.frameCount));
    });
    expect(parseCsv(files["calibrations.csv"])[1][10]).toBe('UA, with "quotes"');

    const backup = await db.exportBackup(T0);
    expect(backupToCsv(backup)).toEqual(files);
    db.close();
  });

  it("gives header-only files for an empty db", async () => {
    const db = await openDb({ factory: new IDBFactory() });
    const files = await exportCsv(db);
    for (const { file } of CSV_FILES) {
      const rows = parseCsv(files[file]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(CSV_COLUMNS[file].map((c) => c.name));
    }
    db.close();
  });
});

describe("data dictionary", () => {
  it("lists every column of every file in order", () => {
    const md = readFileSync(new URL("../../docs/data-dictionary.md", import.meta.url), "utf8");
    for (const { file } of CSV_FILES) {
      const start = md.indexOf(`## ${file}\n`);
      expect(start, `section ${file}`).toBeGreaterThanOrEqual(0);
      const rest = md.slice(start + file.length + 4);
      const next = rest.indexOf("\n## ");
      const section = next < 0 ? rest : rest.slice(0, next);
      const names: string[] = [];
      for (const line of section.split("\n")) {
        const m = /^\|\s*`([^`]+)`\s*\|/.exec(line);
        if (m) names.push(m[1]);
      }
      expect(names, file).toEqual(CSV_COLUMNS[file].map((c) => c.name));
    }
  });
});
