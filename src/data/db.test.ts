import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../core/rng";
import { analyzeTiming } from "../core/timing";
import { buildTrial, expandFrames } from "../core/trial";
import { openDb } from "./db";
import type { BackupFile } from "./db";
import { MIGRATIONS, STORES } from "./schema";
import type { BlockRow, Calibration, SessionRow, TrialRow } from "./schema";
import { toStoredTiming } from "./timing-record";

const T0 = "2026-11-02T09:00:00.000Z";

function timing(seed: number) {
  const plan = buildTrial({ condition: "BM-CROWD", hz: 60, durMs: 68, isiMs: 83 }, mulberry32(seed));
  const intended = expandFrames(plan);
  const timestamps = Array.from({ length: intended.length + 1 }, (_, k) => (k * 1000) / 60);
  return {
    stored: toStoredTiming({ hz: 60, intended, timestamps, analysis: analyzeTiming(timestamps, 60, intended.length) }),
    targetInterval: plan.targetInterval,
  };
}

const cal: Calibration = {
  createdAt: T0, pxPerMm: 18.2, distanceCm: 40, hzMeasured: 59.98, hz: 60, devicePixelRatio: 3,
  screenWidthPx: 2340, screenHeightPx: 1080, method: "card", userAgent: "test",
};
const sess = (over: Partial<SessionRow> = {}): SessionRow => ({
  startedAt: T0, endedAt: null, status: "in-progress", sessionIndex: 0, calibrationId: 1,
  curriculumVersion: 1, cpd: 4, thetaDeg: 90, change: "none", reason: "first", ...over,
});
const blk = (sessionId: number, blockIndex: number): BlockRow => ({
  sessionId, blockIndex, condition: blockIndex === 0 ? "LM" : "BM-CROWD", cpd: 4, thetaDeg: 90, durMs: 68,
  trialsPlanned: 3, flankContrast: 0.4, nFlankers: 2, sepLambda: [3, 4], isiMs: [83], threshold: 0.05 * (blockIndex + 1),
  reversals: [0.1, 0.05], validTrials: 3, invalidTrials: 0,
});

async function populate(db: Awaited<ReturnType<typeof openDb>>) {
  const calId = await db.add("calibrations", cal);
  const sid = await db.add("sessions", sess({ calibrationId: calId }));
  const bids: number[] = [];
  const trials: TrialRow[] = [];
  for (let b = 0; b < 2; b++) {
    const bid = await db.add("blocks", blk(sid, b));
    bids.push(bid);
    for (let k = 0; k < 3; k++) {
      const t = timing(b * 10 + k + 1);
      const row: TrialRow = {
        sessionId: sid, blockId: bid, trialIndex: k, at: `2026-11-02T09:00:0${b * 3 + k}.000Z`,
        contrast: 0.1, sepLambda: 3, isiMs: 83, targetInterval: t.targetInterval, response: t.targetInterval,
        correct: true, rtMs: 640, valid: true, timing: t.stored,
      };
      const id = await db.add("trials", row);
      trials.push({ ...row, id });
    }
  }
  return { calId, sid, bids, trials };
}

describe("openDb", () => {
  it("fresh open creates version 1 with all stores", async () => {
    const db = await openDb({ factory: new IDBFactory() });
    expect(db.version).toBe(1);
    expect([...db.storeNames].sort()).toEqual([...STORES].sort());
    for (const s of STORES) expect(await db.all(s)).toEqual([]);
    db.close();
  });

  it("full session round trip", async () => {
    const db = await openDb({ factory: new IDBFactory() });
    const { calId, sid, bids, trials } = await populate(db);
    expect(await db.get("calibrations", calId)).toEqual({ ...cal, id: calId });
    expect(await db.latestCalibration()).toEqual({ ...cal, id: calId });
    expect(await db.sessionBlocks(sid)).toEqual([
      { ...blk(sid, 0), id: bids[0] },
      { ...blk(sid, 1), id: bids[1] },
    ]);
    expect(await db.sessionTrials(sid)).toEqual(trials);
    const s = (await db.get<SessionRow>("sessions", sid))!;
    await db.put("sessions", { ...s, id: sid, status: "completed", endedAt: T0 });
    expect(await db.completedHistory()).toEqual([
      {
        params: { cpd: 4, thetaDeg: 90 },
        blocks: [
          { condition: "LM", threshold: 0.05, blockIndex: 0, validTrials: 3, invalidTrials: 0 },
          { condition: "BM-CROWD", threshold: 0.1, blockIndex: 1, validTrials: 3, invalidTrials: 0 },
        ],
      },
    ]);
    db.close();
  });

  it("completedHistory ignores unfinished sessions and orders by sessionIndex", async () => {
    const db = await openDb({ factory: new IDBFactory() });
    await db.add("sessions", sess({ status: "completed", sessionIndex: 2, cpd: 6 }));
    await db.add("sessions", sess({ status: "in-progress", sessionIndex: 3 }));
    await db.add("sessions", sess({ status: "completed", sessionIndex: 1, cpd: 3 }));
    await db.add("sessions", sess({ status: "aborted", sessionIndex: 0 }));
    const h = await db.completedHistory();
    expect(h.map((r) => r.params.cpd)).toEqual([3, 6]);
    db.close();
  });
});

describe("backup", () => {
  it("export -> JSON -> restore into fresh db -> export is identical", async () => {
    const a = await openDb({ factory: new IDBFactory() });
    await populate(a);
    const b1 = await a.exportBackup("2026-11-02T10:00:00.000Z");
    expect(b1.format).toBe("nearpoint-backup");
    expect(b1.schemaVersion).toBe(1);
    const parsed = JSON.parse(JSON.stringify(b1)) as BackupFile;
    const c = await openDb({ factory: new IDBFactory() });
    await c.restoreBackup(parsed);
    expect(await c.exportBackup("2026-11-02T10:00:00.000Z")).toEqual(b1);
    a.close();
    c.close();
  });

  it("restore replaces existing data", async () => {
    const small = await openDb({ factory: new IDBFactory() });
    await small.add("calibrations", cal);
    const backup = await small.exportBackup(T0);
    const db = await openDb({ factory: new IDBFactory() });
    await populate(db);
    await db.add("calibrations", { ...cal, note: "extra" });
    await db.restoreBackup(backup);
    expect(await db.all("calibrations")).toEqual([{ ...cal, id: 1 }]);
    expect(await db.all("sessions")).toEqual([]);
    expect(await db.all("trials")).toEqual([]);
    small.close();
    db.close();
  });

  it("rejects bad backups with exact messages and leaves data unchanged", async () => {
    const db = await openDb({ factory: new IDBFactory() });
    await populate(db);
    const before = await db.exportBackup(T0);
    await expect(db.restoreBackup({ ...before, format: "x" } as unknown as BackupFile)).rejects.toThrow(
      "not a nearpoint backup",
    );
    await expect(db.restoreBackup({ ...before, schemaVersion: 2 })).rejects.toThrow(
      "backup schema 2 is newer than this app (1)",
    );
    const { trials: _t, ...noTrials } = before;
    await expect(db.restoreBackup(noTrials as unknown as BackupFile)).rejects.toThrow("backup is missing trials");
    expect(await db.exportBackup(T0)).toEqual(before);
    db.close();
  });
});

describe("migrations", () => {
  it("upgrades v1 -> v2 keeping data; refuses downgrade", async () => {
    const factory = new IDBFactory();
    const v1 = await openDb({ name: "m", factory, migrations: [MIGRATIONS[0]] });
    const sid = await v1.add("sessions", sess());
    const t = timing(1);
    const at = "2026-11-02T09:00:00.000Z";
    await v1.add("trials", {
      sessionId: sid, blockId: 1, trialIndex: 0, at, contrast: 0.1, sepLambda: null, isiMs: null,
      targetInterval: t.targetInterval, response: null, correct: null, rtMs: null, valid: true, timing: t.stored,
    } satisfies TrialRow);
    v1.close();

    const v2 = (db: IDBDatabase, tx: IDBTransaction) => {
      tx.objectStore("trials").createIndex("at", "at");
      db.createObjectStore("notes", { keyPath: "id", autoIncrement: true });
    };
    const db2 = await openDb({ name: "m", factory, migrations: [MIGRATIONS[0], v2] });
    expect(db2.version).toBe(2);
    expect(await db2.all("sessions")).toHaveLength(1);
    expect(await db2.sessionTrials(sid)).toHaveLength(1);
    expect(await db2.byIndex<TrialRow>("trials", "at", at)).toHaveLength(1);
    expect(db2.storeNames).toContain("notes");
    db2.close();

    await expect(openDb({ name: "m", factory, migrations: [MIGRATIONS[0]] })).rejects.toBeTruthy();
  });
});
