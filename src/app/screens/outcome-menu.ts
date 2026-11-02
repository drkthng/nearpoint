/** Outcome tests menu: acuity variants, reading speed, contrast sensitivity, printable chart, past results. */
import { nearChartSvg, type ChartOrder } from "../../core/outcome/near-chart";
import type { OutcomeTestRow } from "../../data/schema";
import type { AppContext } from "../context";
import { clear, h } from "../dom";
import { downloadText } from "../download";

export const OUTCOME_KIND_LABEL: Record<string, string> = {
  "acuity-crowded-unlimited": "Near acuity, crowded, unlimited",
  "acuity-uncrowded-unlimited": "Near acuity, uncrowded, unlimited",
  "acuity-crowded-timed": "Near acuity, crowded, time-limited",
  "acuity-uncrowded-timed": "Near acuity, uncrowded, time-limited",
  reading: "Reading speed",
  contrast: "Contrast sensitivity",
};

/** One-line main result of an outcome row. */
export function outcomeHeadline(r: OutcomeTestRow): string {
  const s = r.summary;
  const n = (k: string, d = 2) => (typeof s[k] === "number" ? (s[k] as number).toFixed(d) : "–");
  if (r.kind.startsWith("acuity")) return `${n("logMAR")} logMAR`;
  if (r.kind === "reading") return `MRS ${n("maxReadingSpeedWpm", 0)} wpm, CPS ${n("criticalPrintSize", 1)}, RA ${n("readingAcuity")}`;
  if (r.kind === "contrast") return `log CS ${n("logCS2")} / ${n("logCS4")} / ${n("logCS6")} (2 / 4 / 6 cpd)`;
  return JSON.stringify(s);
}

export function isTestRun(r: OutcomeTestRow): boolean {
  return typeof r.summary.testRun === "string";
}

export async function renderOutcomeMenu(ctx: AppContext, root: HTMLElement): Promise<void> {
  const [cal, rows] = await Promise.all([ctx.db.latestCalibration(), ctx.db.all<OutcomeTestRow>("outcomeTests")]);
  const distanceCm = cal?.distanceCm ?? ctx.curriculum.distance_cm;
  const go = (route: "acuity" | "reading" | "contrast", q?: string) => h("button", { disabled: !cal, onclick: () => ctx.navigate(route, q) }, "Start");
  const item = (title: string, text: string, btn: HTMLElement) => h("section", { class: "card" }, h("h2", {}, title), h("p", {}, text), btn);

  const chart = (order: ChartOrder) => {
    const svg = nearChartSvg({ order, distanceCm });
    return h("div", { class: "row" },
      h("button", { onclick: () => downloadText(`nearpoint-near-chart-${order}-${distanceCm}cm.svg`, svg, "image/svg+xml") }, `Download chart ${order} (SVG)`),
      h("button", {
        onclick: () => {
          const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
          window.open(url, "_blank");
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
      }, `Open chart ${order}`));
  };

  const recent = rows.filter((r) => !isTestRun(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  clear(root);
  root.append(
    h("h1", {}, "Outcome tests"),
    h("p", {}, "These tests measure near vision before, during and after the training program. They are separate from training and give no per-trial feedback. Run each test at the same distance and lighting every time."),
    ...(cal ? [] : [h("div", { class: "banner" }, "Calibrate first: the tests use the latest calibration for letter and grating sizes.")]),
    item("Near acuity — crowded", "Lines of 5 letters, 0.1 logMAR steps, scored per letter.",
      h("div", { class: "row" }, go("acuity", "crowding=crowded&timing=unlimited"), h("button", { disabled: !cal, onclick: () => ctx.navigate("acuity", "crowding=crowded&timing=timed") }, "Time-limited"))),
    item("Near acuity — uncrowded", "Single letters, 5 per size.",
      h("div", { class: "row" }, go("acuity", "crowding=uncrowded&timing=unlimited"), h("button", { disabled: !cal, onclick: () => ctx.navigate("acuity", "crowding=uncrowded&timing=timed") }, "Time-limited"))),
    item("Reading speed", "Timed 10-word sentences at decreasing print size: maximum reading speed, critical print size, reading acuity.", go("reading")),
    item("Contrast sensitivity", "Contrast thresholds for an isolated grating patch at 2, 4 and 6 cycles/degree (about 10 minutes).", go("contrast")),
    h("section", { class: "card" },
      h("h2", {}, "Printable near chart"),
      h("p", {}, `For paper testing at ${distanceCm} cm. Two letter orders: use A and B alternately. Print at 100 % and check the 100 mm bar.`),
      chart("A"),
      chart("B")),
    h("h2", {}, "Recent results"),
    recent.length === 0
      ? h("p", {}, "No outcome tests yet.")
      : h("div", { class: "scroll" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Test"), h("th", {}, "Result"))),
          h("tbody", {}, ...recent.map((r) => h("tr", {},
            h("td", {}, new Date(r.createdAt).toLocaleString()),
            h("td", {}, OUTCOME_KIND_LABEL[r.kind] ?? r.kind),
            h("td", {}, outcomeHeadline(r))))))),
    h("button", { onclick: () => ctx.navigate("start") }, "Back"),
  );
}
