/**
 * Outcome results over time: turns stored outcome-test rows into chart series (pure).
 * x = index of the test day (one x position per calendar day with any outcome test).
 */
import type { ChartSeries } from "../chart";

export interface OutcomeRowLike {
  createdAt: string;
  kind: string;
  summary: Record<string, number | string | null>;
}

export interface OutcomeProgress {
  days: string[];
  acuity: ChartSeries[];
  reading: ChartSeries[];
  contrast: ChartSeries[];
}

const ACUITY_KINDS: readonly [string, string][] = [
  ["acuity-crowded-unlimited", "crowded"],
  ["acuity-crowded-timed", "crowded, 250 ms"],
  ["acuity-uncrowded-unlimited", "uncrowded"],
  ["acuity-uncrowded-timed", "uncrowded, 250 ms"],
];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Excludes automatic test runs (summary.testRun). If a test was run more than once a day, the last one counts. */
export function outcomeProgress(rows: readonly OutcomeRowLike[]): OutcomeProgress {
  const real = rows.filter((r) => typeof r.summary.testRun !== "string").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const days = [...new Set(real.map((r) => r.createdAt.slice(0, 10)))];
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const series = (label: string, kind: string, key: string): ChartSeries => {
    const byDay = new Map<number, number | null>();
    for (const r of real) if (r.kind === kind) byDay.set(dayIndex.get(r.createdAt.slice(0, 10))!, num(r.summary[key]));
    return { label, points: [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([x, y]) => ({ x, y })) };
  };
  const nonEmpty = (s: ChartSeries[]) => s.filter((x) => x.points.some((p) => p.y !== null));
  return {
    days,
    acuity: nonEmpty(ACUITY_KINDS.map(([kind, label]) => series(label, kind, "logMAR"))),
    reading: nonEmpty([series("max reading speed", "reading", "maxReadingSpeedWpm")]),
    contrast: nonEmpty([2, 4, 6].map((c) => series(`${c} cpd`, "contrast", `logCS${c}`))),
  };
}
