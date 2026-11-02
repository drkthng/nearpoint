import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import {
  CPD_LADDER, ORIENTATION_CYCLE, isPlateau, nextCpd, nextOrientation, nextSession, sessionScore,
  type SessionRecord, type SessionPlan,
} from "./curriculum";
import type { Curriculum, Orientation } from "./protocol";

const cur = (): Curriculum => JSON.parse(readFileSync("docs/curriculum.json", "utf8"));
const rec = (cpd: number, theta: Orientation, ...ts: (number | null)[]): SessionRecord => ({
  params: { cpd, thetaDeg: theta },
  blocks: ts.map((threshold) => ({ condition: "SINGLE" as const, threshold })),
});
const plan = (c: Curriculum, h: SessionRecord[]): SessionPlan => {
  const r = nextSession(c, h);
  if (r.stop) throw new Error("unexpected stop: " + r.reason);
  return r.plan;
};
const hist = (n: number, score: number, cpd = 4): SessionRecord[] =>
  Array.from({ length: n }, () => rec(cpd, 0, score));

describe("curriculum unit", () => {
  it("first session", () => {
    const c = cur();
    const before = structuredClone(c);
    const p = plan(c, []);
    expect(p.params).toEqual({ cpd: 4, thetaDeg: 0 });
    expect(p.change).toBe("none");
    expect(p.blocks).toHaveLength(4);
    expect(p.blocks.every((b) => b.cpd === 4 && b.theta_deg === 0)).toBe(true);
    expect(c).toEqual(before);
  });
  it("rotation", () => {
    const c = cur();
    const p = plan(c, hist(2, 0.1));
    expect(p.params.thetaDeg).toBe(45);
    expect(p.change).toBe("orientation");
    expect(plan(c, hist(3, 0.1)).change).toBe("none");
    expect(nextOrientation(135)).toBe(0);
  });
  it("cpd raise", () => {
    const c = cur();
    const p = plan(c, hist(1, 0.04));
    expect(p.params.cpd).toBe(6);
    expect(p.change).toBe("cpd");
    expect(plan(c, hist(1, 0.05)).change).toBe("none");
    const p2 = plan(c, hist(2, 0.04));
    expect(p2.change).toBe("orientation");
    expect(p2.params.cpd).toBe(4);
    expect(plan(c, hist(3, 0.04)).change).toBe("cpd");
    expect(plan(c, hist(1, 0.04, 8)).change).toBe("none");
    expect([2, 3, 4, 6, 8].map(nextCpd)).toEqual([3, 4, 6, 8, 8]);
    expect(() => nextCpd(5)).toThrow();
  });
  it("both when not one-at-a-time", () => {
    const c = cur();
    c.progression.change_one_param_per_session = false;
    const p = plan(c, hist(2, 0.04));
    expect(p.change).toBe("orientation+cpd");
    expect(p.params).toEqual({ cpd: 6, thetaDeg: 45 });
  });
  it("sessionScore", () => {
    expect(sessionScore(rec(4, 0, 0.02, 0.08))).toBeCloseTo(0.04, 12);
    expect(sessionScore(rec(4, 0, null, 0.04, null))).toBeCloseTo(0.04, 12);
    expect(sessionScore(rec(4, 0, null, null))).toBeNull();
    expect(plan(cur(), [rec(4, 0, null, null)]).change).toBe("none");
  });
  it("plateau", () => {
    const mk = (xs: number[]) => xs.map((x) => rec(4, 0, x));
    expect(isPlateau(mk([0.1, 0.09, 0.08, 0.08, 0.08, 0.08, 0.08]), 4)).toBe(true);
    expect(isPlateau(mk([0.1, 0.09, 0.08, 0.08, 0.08, 0.08, 0.07]), 4)).toBe(false);
    expect(isPlateau(mk([0.1, 0.09, 0.08, 0.08, 0.08, 0.08, 0.0795]), 4)).toBe(true);
    expect(isPlateau(mk([0.1, 0.09, 0.08, 0.08, 0.08]), 4)).toBe(false);
    expect(isPlateau([rec(2, 0, 0.5), rec(2, 0, 0.4), ...mk([0.08, 0.08, 0.08, 0.08])], 4)).toBe(false);
  });
  it("stop rules", () => {
    const c = cur();
    const r = nextSession(c, hist(65, 0.1));
    expect(r).toMatchObject({ stop: true, reason: "max_sessions reached" });
    expect(nextSession(c, hist(24, 0.1)).stop).toBe(false);
    expect(nextSession(c, hist(25, 0.1))).toEqual({ stop: true, reason: "plateau", sessionsCompleted: 25 });
  });
  it("invalid curriculum", () => {
    const c = cur();
    c.session_template = [];
    expect(() => nextSession(c, [])).toThrow(/^invalid curriculum:/);
  });
});

const drive = (scores: number[]) => {
  const c = cur();
  const history: SessionRecord[] = [];
  const plans: SessionPlan[] = [];
  let stoppedAt: number | null = null;
  for (const s of scores) {
    const r = nextSession(c, history);
    if (r.stop) { stoppedAt = history.length; break; }
    plans.push(r.plan);
    history.push({ params: r.plan.params, blocks: r.plan.blocks.map((b) => ({ condition: b.condition, threshold: s })) });
  }
  return { plans, stoppedAt };
};
const scoresArb = (min: number) =>
  fc.array(fc.double({ min: 0.005, max: 0.3, noNaN: true }), { minLength: min, maxLength: 70 });
const cfg = { seed: 42, numRuns: 200 };

describe("curriculum properties", () => {
  it("P1 invariants", () => {
    fc.assert(
      fc.property(scoresArb(1), (scores) => {
        const { plans, stoppedAt } = drive(scores);
        expect(plans.length).toBeLessThanOrEqual(65);
        if (stoppedAt !== null) expect(stoppedAt).toBeGreaterThanOrEqual(25);
        plans.forEach((p, i) => {
          expect(CPD_LADDER).toContain(p.params.cpd);
          expect(p.sessionIndex).toBe(i);
          if (i === 0) return;
          const a = plans[i - 1].params, b = p.params;
          expect(Number(a.cpd !== b.cpd) + Number(a.thetaDeg !== b.thetaDeg)).toBeLessThanOrEqual(1);
          expect(b.cpd).toBeGreaterThanOrEqual(a.cpd);
          if (b.thetaDeg !== a.thetaDeg) {
            expect(i % 2).toBe(0);
            expect(b.thetaDeg).toBe(nextOrientation(a.thetaDeg));
          }
        });
      }),
      cfg,
    );
  });
  it("P2 orientation coverage", () => {
    fc.assert(
      fc.property(scoresArb(8), (scores) => {
        const { plans } = drive(scores);
        const seen = new Set(plans.slice(0, 8).map((p) => p.params.thetaDeg));
        expect(plans.length).toBeGreaterThanOrEqual(8);
        for (const t of ORIENTATION_CYCLE) expect(seen.has(t)).toBe(true);
      }),
      cfg,
    );
  });
});
