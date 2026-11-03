/**
 * Example pictures for the block cards: what the two moments of a trial look like "with" and
 * "without" the centre pattern. Rendered once with the CPU reference renderer (instructions only, not
 * a timed stimulus). The centre pattern is shown stronger than in the task so it is easy to spot.
 */
import { carrierRad, stimulusPatches } from "../core/layout";
import type { Block } from "../core/protocol";
import { DEFAULT_MEAN_LUMINANCE, renderCpu } from "../render/cpu";
import { h } from "./dom";

export const EXAMPLE_TARGET_CONTRAST = 0.5;

function picture(block: Block, thetaDeg: number, lambdaPx: number, present: boolean, sizePx: number, dpr: number): HTMLElement {
  const lam = Math.max(4, lambdaPx);
  const c = sizePx / 2;
  const patches = stimulusPatches({
    condition: block.condition,
    thetaDeg,
    sepLambda: block.sep_lambda?.[0] ?? 3,
    lambdaPx: lam,
    cx: c,
    cy: c,
    targetContrast: EXAMPLE_TARGET_CONTRAST,
    flankerContrast: block.flank_contrast ?? 0,
    nFlankers: block.n_flankers,
    targetPresent: present,
  });
  const r = renderCpu({ width: sizePx, height: sizePx, patches, lambdaPx: lam, carrierRad: carrierRad(thetaDeg), mean: DEFAULT_MEAN_LUMINANCE, dither: true, seed: present ? 1 : 2 });
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  canvas.style.width = `${sizePx / dpr}px`;
  canvas.style.height = `${sizePx / dpr}px`;
  canvas.style.border = "1px solid rgba(0,0,0,0.3)";
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(r.rgba), sizePx, sizePx), 0, 0);
  return canvas;
}

/**
 * Two labelled pictures side by side. `lambdaPx` is the real wavelength (device px); the pictures are
 * scaled down if the layout would not fit in `maxCssPx`.
 */
export function blockExamples(block: Block, thetaDeg: number, lambdaPx: number, maxCssPx: number): HTMLElement {
  const dpr = window.devicePixelRatio || 1;
  const sep = block.sep_lambda?.[0] ?? 3;
  const flanked = block.condition !== "SINGLE" && block.condition !== "BM-T";
  const extentLambda = 2 * ((flanked ? sep * (block.condition.endsWith("CROWD") ? Math.SQRT2 : 1) : 0) + 3.5);
  const natural = extentLambda * lambdaPx;
  const maxPx = maxCssPx * dpr;
  const scale = Math.min(1, maxPx / natural);
  const size = Math.max(32, Math.round(natural * scale));
  const lam = lambdaPx * scale;
  const fig = (present: boolean, label: string) =>
    h("figure", { style: "margin:0;display:flex;flex-direction:column;align-items:center;gap:0.2rem" },
      picture(block, thetaDeg, lam, present, size, dpr),
      h("figcaption", { style: "font-size:0.85rem" }, label));
  return h("div", { style: "display:flex;gap:1.5rem;justify-content:center;flex-wrap:wrap" },
    fig(true, block.condition === "SINGLE" ? "This time: patch → pick this one" : "Middle FILLED → pick this one"),
    fig(false, block.condition === "SINGLE" ? "Other time: plain grey" : "Middle empty (gap)"));
}
