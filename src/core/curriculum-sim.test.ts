import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sessionScore } from "./curriculum";
import { DEFAULT_SIM_MODEL, observerAlpha, simulateProgram } from "./curriculum-sim";
import type { Curriculum } from "./protocol";

const c = JSON.parse(readFileSync("docs/curriculum.json", "utf8")) as Curriculum;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};
const runAll = (m = DEFAULT_SIM_MODEL) => SEEDS.map((s) => simulateProgram(c, m, s));
const withLearning = runAll();

describe("observerAlpha", () => {
  const m = DEFAULT_SIM_MODEL;
  it("follows the model", () => {
    expect(observerAlpha(m, 0, 4, 0, "SINGLE")).toBeCloseTo(0.06, 12);
    expect(observerAlpha(m, 10, 4, 0, "SINGLE")).toBeCloseTo(0.06 * 0.98 ** 10, 12);
    expect(observerAlpha(m, 0, 8, 0, "SINGLE")).toBeCloseTo(0.12, 12);
    expect(observerAlpha(m, 0, 4, 45, "SINGLE")).toBeCloseTo(0.066, 12);
  });
});

describe("simulateProgram", () => {
  it("is deterministic per seed", () => {
    const a = simulateProgram(c, DEFAULT_SIM_MODEL, 1);
    expect(simulateProgram(c, DEFAULT_SIM_MODEL, 1)).toEqual(a);
    expect(simulateProgram(c, DEFAULT_SIM_MODEL, 2)).not.toEqual(a);
  });

  it("produces plausible 25-40 session programs", () => {
    const lengths = withLearning.map((r) => r.plans.length);
    const finalCpd = withLearning.map((r) => r.plans[r.plans.length - 1].params.cpd);
    const reasons = withLearning.map((r) => r.stopReason);
    for (const n of lengths) {
      expect(n).toBeGreaterThanOrEqual(25);
      expect(n).toBeLessThanOrEqual(65);
    }
    const med = median(lengths);
    expect(med).toBeGreaterThanOrEqual(25);
    expect(med).toBeLessThanOrEqual(40);
    expect(lengths.filter((n) => n > 25).length).toBeGreaterThanOrEqual(10);
    const raised = withLearning.filter((r) => r.plans.some((p) => p.params.cpd > r.plans[0].params.cpd));
    expect(raised.length).toBeGreaterThanOrEqual(10);
    for (const r of withLearning) {
      expect(["plateau", "max_sessions reached"]).toContain(r.stopReason);
      for (let i = 1; i < r.plans.length; i++) {
        const a = r.plans[i - 1].params;
        const b = r.plans[i].params;
        expect(b.cpd).toBeGreaterThanOrEqual(a.cpd);
        expect(Number(a.cpd !== b.cpd) + Number(a.thetaDeg !== b.thetaDeg)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("shows learning within the initial cpd", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = withLearning[seed - 1];
      const cpd0 = r.plans[0].params.cpd;
      const idx = r.sessions.map((s, i) => (s.params.cpd === cpd0 ? i : -1)).filter((i) => i >= 0);
      if (idx.length < 6) continue;
      const lg = (i: number) => Math.log10(sessionScore(r.sessions[i])!);
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(mean(idx.slice(0, 3).map(lg))).toBeGreaterThan(mean(idx.slice(-3).map(lg)));
      return;
    }
    throw new Error("no seed stayed at the initial cpd for 6 sessions");
  });

  it("control: no improvement gives strictly shorter programs than with improvement", () => {
    const flat = runAll({ ...DEFAULT_SIM_MODEL, improvementPerSession: 0 });
    const lengths = flat.map((r) => r.plans.length);
    expect(median(lengths)).toBeLessThan(median(withLearning.map((r) => r.plans.length)));
  });
});
