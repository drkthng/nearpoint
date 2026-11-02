import { describe, expect, it } from "vitest";
import { formatContrastPct, pastThresholds, summarizeBlock } from "./results";
import type { SessionRecord } from "./curriculum";

const sess = (cpd: number, blocks: { condition: string; threshold: number | null }[]) =>
  ({ params: { cpd, thetaDeg: 0 }, blocks }) as unknown as SessionRecord;

describe("results", () => {
  it("pastThresholds filters", () => {
    const h = [
      sess(4, [{ condition: "LM", threshold: 0.05 }, { condition: "SINGLE", threshold: 0.01 }]),
      sess(6, [{ condition: "LM", threshold: 0.09 }]),
      sess(4, [{ condition: "LM", threshold: null }, { condition: "LM", threshold: 0.03 }]),
    ];
    expect(pastThresholds(h, "LM", 4)).toEqual([0.05, 0.03]);
  });
  it("summarizeBlock", () => {
    const s = summarizeBlock(0.02, [0.04, 0.03, 0.05]);
    expect(s.pastMedian).toBe(0.04);
    expect(s.relativeIndexPct).toBeCloseTo(50, 9);
    expect(s.pastCount).toBe(3);
    expect(summarizeBlock(0.02, [0.03, 0.05, 0.04, 0.01]).pastMedian).toBeCloseTo(0.035, 12);
    expect(summarizeBlock(0.02, [])).toEqual({ threshold: 0.02, pastMedian: null, pastCount: 0, relativeIndexPct: null });
    expect(summarizeBlock(null, [0.1]).relativeIndexPct).toBeNull();
  });
  it("formatContrastPct", () => {
    expect(formatContrastPct(0.0043)).toBe("0.43 %");
    expect(formatContrastPct(0.043)).toBe("4.3 %");
    expect(formatContrastPct(0.12)).toBe("12.0 %");
    expect(formatContrastPct(null)).toBe("–");
  });
});
