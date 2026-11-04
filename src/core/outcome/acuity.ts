/**
 * Near letter acuity (outcome test). Pure logic: sizes, line sequence, per-letter logMAR scoring.
 * Separate from training code (CLAUDE.md non-negotiable 6): imports nothing from the training engine.
 */
import { framesFor, mmPerDegree } from "../geometry";
import type { FrameSpec } from "../trial";
import { randomLetters, type SloanLetter } from "./optotypes";

export const LETTERS_PER_LINE = 5;
export const LOGMAR_STEP = 0.1;
/** Chart lines from +1.0 down to −0.3 logMAR in 0.1 steps. */
export const CHART_LOGMAR: readonly number[] = Array.from({ length: 14 }, (_, i) => round1(1.0 - i * LOGMAR_STEP));
/** Credit per correct letter (0.1 logMAR / 5 letters). */
export const PER_LETTER = LOGMAR_STEP / LETTERS_PER_LINE;
/** A line counts as "read" (for the start search) with at least this many correct. */
export const LINE_PASS = 4;
/** Testing stops after a line with at least this many errors. */
export const LINE_STOP_ERRORS = 3;
/** Smallest letter height drawn on screen, in device px (1 px stroke). Smaller lines are not offered. */
export const MIN_LETTER_HEIGHT_PX = 5;
/** Time-limited presentation (our choice, see docs/protocol.md). */
export const TIMED_PRESENTATION_MS = 250;

/** Fixation mark shown before a time-limited presentation (our choice). */
export const TIMED_FIXATION_MS = 300;

/**
 * Time-limited presentation in whole frames: fixation cross, then the letters for
 * TIMED_PRESENTATION_MS; the caller's end-of-playback draw removes them.
 */
export function timedFrames(hz: number): FrameSpec[] {
  const out: FrameSpec[] = [];
  for (let i = 0; i < framesFor(TIMED_FIXATION_MS, hz); i++) out.push({ phase: "fixation", interval: 0, showTarget: false, showFlankers: false, showFixation: true });
  for (let i = 0; i < framesFor(TIMED_PRESENTATION_MS, hz); i++) out.push({ phase: "stim", interval: 1, showTarget: true, showFlankers: false, showFixation: false });
  return out;
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function marArcmin(logMAR: number): number {
  return 10 ** logMAR;
}

/** Physical size (mm) of an angle in arcmin at a distance (mm), via the shared geometry (mmPerDegree). */
export function mmForArcmin(arcmin: number, distanceMm: number): number {
  return (arcmin / 60) * mmPerDegree(distanceMm);
}

/** Letter height (= 5 × MAR) in mm at the viewing distance. */
export function letterHeightMm(logMAR: number, distanceMm: number): number {
  return mmForArcmin(5 * marArcmin(logMAR), distanceMm);
}

export function letterHeightPx(logMAR: number, distanceMm: number, pxPerMm: number): number {
  return letterHeightMm(logMAR, distanceMm) * pxPerMm;
}

/** M-units (print size) of a letter whose height is 5 × MAR at the given distance in metres. */
export function mUnits(logMAR: number, distanceM: number): number {
  return distanceM * marArcmin(logMAR);
}

/** Snellen-equivalent denominator for 20/x. */
export function snellen20(logMAR: number): number {
  return 20 * marArcmin(logMAR);
}

export type Crowding = "crowded" | "uncrowded";
export type Presentation = "unlimited" | "timed";

/** Width (device px) of a crowded line: 5 letters with 1-letter gaps (edge to edge), as on ETDRS charts. */
export function crowdedLineWidthPx(heightPx: number): number {
  return heightPx * (2 * LETTERS_PER_LINE - 1);
}

/**
 * Chart lines that can be drawn on this screen: letter height ≥ MIN_LETTER_HEIGHT_PX and the line
 * (crowded) or the letter (uncrowded) fits within maxWidthPx × maxHeightPx.
 */
export function availableLines(
  distanceMm: number,
  pxPerMm: number,
  maxWidthPx: number,
  maxHeightPx: number,
  crowding: Crowding,
): number[] {
  return CHART_LOGMAR.filter((L) => {
    const hpx = letterHeightPx(L, distanceMm, pxPerMm);
    const w = crowding === "crowded" ? crowdedLineWidthPx(hpx) : hpx;
    return hpx >= MIN_LETTER_HEIGHT_PX && w <= maxWidthPx && hpx <= maxHeightPx;
  });
}

export interface AcuityLine {
  logMAR: number;
  letters: SloanLetter[];
  /** One response per letter; "?" (or any non-letter) counts as wrong. */
  responses: string[];
  correct: number;
}

export interface AcuityResult {
  /** Per-letter score: largest tested line + 0.1 − 0.02 × letters correct on the tested lines. */
  logMAR: number;
  lettersCorrect: number;
  lines: AcuityLine[];
  /** Largest line tested. */
  topTested: number;
  /** All letters on the smallest available line correct: the true acuity may be better. */
  atFloor: boolean;
  /** The largest available line was failed: the true acuity may be worse. */
  atCeiling: boolean;
}

export function countCorrect(letters: readonly string[], responses: readonly string[]): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) if (responses[i] === letters[i]) n++;
  return n;
}

/**
 * Per-letter logMAR from contiguous tested lines (largest first). Lines above the largest tested
 * line are credited as read (the start rule only leaves them untested after a passed line);
 * lines below the last tested line count as 0 correct.
 */
export function scoreAcuity(lines: readonly AcuityLine[], available: readonly number[]): AcuityResult {
  if (lines.length === 0) throw new Error("no lines tested");
  const sorted = [...lines].sort((a, b) => b.logMAR - a.logMAR);
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i - 1].logMAR - sorted[i].logMAR - LOGMAR_STEP) > 1e-9) throw new Error("tested lines must be contiguous");
  }
  const topTested = sorted[0].logMAR;
  const lettersCorrect = sorted.reduce((a, l) => a + l.correct, 0);
  const logMAR = round2(topTested + LOGMAR_STEP - PER_LETTER * lettersCorrect);
  const smallest = Math.min(...available);
  const largest = Math.max(...available);
  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  return {
    logMAR,
    lettersCorrect,
    lines: sorted,
    topTested,
    atFloor: Math.abs(last.logMAR - smallest) < 1e-9 && last.correct === LETTERS_PER_LINE,
    atCeiling: Math.abs(first.logMAR - largest) < 1e-9 && first.correct < LINE_PASS,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Line sequence. Start at `startLogMAR` (or the nearest available below it). While the first tested
 * line is not passed (< 4 correct), go up one line at a time; then go down from below the lowest
 * tested line until a line with ≥ 3 errors or the smallest line.
 */
export class AcuityProcedure {
  private readonly tested = new Map<number, AcuityLine>();
  private phase: "up" | "down" = "up";
  private cur: number | null;
  private currentLetters: SloanLetter[] = [];
  private prevLetters: SloanLetter[] = [];

  constructor(
    readonly available: readonly number[],
    private readonly rand: () => number,
    startLogMAR = 0.7,
  ) {
    if (available.length === 0) throw new Error("no chart lines fit this screen");
    const desc = [...available].sort((a, b) => b - a);
    this.available = desc;
    const start = desc.find((L) => L <= startLogMAR + 1e-9) ?? desc[desc.length - 1];
    this.cur = start;
    this.draw();
  }

  private draw(): void {
    this.currentLetters = randomLetters(LETTERS_PER_LINE, this.rand, this.prevLetters);
  }

  get done(): boolean {
    return this.cur === null;
  }

  /** The line to show next, or null when finished. */
  current(): { logMAR: number; letters: SloanLetter[] } | null {
    return this.cur === null ? null : { logMAR: this.cur, letters: [...this.currentLetters] };
  }

  /** New letters for the current line (e.g. after a timing-invalid presentation). */
  redraw(): void {
    if (this.cur !== null) this.draw();
  }

  /** Replace the current line's letters (e.g. single letters re-drawn after a timing glitch). */
  overrideLetters(letters: readonly SloanLetter[]): void {
    if (this.cur === null) throw new Error("procedure finished");
    if (letters.length !== LETTERS_PER_LINE) throw new Error(`need ${LETTERS_PER_LINE} letters`);
    this.currentLetters = [...letters];
  }

  answer(responses: readonly string[]): void {
    if (this.cur === null) throw new Error("procedure finished");
    if (responses.length !== LETTERS_PER_LINE) throw new Error(`need ${LETTERS_PER_LINE} responses`);
    const L = this.cur;
    const correct = countCorrect(this.currentLetters, responses);
    this.tested.set(L, { logMAR: L, letters: [...this.currentLetters], responses: [...responses], correct });
    this.prevLetters = this.currentLetters;

    const idx = this.available.findIndex((x) => Math.abs(x - L) < 1e-9);
    if (this.phase === "up") {
      if (correct < LINE_PASS && idx > 0) {
        this.cur = this.available[idx - 1];
        this.draw();
        return;
      }
      this.phase = "down";
      // Continue below the lowest line tested so far.
      const lowest = Math.min(...this.tested.keys());
      const li = this.available.findIndex((x) => Math.abs(x - lowest) < 1e-9);
      const lowestLine = this.tested.get(lowest)!;
      if (LETTERS_PER_LINE - lowestLine.correct >= LINE_STOP_ERRORS || li === this.available.length - 1) {
        this.cur = null;
        return;
      }
      this.cur = this.available[li + 1];
      this.draw();
      return;
    }
    if (LETTERS_PER_LINE - correct >= LINE_STOP_ERRORS || idx === this.available.length - 1) {
      this.cur = null;
      return;
    }
    this.cur = this.available[idx + 1];
    this.draw();
  }

  result(): AcuityResult {
    return scoreAcuity([...this.tested.values()], this.available);
  }
}
