/**
 * Sloan-style optotypes drawn as our own SVG centre-line paths (no font, so no font licence).
 *
 * Each letter lives in a 5 × 5 unit box (letter height = 5 units = 5 × MAR, stroke width = 1 unit,
 * as in Sloan's design) with origin top-left and y down. The path is STROKED with width 1
 * (butt caps, miter joins) and CLIPPED to the box [0, 5] × [0, 5]; strokes may overshoot the box
 * so that the clip produces flat outer edges. These are approximations of Sloan's letters drawn
 * for this project, not a certified chart font.
 */
export const SLOAN_LETTERS = ["C", "D", "H", "K", "N", "O", "R", "S", "V", "Z"] as const;
export type SloanLetter = (typeof SLOAN_LETTERS)[number];

export const OPTOTYPE_BOX = 5;
export const OPTOTYPE_STROKE = 1;

export const OPTOTYPE_PATHS: Record<SloanLetter, string> = {
  // Ring of centre-line radius 2 with a 1-unit gap on the right.
  C: "M 4.436 2 A 2 2 0 1 0 4.436 3",
  D: "M 0.5 -0.5 V 0.5 H 2.5 A 2 2 0 0 1 2.5 4.5 H 0.5 Z",
  H: "M 0.5 -0.5 V 5.5 M 4.5 -0.5 V 5.5 M 0 2.5 H 5",
  K: "M 0.5 -0.5 V 5.5 M 5.2 -0.45 L 0.5 3.4 M 2.1 2.1 L 5.3 5.6",
  N: "M 0.5 -0.5 V 5.5 M 4.5 -0.5 V 5.5 M 0.5 -0.3 L 4.5 5.3",
  O: "M 0.5 2.5 A 2 2 0 1 0 4.5 2.5 A 2 2 0 1 0 0.5 2.5 Z",
  R: "M 0.5 5.5 V 0.5 H 3 A 1 1 0 0 1 3 2.5 H 0.5 M 2.4 2.5 L 4.6 5.6",
  S: "M 4.232 1 A 2 1 0 1 0 2.5 2.5 A 2 1 0 1 1 0.768 4",
  V: "M 0.3 -0.5 L 2.5 5 L 4.7 -0.5",
  Z: "M -0.5 0.5 H 4.5 L 0.5 4.5 H 5.5",
};

export function isSloanLetter(s: string): s is SloanLetter {
  return (SLOAN_LETTERS as readonly string[]).includes(s);
}

/** n distinct letters (n ≤ 10), uniformly shuffled with the given RNG. */
export function randomLetters(n: number, rand: () => number, avoid: readonly string[] = []): SloanLetter[] {
  if (!(Number.isInteger(n) && n >= 1 && n <= SLOAN_LETTERS.length)) throw new Error(`n must be 1..${SLOAN_LETTERS.length}`);
  for (let attempt = 0; attempt < 100; attempt++) {
    const pool = [...SLOAN_LETTERS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const pick = pool.slice(0, n);
    // Avoid repeating a letter at the same position as the previous line (when possible).
    if (pick.every((l, i) => avoid[i] !== l)) return pick;
  }
  return [...SLOAN_LETTERS].slice(0, n);
}
