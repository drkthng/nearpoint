import { thresholdChartSvg, valueChartSvg, type ChartSeries } from "../../core/chart";
import { outcomeProgress } from "../../core/outcome/progress";
import type { BlockRow, OutcomeTestRow, SessionRow } from "../../data/schema";
import { OUTCOME_KIND_LABEL, isTestRun, outcomeHeadline } from "./outcome-menu";
import type { AppContext } from "../context";
import { clear, h } from "../dom";

export async function renderHistory(ctx: AppContext, root: HTMLElement): Promise<void> {
  const allSessions = (await ctx.db.all<SessionRow>("sessions")).sort((a, b) => a.sessionIndex - b.sessionIndex || a.startedAt.localeCompare(b.startedAt));
  const sessions = allSessions.filter((s) => s.status === "completed");
  const aborted = allSessions.filter((s) => s.status !== "completed");
  const blocksBy = new Map<number, BlockRow[]>();
  for (const s of allSessions) blocksBy.set(s.id as number, await ctx.db.sessionBlocks(s.id as number));

  const rowFor = (s: SessionRow, extra?: string) => {
    const bl = blocksBy.get(s.id as number) ?? [];
    const valid = bl.reduce((a, b) => a + b.validTrials, 0);
    const invalid = bl.reduce((a, b) => a + b.invalidTrials, 0);
    return h("tr", {},
      h("td", {}, String(s.sessionIndex + 1)),
      h("td", {}, new Date(s.startedAt).toLocaleString()),
      h("td", {}, s.status),
      h("td", {}, String(s.cpd)),
      h("td", {}, `${s.thetaDeg}°`),
      h("td", {}, s.change),
      h("td", {}, `${valid} / ${invalid}`),
      ...(extra !== undefined ? [h("td", {}, extra)] : []));
  };
  const rows = sessions.map((s) => rowFor(s));
  const abortedRows = aborted.map((s) => rowFor(s, s.abortReason ?? ""));

  const byCond = new Map<string, ChartSeries>();
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    for (const b of blocksBy.get(s.id as number) ?? []) {
      let ser = byCond.get(b.condition);
      if (!ser) byCond.set(b.condition, (ser = { label: b.condition, points: [] }));
      ser.points.push({ x: s.sessionIndex, y: b.threshold });
    }
  }
  const chart = h("div", { class: "chart" });
  // Our own escaped SVG output from thresholdChartSvg.
  chart.innerHTML = thresholdChartSvg([...byCond.values()], { title: "Contrast threshold by session", xLabelOffset: 1 });

  const outcomes = (await ctx.db.all<OutcomeTestRow>("outcomeTests")).filter((r) => !isTestRun(r)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  clear(root);
  root.append(
    h("h1", {}, "History"),
    sessions.length === 0
      ? h("p", {}, "No completed sessions yet.")
      : h("div", { class: "scroll" }, h("table", {},
          h("thead", {}, h("tr", {}, ...["#", "Started", "Status", "cpd", "θ", "Change", "Valid / invalid"].map((t) => h("th", {}, t)))),
          h("tbody", {}, ...rows))),
    h("h2", {}, "Thresholds"),
    chart,
    ...(aborted.length
      ? [h("details", {}, h("summary", {}, `Aborted and test sessions (${aborted.length})`),
          h("div", { class: "scroll" }, h("table", {},
            h("thead", {}, h("tr", {}, ...["#", "Started", "Status", "cpd", "θ", "Change", "Valid / invalid", "Reason"].map((t) => h("th", {}, t)))),
            h("tbody", {}, ...abortedRows))))]
      : []),
    h("p", { class: "small" }, "Lower is better. cpd changes make thresholds jump."),
    h("h2", {}, "Outcome tests"),
    ...outcomeCharts(outcomes),
    outcomes.length === 0
      ? h("p", {}, "No outcome tests yet.")
      : h("div", { class: "scroll" }, h("table", {},
          h("thead", {}, h("tr", {}, ...["Date", "Test", "Result"].map((t) => h("th", {}, t)))),
          h("tbody", {}, ...outcomes.map((r) => h("tr", {},
            h("td", {}, new Date(r.createdAt).toLocaleString()),
            h("td", {}, OUTCOME_KIND_LABEL[r.kind] ?? r.kind),
            h("td", {}, outcomeHeadline(r))))))),
    h("button", { onclick: () => ctx.navigate("start") }, "Back"),
  );
}

/** Charts of the outcome measures over test days (only when there is something to draw). */
function outcomeCharts(rows: readonly OutcomeTestRow[]): HTMLElement[] {
  const p = outcomeProgress(rows);
  const out: HTMLElement[] = [];
  const add = (svg: string) => {
    const el = h("div", { class: "chart" });
    el.innerHTML = svg; // our own escaped SVG output
    out.push(el);
  };
  if (p.acuity.length) add(valueChartSvg(p.acuity, { title: "Near acuity (lower is better)", yLabel: "logMAR", xLabels: p.days, invertY: true }));
  if (p.reading.length) add(valueChartSvg(p.reading, { title: "Maximum reading speed", yLabel: "words/min", xLabels: p.days, decimals: 0 }));
  if (p.contrast.length) add(valueChartSvg(p.contrast, { title: "Contrast sensitivity (higher is better)", yLabel: "log CS", xLabels: p.days }));
  return out;
}
