import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng";
import {
  AcuityProcedure,
  CHART_LOGMAR,
  MIN_LETTER_HEIGHT_PX,
  availableLines,
  crowdedLineWidthPx,
  letterHeightMm,
  letterHeightPx,
  mUnits,
  scoreAcuity,
  timedFrames,
  type AcuityLine,
} from "./acuity";
import { OPTOTYPE_PATHS, SLOAN_LETTERS, randomLetters, type SloanLetter } from "./optotypes";

const line = (logMAR: number, correct: number): AcuityLine => ({ logMAR, letters: [], responses: [], correct });

/** Drives a procedure with an observer that answers each letter correctly with probability p(logMAR). */
function run(proc: AcuityProcedure, pCorrect: (L: number) => number, rand: () => number) {
  for (let guard = 0; guard < 50 && !proc.done; guard++) {
    const cur = proc.current()!;
    const responses = cur.letters.map((l) => (rand() < pCorrect(cur.logMAR) ? l : "?"));
    proc.answer(responses);
  }
  expect(proc.done).toBe(true);
  return proc.result();
}

describe("optotypes", () => {
  it("has the 10 Sloan letters as stroke paths with only M/L/H/V/A/Z commands and bounded coordinates", () => {
    expect(SLOAN_LETTERS).toHaveLength(10);
    for (const l of SLOAN_LETTERS) {
      const d = OPTOTYPE_PATHS[l];
      expect(d).toMatch(/^M/);
      expect(d.replace(/[-\d.\s]/g, "")).toMatch(/^[MLHVAZ]+$/);
      for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) expect(Math.abs(n)).toBeLessThanOrEqual(6);
    }
  });

  it("randomLetters: distinct, seeded, avoids same-position repeats", () => {
    const a = randomLetters(5, mulberry32(7));
    expect(new Set(a).size).toBe(5);
    expect(randomLetters(5, mulberry32(7))).toEqual(a);
    const rand = mulberry32(3);
    let prev: SloanLetter[] = [];
    for (let i = 0; i < 200; i++) {
      const cur = randomLetters(5, rand, prev);
      cur.forEach((l, k) => expect(l).not.toBe(prev[k]));
      prev = cur;
    }
    expect(() => randomLetters(11, rand)).toThrow();
  });
});

describe("acuity geometry", () => {
  it("letter height is 5 MAR: logMAR 0 at 40 cm ≈ 0.582 mm; 1 M ≈ logMAR 0.4 at 40 cm", () => {
    expect(letterHeightMm(0, 400)).toBeCloseTo(0.5818, 3);
    expect(letterHeightMm(1, 400)).toBeCloseTo(5.818, 2);
    expect(mUnits(0.4, 0.4)).toBeCloseTo(1.0, 1);
    expect(letterHeightPx(0, 400, 16)).toBeCloseTo(0.5818 * 16, 2);
  });

  it("chart lines run +1.0 … −0.3 in 0.1 steps", () => {
    expect(CHART_LOGMAR[0]).toBe(1);
    expect(CHART_LOGMAR[CHART_LOGMAR.length - 1]).toBe(-0.3);
    expect(CHART_LOGMAR).toHaveLength(14);
  });

  it("availableLines drops lines that are too small or do not fit", () => {
    const pxPerMm = 16.5; // Galaxy S24-like
    const crowded = availableLines(400, pxPerMm, 2340, 1080, "crowded");
    for (const L of crowded) {
      const h = letterHeightPx(L, 400, pxPerMm);
      expect(h).toBeGreaterThanOrEqual(MIN_LETTER_HEIGHT_PX);
      expect(crowdedLineWidthPx(h)).toBeLessThanOrEqual(2340);
    }
    expect(crowded).toContain(1);
    expect(crowded).not.toContain(-0.3); // 0.29 mm × 16.5 = 4.8 px < 5
    // A narrow screen loses the largest crowded lines but keeps them uncrowded.
    const narrow = availableLines(400, pxPerMm, 600, 1080, "crowded");
    expect(narrow).not.toContain(1);
    expect(availableLines(400, pxPerMm, 600, 1080, "uncrowded")).toContain(1);
  });
});

describe("scoreAcuity (per-letter logMAR)", () => {
  it("largest tested line + 0.1 − 0.02 per correct letter", () => {
    const r = scoreAcuity([line(0.7, 5), line(0.6, 5), line(0.5, 4), line(0.4, 2)], CHART_LOGMAR);
    expect(r.lettersCorrect).toBe(16);
    expect(r.logMAR).toBeCloseTo(0.48, 10);
    expect(r.topTested).toBe(0.7);
  });

  it("every letter counts 0.02: one more correct letter improves the score by 0.02", () => {
    const a = scoreAcuity([line(0.3, 5), line(0.2, 3)], CHART_LOGMAR).logMAR;
    const b = scoreAcuity([line(0.3, 5), line(0.2, 4)], CHART_LOGMAR).logMAR;
    expect(a - b).toBeCloseTo(0.02, 10);
  });

  it("rejects non-contiguous lines and flags floor/ceiling", () => {
    expect(() => scoreAcuity([line(0.5, 5), line(0.3, 5)], CHART_LOGMAR)).toThrow();
    const avail = [0.3, 0.2, 0.1];
    expect(scoreAcuity([line(0.3, 5), line(0.2, 5), line(0.1, 5)], avail).atFloor).toBe(true);
    expect(scoreAcuity([line(0.3, 1)], avail).atCeiling).toBe(true);
  });
});

describe("AcuityProcedure", () => {
  it("a deterministic observer with acuity 0.3 scores exactly 0.3", () => {
    const r = run(new AcuityProcedure(CHART_LOGMAR, mulberry32(1)), (L) => (L >= 0.3 - 1e-9 ? 1 : 0), mulberry32(2));
    expect(r.logMAR).toBeCloseTo(0.3, 10);
    expect(r.lines.map((l) => l.logMAR)).toEqual([0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
  });

  it("goes up from the start line until a line is passed, then stops below a failed line", () => {
    const r = run(new AcuityProcedure(CHART_LOGMAR, mulberry32(1), 0.7), (L) => (L >= 0.9 - 1e-9 ? 1 : 0), mulberry32(2));
    expect(r.lines.map((l) => l.logMAR)).toEqual([0.9, 0.8, 0.7]);
    expect(r.logMAR).toBeCloseTo(0.9, 10);
  });

  it("start line passed with 2 errors: continues down", () => {
    const proc = new AcuityProcedure(CHART_LOGMAR, mulberry32(5), 0.5);
    const first = proc.current()!;
    proc.answer(first.letters.map((l, i) => (i < 3 ? l : "?"))); // 3 correct < 4: go up
    expect(proc.current()!.logMAR).toBe(0.6);
    const second = proc.current()!;
    proc.answer(second.letters); // passed; lowest tested (0.5) had 2 errors → continue at 0.4
    expect(proc.current()!.logMAR).toBe(0.4);
  });

  it("stops at the smallest available line and flags the floor", () => {
    const avail = [0.5, 0.4, 0.3];
    const r = run(new AcuityProcedure(avail, mulberry32(1), 0.7), () => 1, mulberry32(2));
    expect(r.lines.map((l) => l.logMAR)).toEqual([0.5, 0.4, 0.3]);
    expect(r.atFloor).toBe(true);
  });

  // Per-letter scoring credits a line as fully read at its own size, so for a smooth psychometric
  // function it estimates the 50 %-correct size + 0.05 (half a line); a step observer at 0.3 scores 0.3.
  it("probabilistic observer: score ≈ 50 %-correct size + half a line (200 seeded runs)", () => {
    // p(correct letter) rises from the 10 % guess rate to 1 around `trueL` with a 0.05 logMAR slope.
    const trueL = 0.25;
    const p = (L: number) => 0.1 + 0.9 / (1 + Math.exp(-(L - trueL) / 0.04));
    const scores: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      scores.push(run(new AcuityProcedure(CHART_LOGMAR, mulberry32(seed)), p, mulberry32(seed + 10_000)).logMAR);
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (scores.length - 1));
    const l50 = trueL - 0.04 * Math.log(0.9 / 0.4 - 1); // p(l50) = 0.5
    console.log(`acuity sim: mean ${mean.toFixed(3)} sd ${sd.toFixed(3)}, 50 % size ${l50.toFixed(3)}`);
    expect(Math.abs(mean - (l50 + 0.05))).toBeLessThan(0.03);
    expect(sd).toBeLessThan(0.08);
  });

  it("redraw changes the letters, not the line", () => {
    const proc = new AcuityProcedure(CHART_LOGMAR, mulberry32(9));
    const a = proc.current()!;
    proc.redraw();
    const b = proc.current()!;
    expect(b.logMAR).toBe(a.logMAR);
    expect(b.letters).not.toEqual(a.letters);
  });
});

describe("timedFrames", () => {
  it("300 ms fixation then 250 ms of letters, in whole frames", () => {
    const f = timedFrames(60);
    expect(f.filter((x) => x.showFixation)).toHaveLength(18);
    expect(f.filter((x) => x.showTarget)).toHaveLength(15);
    expect(f.findIndex((x) => x.showTarget)).toBe(18);
    expect(timedFrames(120).filter((x) => x.showTarget)).toHaveLength(30);
  });
});
