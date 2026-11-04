import { describe, expect, it } from "vitest";
import { OUTCOME_EVERY, daysSinceLast, outcomeDue } from "./schedule";

const day = (d: number) => new Date(Date.UTC(2026, 10, 1 + d, 12)).toISOString();

describe("outcomeDue", () => {
  it("baseline before the first session", () => {
    expect(outcomeDue([], []).due).toBe(true);
    expect(outcomeDue([], []).reason).toMatch(/Baseline/);
  });
  it("not due right after the tests; due after every 10 sessions", () => {
    const tests = [day(0)];
    const s9 = Array.from({ length: OUTCOME_EVERY - 1 }, (_, i) => day(i + 1));
    expect(outcomeDue(s9, tests)).toEqual({ due: false, reason: "Next outcome tests after 1 more session." });
    expect(outcomeDue([...s9, day(20)], tests).due).toBe(true);
    // re-tested after session 10: not due again
    expect(outcomeDue([...s9, day(20)], [...tests, day(21)]).due).toBe(false);
  });
  it("final tests when the program is complete", () => {
    expect(outcomeDue([day(1), day(2)], [day(0)], true).reason).toMatch(/final/);
    expect(outcomeDue([day(1)], [day(2)], true).due).toBe(false);
  });
  it("sessions run before any test still ask for tests", () => {
    expect(outcomeDue([day(1)], []).reason).toMatch(/No outcome tests yet/);
  });
});

describe("daysSinceLast", () => {
  it("whole days since the last session", () => {
    expect(daysSinceLast([], day(3))).toBeNull();
    expect(daysSinceLast([day(1), day(0)], day(3))).toBe(2);
  });
});
