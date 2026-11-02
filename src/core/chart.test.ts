import { describe, expect, it } from "vitest";
import { thresholdChartSvg, type ChartSeries } from "./chart";

const S: ChartSeries[] = [
  { label: "A&B", points: [{ x: 1, y: 0.05 }, { x: 2, y: null }, { x: 3, y: 0.02 }, { x: 4, y: 0.012 }] },
  { label: "<LM>", points: [{ x: 1, y: 0.2 }, { x: 2, y: 0.1 }] },
];

describe("thresholdChartSvg", () => {
  const svg = thresholdChartSvg(S, { title: "T'\"" });
  it("structure", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    expect(svg.match(/<circle/g)).toHaveLength(5);
    expect(svg).toContain(">1.0 %<");
    expect(svg).toContain('viewBox="0 0 640 320"');
  });
  it("escapes", () => {
    expect(svg).toContain("A&amp;B");
    expect(svg).toContain("&lt;LM&gt;");
    expect(svg).toContain("T&#39;&quot;");
  });
  it("empty and all-null", () => {
    expect(thresholdChartSvg([])).toContain("No data yet");
    expect(thresholdChartSvg([{ label: "x", points: [{ x: 1, y: null }] }])).toContain("No data yet");
  });
  it("xLabelOffset shifts axis labels only", () => {
    const pts = [{ label: "x", points: [{ x: 3, y: 0.03 }] }];
    const plain = thresholdChartSvg(pts);
    const shifted = thresholdChartSvg(pts, { xLabelOffset: 1 });
    expect(plain).toContain(">3</text>");
    expect(shifted).toContain(">4</text>");
    expect(shifted).not.toContain(">3</text>");
    expect(shifted.replace(">4</text>", ">3</text>")).toBe(plain);
  });
  it("single point and determinism", () => {
    const one = thresholdChartSvg([{ label: "x", points: [{ x: 3, y: 0.03 }] }]);
    expect(one).not.toContain("<polyline");
    expect(one).not.toContain("NaN");
    expect(thresholdChartSvg(S)).toBe(thresholdChartSvg(S));
  });
});
