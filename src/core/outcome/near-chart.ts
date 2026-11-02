/**
 * Printable near-acuity chart as an SVG string sized in millimetres (print at 100 %).
 * Two fixed letter orders ("A", "B") so repeated paper tests do not reuse the same sequence.
 */
import { mulberry32 } from "../rng";
import { CHART_LOGMAR, LETTERS_PER_LINE, letterHeightMm, mUnits, snellen20 } from "./acuity";
import { OPTOTYPE_BOX, OPTOTYPE_PATHS, SLOAN_LETTERS, randomLetters, type SloanLetter } from "./optotypes";

export type ChartOrder = "A" | "B";
const ORDER_SEED: Record<ChartOrder, number> = { A: 0x4e50a, B: 0x4e50b };
/** Chart lines on paper: +1.0 … −0.2 (−0.3 at 40 cm is ≈ 0.29 mm high, below typical print quality). */
export const PAPER_LOGMAR: readonly number[] = CHART_LOGMAR.filter((L) => L >= -0.2 - 1e-9);

export function chartLetters(order: ChartOrder): SloanLetter[][] {
  const rand = mulberry32(ORDER_SEED[order]);
  const lines: SloanLetter[][] = [];
  let prev: SloanLetter[] = [];
  for (let i = 0; i < PAPER_LOGMAR.length; i++) {
    prev = randomLetters(LETTERS_PER_LINE, rand, prev);
    lines.push(prev);
  }
  return lines;
}

/** Conventional Snellen denominators for 0.1 logMAR steps (20 × 10^logMAR, rounded as on printed charts). */
export function snellenLabel(logMAR: number): string {
  const std = [10, 12.5, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
  const x = snellen20(logMAR);
  const best = std.reduce((a, b) => (Math.abs(Math.log(b / x)) < Math.abs(Math.log(a / x)) ? b : a));
  return String(best);
}

function f(x: number, d = 3): string {
  return Number(x.toFixed(d)).toString();
}

export interface NearChartOptions {
  order: ChartOrder;
  distanceCm: number;
}

/** A4 portrait (210 × 297 mm). Letters are black strokes on white, clipped to their 5 × 5 box. */
export function nearChartSvg(o: NearChartOptions): string {
  if (!(o.distanceCm >= 20 && o.distanceCm <= 100)) throw new Error("distanceCm must be 20..100");
  const W = 210;
  const H = 297;
  const D = o.distanceCm * 10;
  const lines = chartLetters(o.order);
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<title>nearpoint near chart ${o.order} (${o.distanceCm} cm)</title>`,
    "<defs>",
    ...SLOAN_LETTERS.map(
      (l) =>
        `<symbol id="L${l}" viewBox="0 0 ${OPTOTYPE_BOX} ${OPTOTYPE_BOX}" overflow="hidden"><path d="${OPTOTYPE_PATHS[l]}" fill="none" stroke="#000" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10"/></symbol>`,
    ),
    "</defs>",
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
    `<g font-family="Helvetica, Arial, sans-serif" fill="#000">`,
    `<text x="15" y="16" font-size="5">nearpoint near chart, order ${o.order} — viewing distance ${o.distanceCm} cm</text>`,
    `<text x="15" y="22" font-size="3">Print at 100 % (no "fit to page"); check the 100 mm bar below. Both eyes open, habitual distance correction, good even light.</text>`,
    `<text x="15" y="26.5" font-size="3">Read each line left to right; stop after a line with 3 or more errors. Score = largest line read + 0.1 − 0.02 × letters correct.</text>`,
    `<text x="15" y="31" font-size="3">Personal research tool, not a medical device. Have your eyes examined by an eye-care professional.</text>`,
    "</g>",
  );
  // 100 mm calibration bar
  out.push(
    `<g stroke="#000" stroke-width="0.3"><line x1="15" y1="37" x2="115" y2="37"/><line x1="15" y1="35" x2="15" y2="39"/><line x1="115" y1="35" x2="115" y2="39"/></g>`,
    `<text x="120" y="38" font-size="3" font-family="Helvetica, Arial, sans-serif">100 mm</text>`,
  );
  // Header row for the columns
  const labelX = 150;
  out.push(
    `<g font-size="2.6" font-family="Helvetica, Arial, sans-serif"><text x="${labelX}" y="46">logMAR</text><text x="${labelX + 14}" y="46">M (${o.distanceCm} cm)</text><text x="${labelX + 32}" y="46">Snellen eq.</text></g>`,
  );
  let y = 52;
  for (let i = 0; i < PAPER_LOGMAR.length; i++) {
    const L = PAPER_LOGMAR[i];
    const h = letterHeightMm(L, D);
    const lineW = h * (2 * LETTERS_PER_LINE - 1);
    const x0 = 15 + (125 - lineW) / 2;
    lines[i].forEach((letter, k) => {
      out.push(`<use href="#L${letter}" xlink:href="#L${letter}" x="${f(x0 + k * 2 * h)}" y="${f(y)}" width="${f(h)}" height="${f(h)}"/>`);
    });
    const ty = f(y + Math.min(h, 4) / 2 + 1);
    out.push(
      `<g font-size="2.6" font-family="Helvetica, Arial, sans-serif"><text x="${labelX}" y="${ty}">${L.toFixed(1).replace("-0.0", "0.0")}</text>` +
        `<text x="${labelX + 14}" y="${ty}">${mUnits(L, D / 1000).toFixed(2)} M</text><text x="${labelX + 32}" y="${ty}">20/${snellenLabel(L)}</text></g>`,
    );
    // ETDRS spacing: gap to the next line = height of the next (smaller) line, at least 3 mm for labels.
    const next = i + 1 < PAPER_LOGMAR.length ? letterHeightMm(PAPER_LOGMAR[i + 1], D) : 0;
    y += h + Math.max(next, 6);
  }
  if (y > H - 10) throw new Error("chart does not fit on A4");
  out.push(`<text x="15" y="${H - 10}" font-size="2.6" font-family="Helvetica, Arial, sans-serif">Letters: Sloan-style optotypes drawn by nearpoint (5 × 5 grid, stroke = 1/5 height). Not a certified chart.</text>`);
  out.push("</svg>");
  return out.join("\n");
}
