import { describe, expect, it } from "vitest";
import { valueChartSvg } from "../chart";
import { outcomeProgress, type OutcomeRowLike } from "./progress";

const row = (createdAt: string, kind: string, summary: OutcomeRowLike["summary"]): OutcomeRowLike => ({ createdAt, kind, summary });

describe("outcomeProgress", () => {
  const rows = [
    row("2026-11-05T10:00:00Z", "acuity-crowded-unlimited", { logMAR: 0.3 }),
    row("2026-11-05T10:20:00Z", "contrast", { logCS2: 1.5, logCS4: 1.7, logCS6: null }),
    row("2026-11-05T11:00:00Z", "acuity-crowded-unlimited", { logMAR: 0.28, testRun: "auto" }),
    row("2026-11-20T09:00:00Z", "acuity-crowded-unlimited", { logMAR: 0.32 }),
    row("2026-11-20T09:10:00Z", "acuity-crowded-unlimited", { logMAR: 0.22 }),
    row("2026-11-20T09:30:00Z", "reading", { maxReadingSpeedWpm: 160 }),
  ];
  const p = outcomeProgress(rows);

  it("one x position per test day, test runs excluded, last result of a day counts", () => {
    expect(p.days).toEqual(["2026-11-05", "2026-11-20"]);
    expect(p.acuity).toHaveLength(1);
    expect(p.acuity[0].points).toEqual([{ x: 0, y: 0.3 }, { x: 1, y: 0.22 }]);
  });

  it("series without data are dropped; missing values stay null", () => {
    expect(p.reading[0].points).toEqual([{ x: 1, y: 160 }]);
    expect(p.contrast.map((s) => s.label)).toEqual(["2 cpd", "4 cpd"]);
  });

  it("charts render, inverted for logMAR", () => {
    const svg = valueChartSvg(p.acuity, { yLabel: "logMAR", xLabels: p.days, invertY: true, title: "Near acuity" });
    expect(svg).toContain("<polyline");
    expect(svg).toContain("2026-11-20");
    // inverted: the better (lower) 0.22 is drawn above (smaller y) the 0.3
    const cy = [...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(cy[1]).toBeLessThan(cy[0]);
    expect(valueChartSvg([], { yLabel: "x", xLabels: [] })).toContain("No data yet");
  });
});
