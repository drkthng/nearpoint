import { exportCsv } from "../../data/csv";
import type { BackupFile } from "../../data/db";
import type { AppContext } from "../context";
import { clear, h } from "../dom";
import { downloadText } from "../download";
import { backupFileName } from "../routes";

export async function renderData(ctx: AppContext, root: HTMLElement): Promise<void> {
  const status = h("p", { role: "status" });
  const say = (m: string) => { status.textContent = m; };

  const file = h("input", {
    type: "file",
    accept: ".json,application/json",
    onchange: async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const backup = JSON.parse(await f.text()) as BackupFile;
        if (!confirm("Replace ALL data on this device with this backup?")) { say("Restore cancelled."); return; }
        await ctx.db.restoreBackup(backup);
        say("Restore complete.");
      } catch (e) {
        say(`Restore failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        file.value = "";
      }
    },
  });

  clear(root);
  root.append(
    h("h1", {}, "Data"),
    h("p", {}, "All data stays on this device. Export it or keep a backup."),
    h("div", { class: "row" },
      h("button", {
        onclick: async () => {
          try {
            const files = await exportCsv(ctx.db);
            for (const [name, text] of Object.entries(files)) downloadText(name, text, "text/csv");
            say(`Exported ${Object.keys(files).length} CSV files.`);
          } catch (e) { say(`Export failed: ${e instanceof Error ? e.message : String(e)}`); }
        },
      }, "Export CSV"),
      h("button", {
        onclick: async () => {
          try {
            const now = new Date().toISOString();
            const b = await ctx.db.exportBackup(now);
            downloadText(backupFileName(now), JSON.stringify(b, null, 0), "application/json");
            try { localStorage.setItem("nearpoint.lastBackupAt", now); } catch { /* ignore */ }
            say("Backup downloaded.");
          } catch (e) { say(`Backup failed: ${e instanceof Error ? e.message : String(e)}`); }
        },
      }, "Download backup (JSON)")),
    h("section", { class: "card" }, h("h2", {}, "Restore from backup"), file),
    status,
    h("p", { class: "small" }, `Storage: ${ctx.persistence}. App version ${ctx.appVersion}.`),
    h("button", { onclick: () => ctx.navigate("start") }, "Back"),
  );
}
