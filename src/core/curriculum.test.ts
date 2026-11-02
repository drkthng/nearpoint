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
    const mk = (xs: number[], cpd = 4) => xs.map((x) => rec(cpd, 0, x));
    // flat
    expect(isPlateau(mk(Array(8).fill(0.08)), 4)).toBe(true);
    // steady 2 %/session decline: window difference = 4 * log10(1/0.98) ~ 0.035 > margin
    expect(isPlateau(mk(Array.from({ length: 8 }, (_, i) => 0.08 * 0.98 ** i)), 4)).toBe(false);
    // fewer than 2k scored sessions
    expect(isPlateau(mk(Array(7).fill(0.08)), 4)).toBe(false);
    // earlier cpd ignored
    expect(isPlateau([...mk([0.5, 0.4, 0.3, 0.2], 2), ...mk([0.08, 0.08, 0.08, 0.08], 3)], 4)).toBe(false);
    expect(isPlateau([...mk([0.5, 0.4, 0.3, 0.2], 2), ...mk(Array(8).fill(0.08), 3)], 4)).toBe(true);
    // null scores skipped: 7 scored + 1 null is not enough, 8 scored + nulls is
    const nul = (cpd = 4) => rec(cpd, 0, null);
    expect(isPlateau([...mk(Array(7).fill(0.08)), nul()], 4)).toBe(false);
    expect(isPlateau([nul(), ...mk(Array(4).fill(0.08)), nul(), ...mk(Array(4).fill(0.08))], 4)).toBe(true);
    expect(isPlateau([], 4)).toBe(false);
  });
  it("deep copy of block arrays", () => {
    const c = cur();
    const before = structuredClone(c);
    const p = plan(c, []);
    expect(p.blocks[1].sep_lambda).toBeDefined();
    p.blocks[1].sep_lambda!.push(99);
    p.blocks.forEach((b) => b.isi_ms?.push(99));
    expect(c).toEqual(before);
    expect(c.session_template[1].sep_lambda).not.toContain(99);
  });
  it("guard: one change per session needs rotation every >= 2", () => {
    const c = cur();
    c.progression.rotate_orientation_every_n_sessions = 1;
    expect(() => nextSession(c, [])).toThrow(/rotate_orientation_every_n_sessions must be >= 2/);
    c.progression.change_one_param_per_session = false;
    expect(() => nextSession(c, [])).not.toThrow();
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

type Entry = number | null;
const drive = (c: Curriculum, entries: Entry[]) => {
  const history: SessionRecord[] = [];
  const plans: SessionPlan[] = [];
  let stop: { at: number; reason: string } | null = null;
  for (const e of entries) {
    const r = nextSession(c, history);
    if (r.stop) { stop = { at: history.length, reason: r.reason }; break; }
    plans.push(r.plan);
    history.push({ params: r.plan.params, blocks: r.plan.blocks.map((b) => ({ condition: b.condition, threshold: e })) });
  }
  if (!stop) {
    const r = nextSession(c, history);
    if (r.stop) stop = { at: history.length, reason: r.reason };
  }
  return { plans, stop };
};
const entryArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 9, arbitrary: fc.oneof(fc.double({ min: 0.005, max: 0.049, noNaN: true }), fc.double({ min: 0.05, max: 0.3, noNaN: true })) },
);
const randomEntries = fc.array(entryArb, { minLength: 1, maxLength: 70 });
// steadily improving series (2-5 %/session) with occasional unscored sessions
const trendEntries = fc
  .tuple(fc.double({ min: 0.05, max: 0.3, noNaN: true }), fc.double({ min: 0.95, max: 0.99, noNaN: true }), fc.array(fc.boolean(), { minLength: 70, maxLength: 70 }))
  .map(([s0, rate, nulls]): Entry[] => nulls.map((isNull, i) => (isNull && i % 10 === 3 ? null : Math.max(0.005, s0 * rate ** i))));
const entriesArb = fc.oneof(randomEntries, trendEntries);
const progArb = fc
  .record({
    every: fc.constantFrom(2, 3),
    min: fc.constantFrom(5, 25),
    max: fc.constantFrom(30, 65),
  });
const cfg = { seed: 42, numRuns: 200 };

describe("curriculum properties", () => {
  it("P1 invariants", () => {
    const n = { rotations: 0, raises: 0, deferred: 0, plateauStops: 0, maxStops: 0 };
    fc.assert(
      fc.property(entriesArb, progArb, (entries, pr) => {
        const c = cur();
        c.progression.rotate_orientation_every_n_sessions = pr.every;
        c.progression.min_sessions = pr.min;
        c.progression.max_sessions = pr.max;
        const { plans, stop } = drive(c, entries);
        expect(plans.length).toBeLessThanOrEqual(pr.max);
        if (stop?.reason === "plateau") {
          expect(stop.at).toBeGreaterThanOrEqual(pr.min);
          n.plateauStops++;
        }
        if (stop?.reason === "max_sessions reached") {
          expect(stop.at).toBe(pr.max);
          n.maxStops++;
        }
        if (plans.length === pr.max && stop) expect(stop.reason).toBe("max_sessions reached");
        plans.forEach((p, i) => {
          expect(CPD_LADDER).toContain(p.params.cpd);
          expect(p.params.cpd).toBeGreaterThanOrEqual(2);
          expect(p.params.cpd).toBeLessThanOrEqual(8);
          expect(p.sessionIndex).toBe(i);
          if (i === 0) return;
          const a = plans[i - 1].params, b = p.params;
          expect(Number(a.cpd !== b.cpd) + Number(a.thetaDeg !== b.thetaDeg)).toBeLessThanOrEqual(1);
          expect(b.cpd).toBeGreaterThanOrEqual(a.cpd);
          if (b.cpd > a.cpd) { expect(b.cpd).toBe(nextCpd(a.cpd)); n.raises++; }
          if (b.thetaDeg !== a.thetaDeg) {
            expect(i % pr.every).toBe(0);
            expect(b.thetaDeg).toBe(nextOrientation(a.thetaDeg));
            n.rotations++;
          } else if (i % pr.every === 0) {
            expect(p.change).toBe("none");
          }
          const prev = entries[i - 1];
          if (i % pr.every === 0 && prev !== null && prev < 0.05 && a.cpd < 8) {
            n.deferred++;
            expect(b.cpd).toBe(a.cpd);
          }
        });
      }),
      cfg,
    );
    expect(n.rotations).toBeGreaterThan(0);
    expect(n.raises).toBeGreaterThan(0);
    expect(n.deferred).toBeGreaterThan(0);
    expect(n.plateauStops).toBeGreaterThan(0);
    expect(n.maxStops).toBeGreaterThan(0);
  });
  it("P2 orientation coverage", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0.005, max: 0.3, noNaN: true }), { minLength: 8, maxLength: 70 }), (scores) => {
        const { plans } = drive(cur(), scores);
        const seen = new Set(plans.slice(0, 8).map((p) => p.params.thetaDeg));
        expect(plans.length).toBeGreaterThanOrEqual(8);
        for (const t of ORIENTATION_CYCLE) expect(seen.has(t)).toBe(true);
      }),
      cfg,
    );
  });
});
