import { describe, expect, it } from "vitest";
import { letterHeightMm } from "./acuity";
import { PAPER_LOGMAR, chartLetters, nearChartSvg, snellenLabel } from "./near-chart";

describe("near chart", () => {
  it("two different, reproducible letter orders", () => {
    expect(chartLetters("A")).toEqual(chartLetters("A"));
    expect(chartLetters("A")).not.toEqual(chartLetters("B"));
    for (const line of chartLetters("B")) expect(new Set(line).size).toBe(5);
  });

  it("A4 SVG in mm with 5 letters per line at the right size", () => {
    const svg = nearChartSvg({ order: "A", distanceCm: 40 });
    expect(svg).toContain('width="210mm" height="297mm"');
    const uses = [...svg.matchAll(/<use href="#L([A-Z])"[^>]*width="([\d.]+)"/g)];
    expect(uses).toHaveLength(PAPER_LOGMAR.length * 5);
    expect(Number(uses[0][2])).toBeCloseTo(letterHeightMm(1.0, 400), 2);
    expect(Number(uses[uses.length - 1][2])).toBeCloseTo(letterHeightMm(-0.2, 400), 2);
    const letters = uses.slice(0, 5).map((u) => u[1]);
    expect(letters).toEqual(chartLetters("A")[0]);
    expect(svg).toContain("not a medical device");
  });

  it("letter sizes scale with distance", () => {
    const svg = nearChartSvg({ order: "B", distanceCm: 50 });
    const first = svg.match(/<use href="#L[A-Z]"[^>]*width="([\d.]+)"/)!;
    expect(Number(first[1])).toBeCloseTo(letterHeightMm(1.0, 500), 2);
    expect(() => nearChartSvg({ order: "A", distanceCm: 5 })).toThrow();
  });

  it("conventional Snellen labels", () => {
    expect(snellenLabel(1.0)).toBe("200");
    expect(snellenLabel(0.9)).toBe("160");
    expect(snellenLabel(0)).toBe("20");
    expect(snellenLabel(-0.2)).toBe("12.5");
  });
});
