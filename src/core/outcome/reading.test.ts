import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng";
import {
  READING_LOGMAR,
  SENTENCES,
  WORDS_PER_SENTENCE,
  criticalPrintSize,
  readingShouldStop,
  readingSpeedWpm,
  scoreReading,
  sentenceOrder,
  wordCount,
  wrapWords,
  type ReadingTrial,
} from "./reading";

const trial = (logMAR: number, wpm: number | null, errors = 0): ReadingTrial => ({
  logMAR,
  sentence: "",
  words: WORDS_PER_SENTENCE,
  ms: wpm === null ? null : ((WORDS_PER_SENTENCE - errors) * 60000) / wpm,
  errors: wpm === null ? WORDS_PER_SENTENCE : errors,
  unreadable: wpm === null,
  wpm,
});

describe("reading material", () => {
  it("every sentence has exactly 10 words, lower case, no punctuation, all distinct", () => {
    expect(SENTENCES.length).toBeGreaterThanOrEqual(READING_LOGMAR.length);
    for (const s of SENTENCES) {
      expect(wordCount(s)).toBe(WORDS_PER_SENTENCE);
      expect(s).toMatch(/^[a-z ]+$/);
    }
    expect(new Set(SENTENCES).size).toBe(SENTENCES.length);
  });

  it("sentenceOrder is a seeded permutation", () => {
    const o = sentenceOrder(mulberry32(4));
    expect([...o].sort((a, b) => a - b)).toEqual(SENTENCES.map((_, i) => i));
    expect(sentenceOrder(mulberry32(4))).toEqual(o);
  });
});

describe("wrapWords", () => {
  const measure = (s: string) => s.length; // 1 unit per character
  it("greedy wrap within the width", () => {
    expect(wrapWords("aa bb cc dd", 5, measure)).toEqual(["aa bb", "cc dd"]);
    expect(wrapWords("aa bb cc", 100, measure)).toEqual(["aa bb cc"]);
  });
  it("null when one word is too wide", () => {
    expect(wrapWords("aaaaaa b", 5, measure)).toBeNull();
  });
});

describe("reading speed", () => {
  it("wpm counts only correctly read words", () => {
    expect(readingSpeedWpm(10, 0, 6000)).toBeCloseTo(100, 10);
    expect(readingSpeedWpm(10, 2, 6000)).toBeCloseTo(80, 10);
    expect(readingSpeedWpm(10, 12, 6000)).toBe(0);
    expect(() => readingSpeedWpm(10, 0, 0)).toThrow();
  });

  it("CPS at the knee of a plateau-then-drop curve; MRS = plateau mean", () => {
    const trials = [trial(1.0, 150), trial(0.9, 160), trial(0.8, 155), trial(0.7, 150), trial(0.6, 140), trial(0.5, 100), trial(0.4, 50)];
    const { cps, mrs } = criticalPrintSize(trials);
    expect(cps).toBe(0.6);
    expect(mrs).toBeCloseTo((150 + 160 + 155 + 150 + 140) / 5, 10);
  });

  it("unreadable sentences end the CPS search", () => {
    const { cps } = criticalPrintSize([trial(0.5, 120), trial(0.4, 118), trial(0.3, null)]);
    expect(cps).toBe(0.4);
    expect(criticalPrintSize([trial(0.5, null)])).toEqual({ cps: null, mrs: null });
  });

  it("reading acuity = largest size + 0.1 − 0.01 per word read correctly (MNREAD)", () => {
    // 1.0 … 0.5 read without errors (6 sentences = 60 words), 0.4 with 4 errors, 0.3 unreadable.
    const trials = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5].map((L) => trial(L, 150));
    trials.push(trial(0.4, 80, 4), trial(0.3, null));
    const r = scoreReading(trials);
    expect(r.readingAcuity).toBeCloseTo(1.1 - 0.01 * 66, 10);
    expect(r.criticalPrintSize).toBe(0.5);
    expect(r.maxReadingSpeed).toBeCloseTo(150, 10);
  });

  it("stop rule: unreadable or ≥ 5 errors", () => {
    expect(readingShouldStop(trial(0.4, null))).toBe(true);
    expect(readingShouldStop(trial(0.4, 60, 5))).toBe(true);
    expect(readingShouldStop(trial(0.4, 60, 4))).toBe(false);
  });
});
