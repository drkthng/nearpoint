import type { BlockResult, SessionRecord } from "../core/curriculum";
import {
  DB_NAME,
  MIGRATIONS,
  STORES,
  type BlockRow,
  type Calibration,
  type Migration,
  type OutcomeTestRow,
  type SessionRow,
  type StoreName,
  type TrialRow,
} from "./schema";

export interface OpenOptions {
  name?: string;
  factory?: IDBFactory;
  migrations?: readonly Migration[];
}

export interface BackupFile {
  format: "nearpoint-backup";
  schemaVersion: number;
  exportedAt: string;
  calibrations: Calibration[];
  sessions: SessionRow[];
  blocks: BlockRow[];
  trials: TrialRow[];
  outcomeTests: OutcomeTestRow[];
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

/** Open (and migrate) the database. Version = migrations.length. Touches no globals until called. */
export function openDb(o: OpenOptions = {}): Promise<NearpointDb> {
  const name = o.name ?? DB_NAME;
  const factory = o.factory ?? globalThis.indexedDB;
  const migrations = o.migrations ?? MIGRATIONS;
  return new Promise((resolve, reject) => {
    const r = factory.open(name, migrations.length);
    r.onupgradeneeded = (ev) => {
      const tx = r.transaction!;
      try {
        for (let v = ev.oldVersion; v < migrations.length; v++) migrations[v](r.result, tx);
      } catch (e) {
        tx.abort();
        reject(e);
      }
    };
    r.onsuccess = () => resolve(new NearpointDb(r.result));
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("database open blocked"));
  });
}

export class NearpointDb {
  readonly version: number;
  constructor(private readonly db: IDBDatabase) {
    this.version = db.version;
  }

  /** Names of the object stores present (useful for tests and diagnostics). */
  get storeNames(): string[] {
    return Array.from(this.db.objectStoreNames);
  }

  close(): void {
    this.db.close();
  }

  async add<T>(store: StoreName, row: T): Promise<number> {
    const tx = this.db.transaction(store, "readwrite");
    const id = req(tx.objectStore(store).add(row));
    await done(tx);
    return (await id) as number;
  }

  async put<T>(store: StoreName, row: T & { id: number }): Promise<void> {
    const tx = this.db.transaction(store, "readwrite");
    tx.objectStore(store).put(row);
    await done(tx);
  }

  async get<T>(store: StoreName, id: number): Promise<T | undefined> {
    const tx = this.db.transaction(store, "readonly");
    return (await req(tx.objectStore(store).get(id))) as T | undefined;
  }

  async all<T>(store: StoreName): Promise<T[]> {
    const tx = this.db.transaction(store, "readonly");
    return (await req(tx.objectStore(store).getAll())) as T[];
  }

  async byIndex<T>(store: StoreName, index: string, value: IDBValidKey): Promise<T[]> {
    const tx = this.db.transaction(store, "readonly");
    const rows = (await req(tx.objectStore(store).index(index).getAll(value))) as T[];
    // Index order is (index key, primary key); with one key value this is already by id.
    return rows;
  }

  async latestCalibration(): Promise<Calibration | undefined> {
    const tx = this.db.transaction("calibrations", "readonly");
    const c = await req(tx.objectStore("calibrations").openCursor(null, "prev"));
    return c ? (c.value as Calibration) : undefined;
  }

  async sessionBlocks(sessionId: number): Promise<BlockRow[]> {
    const rows = await this.byIndex<BlockRow>("blocks", "sessionId", sessionId);
    return rows.sort((a, b) => a.blockIndex - b.blockIndex);
  }

  async sessionTrials(sessionId: number): Promise<TrialRow[]> {
    const rows = await this.byIndex<TrialRow>("trials", "sessionId", sessionId);
    return rows.sort((a, b) => a.blockId - b.blockId || a.trialIndex - b.trialIndex);
  }

  async completedHistory(): Promise<SessionRecord[]> {
    const sessions = (await this.all<SessionRow>("sessions"))
      .filter((s) => s.status === "completed")
      .sort((a, b) => a.sessionIndex - b.sessionIndex);
    const out: SessionRecord[] = [];
    for (const s of sessions) {
      const blocks: BlockResult[] = (await this.sessionBlocks(s.id as number)).map((b) => ({
        condition: b.condition,
        threshold: b.threshold,
        blockIndex: b.blockIndex,
        validTrials: b.validTrials,
        invalidTrials: b.invalidTrials,
      }));
      out.push({ params: { cpd: s.cpd, thetaDeg: s.thetaDeg }, blocks });
    }
    return out;
  }

  async exportBackup(exportedAt: string): Promise<BackupFile> {
    const tx = this.db.transaction([...STORES], "readonly");
    const [calibrations, sessions, blocks, trials, outcomeTests] = await Promise.all(
      STORES.map((s) => req(tx.objectStore(s).getAll())),
    );
    return {
      format: "nearpoint-backup",
      schemaVersion: this.version,
      exportedAt,
      calibrations,
      sessions,
      blocks,
      trials,
      outcomeTests,
    } as BackupFile;
  }

  /**
   * Replace-mode restore. Validates first (nothing is touched on error), then clears every store
   * and writes every row with its original id in a single transaction.
   * Older schemaVersion backups are accepted as-is for now; future migrations that change row
   * shapes must transform older backups here before writing.
   */
  async restoreBackup(b: BackupFile): Promise<void> {
    if (!b || b.format !== "nearpoint-backup") throw new Error("not a nearpoint backup");
    if (b.schemaVersion > this.version) {
      throw new Error(`backup schema ${b.schemaVersion} is newer than this app (${this.version})`);
    }
    for (const s of STORES) {
      if (!Array.isArray(b[s])) throw new Error(`backup is missing ${s}`);
    }
    const tx = this.db.transaction([...STORES], "readwrite");
    const finished = done(tx);
    for (const s of STORES) {
      const os = tx.objectStore(s);
      os.clear();
      for (const row of b[s]) os.put(row);
    }
    await finished;
  }

  async clearAll(): Promise<void> {
    const tx = this.db.transaction([...STORES], "readwrite");
    for (const s of STORES) tx.objectStore(s).clear();
    await done(tx);
  }
}
