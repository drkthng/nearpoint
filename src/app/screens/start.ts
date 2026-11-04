import { nextSession } from "../../core/curriculum";
import type { AppContext } from "../context";
import { clear, h } from "../dom";
import { daysBetween } from "../routes";
import { closeApp } from "../close";
import { daysSinceLast, outcomeDue } from "../../core/outcome/schedule";
import type { OutcomeTestRow, SessionRow } from "../../data/schema";
import { isTestRun } from "./outcome-menu";

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
  const [sessionRows, outcomeRows] = await Promise.all([ctx.db.all<SessionRow>("sessions"), ctx.db.all<OutcomeTestRow>("outcomeTests")]);
  const doneAt = sessionRows.filter((r) => r.status === "completed").map((r) => r.endedAt ?? r.startedAt);
  const testsAt = outcomeRows.filter((r) => !isTestRun(r)).map((r) => r.createdAt);
  const due = outcomeDue(doneAt, testsAt, next.stop);
  const since = daysSinceLast(doneAt, new Date().toISOString());
  const progressLines = [
    `Training sessions completed: ${doneAt.length} (the program runs at least ${ctx.curriculum.progression.min_sessions})`,
    since === null ? "No training session yet." : since === 0 ? "Last session: today." : `Last session: ${since} day${since === 1 ? "" : "s"} ago.${since >= 3 ? " Aim for one session a day (at least 3 a week)." : ""}`,
    ...(due.due ? [] : [due.reason]),
  ];

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

  const closeHint = h("p", { class: "small", role: "status" });
  clear(root);
  root.append(
    h("h1", {}, "nearpoint"),
    h("p", {}, DISCLAIMER),
    ...(backupStale() ? [h("div", { class: "banner" }, "No backup in the last 7 days — open Data to save one")] : []),
    ...(due.due ? [h("div", { class: "banner" }, due.reason + " ", h("button", { onclick: () => ctx.navigate("tests") }, "Outcome tests"))] : []),
    h("section", { class: "card" }, h("h2", {}, "Progress"), ...progressLines.map((l) => h("p", {}, l))),
    h("section", { class: "card" }, h("h2", {}, "Calibration"), ...calLines.map((l) => h("p", {}, l))),
    h("section", { class: "card" }, h("h2", {}, "Next session"), ...nextLines.map((l) => h("p", {}, l))),
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary", disabled: !canTrain, onclick: () => ctx.navigate("train") }, "Start training"),
      h("button", { onclick: () => ctx.navigate("calibrate") }, "Calibrate"),
      h("button", { onclick: () => ctx.navigate("tests") }, "Outcome tests"),
      h("button", { onclick: () => ctx.navigate("history") }, "History"),
      h("button", { onclick: () => ctx.navigate("data") }, "Data"),
      h("button", { onclick: () => closeApp((t) => { closeHint.textContent = t; }) }, "Close app"),
    ),
    closeHint,
    ...(hint ? [h("p", { class: "small" }, hint)] : []),
    h("p", { class: "small" }, `Storage: ${ctx.persistence}`),
  );
}
