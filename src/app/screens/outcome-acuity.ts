/** Near letter acuity screen: crowded (lines of 5) or uncrowded (single letters), unlimited or time-limited. */
import {
  AcuityProcedure,
  LETTERS_PER_LINE,
  TIMED_PRESENTATION_MS,
  availableLines,
  letterHeightPx,
  timedFrames,
  type Crowding,
  type Presentation,
} from "../../core/outcome/acuity";
import { snellenLabel } from "../../core/outcome/near-chart";
import { OPTOTYPE_BOX, OPTOTYPE_PATHS, SLOAN_LETTERS, isSloanLetter, type SloanLetter } from "../../core/outcome/optotypes";
import { mulberry32 } from "../../core/rng";
import type { TrialTimingLog } from "../../core/timing";
import { toStoredTiming, type StoredTiming } from "../../data/timing-record";
import { fitCanvasToDevicePixels } from "../../render/webgl";
import type { AppContext } from "../context";
import { clear, h } from "../dom";
import { measureRefreshNow, waitFrames } from "../frames";
import { playFrames } from "../player";
import {
  Stopped,
  TestRun,
  abortWhenHidden,
  card,
  css,
  enterTestDisplay,
  errorText,
  needCalibration,
  overlay,
  saveOutcome,
  stopButton,
} from "./outcome-common";

const MAX_PRESENTATIONS = 4;
const LETTER_AREA = 0.6; // top fraction of the screen used for letters; the keypad sits below

const paths = new Map<SloanLetter, Path2D>();
function path(l: SloanLetter): Path2D {
  let p = paths.get(l);
  if (!p) paths.set(l, (p = new Path2D(OPTOTYPE_PATHS[l])));
  return p;
}

/** Draws one optotype with its top-left at (x, y) device px and the given height, clipped to its box. */
export function drawLetter(c: CanvasRenderingContext2D, l: SloanLetter, x: number, y: number, hPx: number): void {
  c.save();
  c.translate(x, y);
  c.scale(hPx / OPTOTYPE_BOX, hPx / OPTOTYPE_BOX);
  c.beginPath();
  c.rect(0, 0, OPTOTYPE_BOX, OPTOTYPE_BOX);
  c.clip();
  c.lineWidth = 1;
  c.lineCap = "butt";
  c.lineJoin = "miter";
  c.miterLimit = 10;
  c.strokeStyle = "#000";
  c.stroke(path(l));
  c.restore();
}

interface Presented {
  letters: SloanLetter[];
  timing?: StoredTiming;
  valid: boolean;
}

export async function renderAcuity(ctx: AppContext, root: HTMLElement, query: URLSearchParams): Promise<void> {
  const crowding: Crowding = query.get("crowding") === "uncrowded" ? "uncrowded" : "crowded";
  const presentation: Presentation = query.get("timing") === "timed" ? "timed" : "unlimited";
  const auto = query.get("auto") === "1";
  clear(root);
  const cal = await needCalibration(ctx, root);
  if (!cal) return;

  const title = `Near acuity — ${crowding}, ${presentation === "timed" ? `${TIMED_PRESENTATION_MS} ms` : "unlimited time"}`;
  const startBtn = h("button", { class: "primary" }, "Start");
  root.append(
    h("h1", {}, title),
    h("section", { class: "card" },
      h("p", {}, crowding === "crowded"
        ? "Lines of 5 letters get smaller line by line. Enter the letters from left to right with the keypad."
        : "Single letters, 5 per size, get smaller step by step. Enter each letter with the keypad."),
      ...(presentation === "timed" ? [h("p", {}, `Look at the small cross. The letters appear for ${TIMED_PRESENTATION_MS} ms; then enter what you saw.`)] : []),
      h("p", {}, "Guess when unsure; use ? only if you saw nothing. Testing stops after a line with 3 or more errors."),
      h("p", {}, `Both eyes open, habitual distance correction, no reading glasses, ${cal.distanceCm} cm.`)),
    h("div", { class: "row" }, startBtn, h("button", { onclick: () => ctx.navigate("tests") }, "Back")),
  );
  const run = new TestRun();
  try {
    const clicked = new Promise<void>((res) => startBtn.addEventListener("click", () => res(), { once: true }));
    if (auto) startBtn.click();
    await run.race(clicked);
    enterTestDisplay(run);
    abortWhenHidden(run);
    clear(root);
    const result = await runAcuity(ctx, root, run, cal.distanceCm * 10, cal.pxPerMm, crowding, presentation, auto);
    run.dispose();
    clear(root);
    const r = result.score;
    const id = await saveOutcome(ctx, {
      createdAt: new Date().toISOString(),
      kind: `acuity-${crowding}-${presentation}`,
      calibrationId: cal.id ?? null,
      summary: {
        logMAR: r.logMAR,
        lettersCorrect: r.lettersCorrect,
        topTested: r.topTested,
        atFloor: r.atFloor ? 1 : 0,
        atCeiling: r.atCeiling ? 1 : 0,
        crowding,
        presentation,
        durationMs: presentation === "timed" ? TIMED_PRESENTATION_MS : null,
        distanceCm: cal.distanceCm,
        hz: result.hz,
        invalidPresentations: result.invalidPresentations,
        ...(auto ? { testRun: "auto" } : {}),
      },
      details: { lines: r.lines, presented: result.presented, available: result.available, seed: result.seed, pxPerMm: cal.pxPerMm },
    });
    root.append(
      h("h1", {}, "Result"),
      h("section", { class: "card" },
        h("p", {}, `Near acuity: ${r.logMAR.toFixed(2)} logMAR (≈ 20/${snellenLabel(r.logMAR)}) at ${cal.distanceCm} cm`),
        h("p", {}, `${r.lettersCorrect} letters correct; lines ${r.topTested.toFixed(1)} to ${r.lines[r.lines.length - 1].logMAR.toFixed(1)} tested.`),
        ...(r.atFloor ? [h("p", { class: "warn" }, "You read the smallest line this screen can show: your acuity may be better than this score.")] : []),
        ...(r.atCeiling ? [h("p", { class: "warn" }, "The largest line on this screen was not read: your acuity may be worse than this score.")] : []),
        ...(result.invalidPresentations ? [h("p", {}, `Presentations repeated because of timing glitches: ${result.invalidPresentations}`)] : []),
        h("p", { class: "small" }, `Saved (#${id}). Lower logMAR is better. This is a measurement for your own records, not a diagnosis.`)),
      h("div", { class: "row" }, h("button", { class: "primary", onclick: () => ctx.navigate("tests") }, "Back to tests")),
    );
  } catch (e) {
    run.dispose();
    if (e instanceof Stopped) {
      if (e.reason === "stopped by user") ctx.navigate("tests");
      return;
    }
    clear(root);
    root.append(h("p", {}, `Test stopped: ${errorText(e)}`), h("button", { onclick: () => ctx.navigate("tests") }, "Back"));
  } finally {
    run.dispose();
  }
}

async function runAcuity(
  ctx: AppContext,
  root: HTMLElement,
  run: TestRun,
  distanceMm: number,
  pxPerMm: number,
  crowding: Crowding,
  presentation: Presentation,
  auto: boolean,
) {
  void ctx;
  const canvas = document.createElement("canvas");
  overlay(run, root, canvas, { inset: "0", width: "100%", height: "100%", display: "block", background: "#fff" });
  let resized = false;
  // Resizing (rotation) clears the canvas: redraw what was on screen; a time-limited presentation in
  // progress is aborted and repeated.
  let redraw: () => void = () => undefined;
  const stopFit = fitCanvasToDevicePixels(canvas, () => {
    resized = true;
    for (const c of run.abort) c.abort();
    redraw();
  });
  const onVisible = (): void => {
    if (document.visibilityState === "visible") redraw();
  };
  document.addEventListener("visibilitychange", onVisible);
  run.onCleanup(() => document.removeEventListener("visibilitychange", onVisible));
  run.onCleanup(stopFit);
  const c2 = canvas.getContext("2d", { alpha: false });
  if (!c2) throw new Error("2D canvas is not available");
  const g: CanvasRenderingContext2D = c2;
  stopButton(run, root);

  // Let fullscreen settle, then size the chart to the canvas.
  await run.race(waitFrames(20));
  const hz = presentation === "timed" ? (await run.race(measureRefreshNow())).hz : null;
  const W = canvas.width;
  const H = canvas.height;
  const available = availableLines(distanceMm, pxPerMm, 0.95 * W, 0.8 * LETTER_AREA * H, crowding);
  if (available.length === 0) throw new Error("no chart line fits this screen; check the calibration");
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const proc = new AcuityProcedure(available, mulberry32(seed));

  const clearCanvas = (): void => {
    redraw = paintWhite;
    paintWhite();
  };
  const paintWhite = (): void => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
  };
  const cy = (): number => Math.round(canvas.height * LETTER_AREA * 0.5);
  /** Draw letters (all, or only index k) of a line centred in the letter area. */
  const drawLine = (letters: readonly SloanLetter[], hPx: number, only: number | null): void => {
    redraw = () => drawLine(letters, hPx, only);
    paintWhite();
    const n = only === null ? letters.length : 1;
    const totalW = hPx * (2 * n - 1);
    const x0 = canvas.width / 2 - totalW / 2;
    const y0 = Math.round(cy() - hPx / 2);
    const list = only === null ? letters : [letters[only]];
    list.forEach((l, k) => drawLetter(g, l, Math.round(x0 + k * 2 * hPx), y0, hPx));
  };
  const drawFixation = (): void => {
    clearCanvas();
    const s = Math.max(6, Math.round(pxPerMm * 1.5));
    g.fillStyle = "#000";
    const x = Math.round(canvas.width / 2);
    const y = cy();
    g.fillRect(x - s, y - 1, 2 * s, 2);
    g.fillRect(x - 1, y - s, 2, 2 * s);
  };

  // ---- keypad ----
  let accept: ((l: string) => void) | null = null;
  const press = (l: string): void => {
    const a = accept;
    if (a) {
      accept = null;
      a(l);
    }
  };
  const progress = h("div", {});
  const key = (label: string, value: string): HTMLButtonElement =>
    css(h("button", { onclick: () => press(value), "aria-label": label === "?" ? "Not seen" : `Letter ${label}` }, label), {
      fontSize: "28px", minWidth: "64px", minHeight: "56px",
    }) as HTMLButtonElement;
  const keypad = overlay(run, root, h("div", {}, progress, h("div", {}, ...SLOAN_LETTERS.map((l) => key(l, l)), key("?", "?"), key("⌫", "back"))), {
    left: "0", right: "0", bottom: "0", height: `${Math.round((1 - LETTER_AREA) * 100)}%`, zIndex: "20", background: "#eee",
    display: "none", textAlign: "center", padding: "0.5rem", boxSizing: "border-box", overflow: "auto",
  });
  css(keypad.lastElementChild as HTMLElement, { display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center" });
  const onKey = (ev: KeyboardEvent): void => {
    const k = ev.key.toUpperCase();
    if (isSloanLetter(k)) press(k);
    else if (ev.key === "?" || ev.key === " ") press("?");
    else if (ev.key === "Backspace") press("back");
  };
  window.addEventListener("keydown", onKey);
  run.onCleanup(() => window.removeEventListener("keydown", onKey));
  const message = overlay(run, root, h("div", {}), {
    left: "0", right: "0", top: `${Math.round(LETTER_AREA * 85)}%`, textAlign: "center", zIndex: "30", font: "20px system-ui, sans-serif", color: "#b3261e", pointerEvents: "none",
  });

  /** Collects n letters (with backspace). onChange(k) is called with the number entered so far. */
  const collect = async (n: number, truth: readonly SloanLetter[], logMAR: number, onChange?: (k: number) => void): Promise<string[]> => {
    const got: string[] = [];
    keypad.style.display = "block";
    try {
      while (got.length < n) {
        progress.textContent = `${"● ".repeat(got.length)}${"○ ".repeat(n - got.length)}`.trim();
        onChange?.(got.length);
        const p = new Promise<string>((res) => {
          accept = res;
        });
        if (auto) void waitFrames(1).then(() => press(logMAR >= 0.3 - 1e-9 ? truth[got.length] : "?"));
        const v = await run.race(p);
        if (v === "back") got.pop();
        else got.push(v);
      }
    } finally {
      keypad.style.display = "none";
      accept = null;
    }
    return got;
  };

  /** Plays one time-limited presentation; returns its timing log, or null if aborted (resize / hidden page). */
  const flash = async (draw: () => void): Promise<TrialTimingLog | null> => {
    const ctl = new AbortController();
    run.abort.add(ctl);
    try {
      return await playFrames({
        frames: timedFrames(hz as number),
        hz: hz as number,
        signal: ctl.signal,
        drawFrame: (f) => {
          if (f.showTarget) draw();
          else drawFixation();
          redraw = paintWhite; // never re-show flashed letters after a resize
        },
        drawEnd: clearCanvas,
      });
    } catch (e) {
      if (run.reason !== null) throw new Stopped(run.reason);
      if (e instanceof Error && e.message === "playback aborted") return null;
      throw e;
    } finally {
      run.abort.delete(ctl);
    }
  };

  const presented: { logMAR: number; shown: Presented[] }[] = [];
  let invalidPresentations = 0;
  while (!proc.done) {
    const cur = proc.current()!;
    const hPx = letterHeightPx(cur.logMAR, distanceMm, pxPerMm);
    const shown: Presented[] = [];
    presented.push({ logMAR: cur.logMAR, shown });
    let responses: string[] = [];
    let letters = cur.letters;
    if (presentation === "unlimited") {
      if (crowding === "crowded") {
        drawLine(letters, hPx, null);
        responses = await collect(LETTERS_PER_LINE, letters, cur.logMAR);
      } else {
        responses = await collect(LETTERS_PER_LINE, letters, cur.logMAR, (k) => drawLine(letters, hPx, Math.min(k, LETTERS_PER_LINE - 1)));
      }
      shown.push({ letters, valid: true });
    } else {
      // Time-limited: the whole line (crowded) or each letter (uncrowded) is flashed; a presentation
      // with a late frame or an abort is repeated with new letters.
      const flashUntilValid = async (draw: () => void, label: SloanLetter[]): Promise<void> => {
        for (let attempt = 1; ; attempt++) {
          if (!auto) await card(run, root, "Show", [`Size ${cur.logMAR.toFixed(1)} logMAR`], { background: "#fff" });
          else await run.race(waitFrames(2));
          resized = false;
          const log = await flash(draw);
          const valid = !!log && log.analysis.valid && !resized;
          shown.push({ letters: [...label], valid, ...(log ? { timing: toStoredTiming(log) } : {}) });
          if (valid || attempt >= MAX_PRESENTATIONS) return;
          invalidPresentations++;
          message.textContent = "Timing glitch — shown again with new letters";
          await run.race(waitFrames(45));
          message.textContent = "";
          proc.redraw();
          letters = proc.current()!.letters;
        }
      };
      if (crowding === "crowded") {
        await flashUntilValid(() => drawLine(letters, hPx, null), letters);
        responses = await collect(LETTERS_PER_LINE, letters, cur.logMAR);
      } else {
        // One letter at a time; letters after a glitch are redrawn for the remaining positions only.
        for (let k = 0; k < LETTERS_PER_LINE; k++) {
          const before = letters;
          await flashUntilValid(() => drawLine(letters, hPx, k), [letters[k]]);
          if (letters !== before) letters = [...before.slice(0, k), ...letters.slice(k)];
          const r = await collect(1, [letters[k]], cur.logMAR);
          responses.push(r[0]);
        }
      }
    }
    clearCanvas();
    if (letters !== cur.letters) proc.overrideLetters(letters);
    proc.answer(responses);
  }
  return { score: proc.result(), presented, invalidPresentations, available, seed, hz };
}
