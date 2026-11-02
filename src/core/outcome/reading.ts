/**
 * Reading-speed test (outcome test): timed sentences at decreasing print size, MNREAD-style
 * scoring. Sentences are our own (MNREAD sentences are copyrighted). Pure logic.
 */
import { round1, letterHeightPx } from "./acuity";

export const WORDS_PER_SENTENCE = 10;
/** Print sizes (logMAR of the x-height, x-height = 5 × MAR) from +1.0 down to −0.2. */
export const READING_LOGMAR: readonly number[] = Array.from({ length: 13 }, (_, i) => round1(1.0 - i * 0.1));
/** Smallest x-height drawn, in device px. */
export const MIN_X_HEIGHT_PX = 4;
/** At most this many wrapped lines per sentence. */
export const MAX_LINES = 3;
/** Stop after a sentence with at least this many errors (or one marked unreadable). */
export const STOP_ERRORS = 5;
/** Critical print size: smallest size whose speed (and every larger size's) is ≥ this fraction of the plateau mean. */
export const CPS_FRACTION = 0.8;

/** Original 10-word sentences, plain vocabulary, similar length (42–59 characters). */
export const SENTENCES: readonly string[] = [
  "my brother likes to walk the dog along the river",
  "she found an old map hidden under the kitchen floor",
  "the children played in the garden until it was dark",
  "we bought fresh bread and cheese at the market today",
  "he left his keys on the table near the door",
  "the train was late again because of snow and ice",
  "a small bird built its nest in the old tree",
  "they painted the fence white and planted roses near it",
  "my aunt sends us a long letter every single year",
  "the old man sat on the bench and fed ducks",
  "please close the gate so that the sheep stay in",
  "we waited for the bus in the rain for hours",
  "the baker opens his shop very early every single day",
  "her cat sleeps all day in a warm spot inside",
  "the boat sailed slowly across the lake toward the shore",
  "our neighbours grow tomatoes and beans in their back garden",
];

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Greedy word wrap with an injected text measure; returns null if a word alone is too wide. */
export function wrapWords(text: string, maxWidth: number, measure: (s: string) => number): string[] | null {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (measure(w) > maxWidth) return null;
    const cand = line ? `${line} ${w}` : w;
    if (measure(cand) <= maxWidth) line = cand;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** x-height in device px for a print size. */
export function xHeightPx(logMAR: number, distanceMm: number, pxPerMm: number): number {
  return letterHeightPx(logMAR, distanceMm, pxPerMm);
}

/** Words per minute from words read correctly and the reading time. */
export function readingSpeedWpm(words: number, errors: number, ms: number): number {
  if (!(ms > 0)) throw new Error("reading time must be > 0");
  const correct = Math.max(0, words - errors);
  return (correct * 60000) / ms;
}

export interface ReadingTrial {
  logMAR: number;
  sentence: string;
  words: number;
  /** null if the sentence could not be read. */
  ms: number | null;
  errors: number;
  unreadable: boolean;
  /** null if unreadable. */
  wpm: number | null;
}

export interface ReadingResult {
  /** Reading acuity: largest size + 0.1 − 0.01 × words read correctly (MNREAD formula, generalised). */
  readingAcuity: number;
  /** Mean speed at sizes from the largest down to the CPS; null if no sentence was read. */
  maxReadingSpeed: number | null;
  /** Critical print size (logMAR); null if no sentence was read. */
  criticalPrintSize: number | null;
  trials: ReadingTrial[];
}

/**
 * CPS = smallest size s such that every read size ≥ s has speed ≥ CPS_FRACTION × (mean speed over
 * the sizes ≥ s); MRS = that mean. Sizes are scanned from the largest downwards over contiguous
 * readable sentences.
 */
export function criticalPrintSize(trials: readonly ReadingTrial[]): { cps: number | null; mrs: number | null } {
  const read = [...trials].sort((a, b) => b.logMAR - a.logMAR).filter((t) => !t.unreadable && t.wpm !== null && t.wpm > 0);
  let cps: number | null = null;
  let mrs: number | null = null;
  for (let k = 0; k < read.length; k++) {
    const sub = read.slice(0, k + 1);
    const mean = sub.reduce((a, t) => a + (t.wpm as number), 0) / sub.length;
    if (sub.every((t) => (t.wpm as number) >= CPS_FRACTION * mean)) {
      cps = read[k].logMAR;
      mrs = mean;
    } else break;
  }
  return { cps, mrs };
}

export function scoreReading(trials: readonly ReadingTrial[]): ReadingResult {
  if (trials.length === 0) throw new Error("no sentences tested");
  const sorted = [...trials].sort((a, b) => b.logMAR - a.logMAR);
  const top = sorted[0].logMAR;
  const perWord = 0.1 / WORDS_PER_SENTENCE;
  const wordsCorrect = sorted.reduce((a, t) => a + (t.unreadable ? 0 : Math.max(0, t.words - t.errors)), 0);
  const { cps, mrs } = criticalPrintSize(sorted);
  return {
    readingAcuity: Math.round((top + 0.1 - perWord * wordsCorrect) * 100) / 100,
    maxReadingSpeed: mrs === null ? null : Math.round(mrs * 10) / 10,
    criticalPrintSize: cps,
    trials: sorted,
  };
}

/** True when testing should stop after this trial. */
export function readingShouldStop(t: ReadingTrial): boolean {
  return t.unreadable || t.errors >= STOP_ERRORS;
}

/** Seeded order of sentence indices (Fisher–Yates). */
export function sentenceOrder(rand: () => number): number[] {
  const idx = SENTENCES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
