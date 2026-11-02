import type { Condition } from "./protocol";
import type { SessionRecord } from "./curriculum";

export interface BlockSummary {
  threshold: number | null;
  pastMedian: number | null;
  pastCount: number;
  relativeIndexPct: number | null;
}

export function pastThresholds(history: readonly SessionRecord[], condition: Condition, cpd: number): number[] {
  const out: number[] = [];
  for (const s of history) {
    if (s.params.cpd !== cpd) continue;
    for (const b of s.blocks) if (b.condition === condition && b.threshold !== null) out.push(b.threshold);
  }
  return out;
}

export function summarizeBlock(threshold: number | null, past: readonly number[]): BlockSummary {
  let pastMedian: number | null = null;
  if (past.length) {
    const s = [...past].sort((a, b) => a - b);
    const m = s.length;
    pastMedian = m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
  }
  const relativeIndexPct = threshold !== null && pastMedian !== null ? (1 - threshold / pastMedian) * 100 : null;
  return { threshold, pastMedian, pastCount: past.length, relativeIndexPct };
}

export function formatContrastPct(c: number | null): string {
  if (c === null) return "–";
  const p = c * 100;
  return p < 1 ? `${Number(p.toPrecision(2))} %` : `${p.toFixed(1)} %`;
}
