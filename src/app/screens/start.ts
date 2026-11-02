import { nextSession } from "../../core/curriculum";
import type { AppContext } from "../context";
import { clear, h } from "../dom";
import { daysBetween } from "../routes";

export const DISCLAIMER =
  "nearpoint is a personal research tool, not a medical device. It does not diagnose, treat or prevent any condition. Have your eyes examined by an eye-care professional, and see one promptly if your vision changes.";

function backupStale(): boolean {
  try {
    const v = localStorage.getItem("nearpoint.lastBackupAt");
    if (!v || Number.isNaN(Date.parse(v))) return true;
    return daysBetween(v, new Date().toISOString()) >= 7;
  } catch {
    return true;
  }
}

export async function renderStart(ctx: AppContext, root: HTMLElement): Promise<void> {
  const [cal, history] = await Promise.all([ctx.db.latestCalibration(), ctx.db.completedHistory()]);
  const next = nextSession(ctx.curriculum, history);

  const calLines = cal
    ? [
        `Calibrated: ${new Date(cal.createdAt).toLocaleDateString()}`,
        `${cal.pxPerMm.toFixed(2)} px/mm, distance ${cal.distanceCm} cm, refresh ${cal.hz} Hz`,
      ]
    : ["Not calibrated yet"];

  const nextLines = next.stop
    ? [`Program complete (${next.reason})`]
    : [
        `Session ${next.plan.sessionIndex + 1}`,
        `${next.plan.params.cpd} cpd, orientation ${next.plan.params.thetaDeg}°`,
        next.plan.reason,
      ];

  const canTrain = !!cal && !next.stop;
  const hint = !cal ? "Calibrate first." : next.stop ? "The program is complete." : "";

  clear(root);
  root.append(
    h("h1", {}, "nearpoint"),
    h("p", {}, DISCLAIMER),
    ...(backupStale() ? [h("div", { class: "banner" }, "No backup in the last 7 days — open Data to save one")] : []),
    h("section", { class: "card" }, h("h2", {}, "Calibration"), ...calLines.map((l) => h("p", {}, l))),
    h("section", { class: "card" }, h("h2", {}, "Next session"), ...nextLines.map((l) => h("p", {}, l))),
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary", disabled: !canTrain, onclick: () => ctx.navigate("train") }, "Start training"),
      h("button", { onclick: () => ctx.navigate("calibrate") }, "Calibrate"),
      h("button", { onclick: () => ctx.navigate("history") }, "History"),
      h("button", { onclick: () => ctx.navigate("data") }, "Data"),
    ),
    ...(hint ? [h("p", { class: "small" }, hint)] : []),
    h("p", { class: "small" }, `Storage: ${ctx.persistence}`),
  );
}
