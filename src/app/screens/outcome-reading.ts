/** Reading-speed screen: timed sentences at decreasing print size (MNREAD-style). */
import { mulberry32 } from "../../core/rng";
import {
  MAX_LINES,
  MIN_X_HEIGHT_PX,
  READING_LOGMAR,
  SENTENCES,
  WORDS_PER_SENTENCE,
  readingShouldStop,
  readingSpeedWpm,
  scoreReading,
  sentenceOrder,
  wrapWords,
  xHeightPx,
  type ReadingTrial,
} from "../../core/outcome/reading";
import { fitCanvasToDevicePixels } from "../../render/webgl";
import type { AppContext } from "../context";
import { clear, h } from "../dom";
import { waitFrames } from "../frames";
import {
  Stopped,
  TestRun,
  card,
  enterTestDisplay,
  errorText,
  needCalibration,
  overlay,
  saveOutcome,
  stopButton,
} from "./outcome-common";

export const READING_FONT = '"Helvetica Neue", Helvetica, Arial, Roboto, sans-serif';
const LINE_SPACING = 1.6; // baseline-to-baseline distance in font sizes

export async function renderReading(ctx: AppContext, root: HTMLElement, query: URLSearchParams): Promise<void> {
  const auto = query.get("auto") === "1";
  clear(root);
  const cal = await needCalibration(ctx, root);
  if (!cal) return;
  const startBtn = h("button", { class: "primary" }, "Start");
  root.append(
    h("h1", {}, "Reading speed"),
    h("section", { class: "card" },
      h("p", {}, "Sentences of 10 words appear one at a time, each smaller than the last."),
      h("p", {}, "Tap “Show”, read the sentence ALOUD as quickly and accurately as you can, then tap anywhere as soon as you finish."),
      h("p", {}, "Then enter how many words you misread or skipped. If you cannot read a sentence, tap “Could not read it”."),
      h("p", {}, `Both eyes open, habitual distance correction, no reading glasses, ${cal.distanceCm} cm.`)),
    h("div", { class: "row" }, startBtn, h("button", { onclick: () => ctx.navigate("tests") }, "Back")),
  );
  const run = new TestRun();
  try {
    const clicked = new Promise<void>((res) => startBtn.addEventListener("click", () => res(), { once: true }));
    if (auto) startBtn.click();
    await run.race(clicked);
    enterTestDisplay(run);
    clear(root);

    const canvas = document.createElement("canvas");
    overlay(run, root, canvas, { inset: "0", width: "100vw", height: "100vh", display: "block", background: "#fff" });
    // Rotation (resize) or leaving the app while a sentence is shown: that sentence is not counted.
    let cancelReading: (() => void) | null = null;
    run.onCleanup(fitCanvasToDevicePixels(canvas, () => cancelReading?.()));
    const onVis = (): void => {
      if (document.visibilityState === "hidden") cancelReading?.();
    };
    document.addEventListener("visibilitychange", onVis);
    run.onCleanup(() => document.removeEventListener("visibilitychange", onVis));
    const g = canvas.getContext("2d", { alpha: false });
    if (!g) throw new Error("2D canvas is not available");
    stopButton(run, root);
    await run.race(waitFrames(20));

    // x-height of the font relative to its size, measured on this device.
    g.font = `100px ${READING_FONT}`;
    const xRatio = g.measureText("x").actualBoundingBoxAscent / 100 || 0.52;
    const distanceMm = cal.distanceCm * 10;
    const W = canvas.width;
    const H = canvas.height;
    const layoutFor = (L: number, sentence: string) => {
      const xh = xHeightPx(L, distanceMm, cal.pxPerMm);
      const fontPx = xh / xRatio;
      g.font = `${fontPx}px ${READING_FONT}`;
      const lines = wrapWords(sentence, 0.9 * W, (s) => g.measureText(s).width);
      const ok = xh >= MIN_X_HEIGHT_PX && lines !== null && lines.length <= MAX_LINES && lines.length * fontPx * LINE_SPACING <= 0.85 * H;
      return { xh, fontPx, lines, ok };
    };
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const order = sentenceOrder(mulberry32(seed));
    // A size is offered if every sentence fits at that size (so the order does not matter).
    const sizes = READING_LOGMAR.filter((L) => SENTENCES.every((s) => layoutFor(L, s).ok));
    if (sizes.length === 0) throw new Error("no print size fits this screen; check the calibration");

    const clearCanvas = (): void => {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, canvas.width, canvas.height);
    };
    clearCanvas();

    const trials: ReadingTrial[] = [];
    let shown = 0; // sentences used so far (an interrupted one is replaced by a new sentence)
    let interrupted = false;
    for (let i = 0; i < sizes.length; i++) {
      const L = sizes[i];
      const sentence = SENTENCES[order[shown++ % order.length]];
      await card(run, root, "Show", [
        ...(interrupted ? ["Paused — that sentence was not counted. Here is a new one of the same size."] : []),
        `Sentence ${i + 1}`,
        "Read aloud, then tap anywhere.",
      ], { auto });
      interrupted = false;
      const lay = layoutFor(L, sentence);
      // Draw in a rAF callback; its timestamp is the onset (visible at the next vsync, same as the tap's latency).
      const t0 = await run.race(
        new Promise<number>((res) =>
          requestAnimationFrame((t) => {
            clearCanvas();
            g.font = `${lay.fontPx}px ${READING_FONT}`;
            g.fillStyle = "#000";
            g.textAlign = "center";
            g.textBaseline = "alphabetic";
            const lh = lay.fontPx * LINE_SPACING;
            const n = lay.lines!.length;
            const top = canvas.height / 2 - ((n - 1) * lh) / 2 + lay.xh / 2;
            lay.lines!.forEach((line, k) => g.fillText(line, canvas.width / 2, Math.round(top + k * lh)));
            res(t);
          }),
        ),
      );
      const done = h("button", { "aria-label": "Done reading" });
      overlay(run, root, done, { inset: "0", zIndex: "40", background: "transparent", border: "none", minHeight: "0", borderRadius: "0" });
      const t1 = await run.race(
        new Promise<number | null>((res) => {
          done.addEventListener("click", (ev) => res(ev.timeStamp), { once: true });
          cancelReading = () => res(null);
          if (auto) void waitFrames(30).then(() => done.click());
        }),
      );
      cancelReading = null;
      done.remove();
      clearCanvas();
      if (t1 === null) {
        interrupted = true;
        i--; // same size again, new sentence
        continue;
      }
      const ms = Math.max(1, t1 - t0);

      // Error entry
      const answer = await run.race(
        new Promise<number | "unreadable">((res) => {
          const pick = (v: number | "unreadable") => () => {
            box.remove();
            res(v);
          };
          const box = h("div", {},
            h("p", {}, "How many words did you misread or skip?"),
            h("div", { class: "row", style: "justify-content:center" },
              ...Array.from({ length: WORDS_PER_SENTENCE + 1 }, (_, k) => h("button", { onclick: pick(k) }, String(k)))),
            h("button", { onclick: pick("unreadable") }, "Could not read it"));
          overlay(run, root, box, { inset: "0", zIndex: "50", background: "#fff", color: "#111", padding: "1rem", textAlign: "center", overflow: "auto" });
          if (auto) void waitFrames(1).then(pick(L >= 0.3 - 1e-9 ? 0 : "unreadable"));
        }),
      );
      const unreadable = answer === "unreadable";
      const errors = unreadable ? WORDS_PER_SENTENCE : answer;
      const t: ReadingTrial = {
        logMAR: L,
        sentence,
        words: WORDS_PER_SENTENCE,
        ms: unreadable ? null : ms,
        errors,
        unreadable,
        wpm: unreadable ? null : readingSpeedWpm(WORDS_PER_SENTENCE, errors, ms),
      };
      trials.push(t);
      if (readingShouldStop(t)) break;
    }
    run.dispose();
    clear(root);

    const r = scoreReading(trials);
    const id = await saveOutcome(ctx, {
      createdAt: new Date().toISOString(),
      kind: "reading",
      calibrationId: cal.id ?? null,
      summary: {
        readingAcuity: r.readingAcuity,
        maxReadingSpeedWpm: r.maxReadingSpeed,
        criticalPrintSize: r.criticalPrintSize,
        sentences: trials.length,
        smallestSize: trials[trials.length - 1].logMAR,
        distanceCm: cal.distanceCm,
        ...(auto ? { testRun: "auto" } : {}),
      },
      details: { trials: r.trials, font: READING_FONT, xHeightRatio: xRatio, sizes, seed, pxPerMm: cal.pxPerMm },
    });
    root.append(
      h("h1", {}, "Result"),
      h("section", { class: "card" },
        h("p", {}, `Maximum reading speed: ${r.maxReadingSpeed === null ? "–" : `${r.maxReadingSpeed.toFixed(0)} words/min`}`),
        h("p", {}, `Critical print size: ${r.criticalPrintSize === null ? "–" : `${r.criticalPrintSize.toFixed(1)} logMAR`}`),
        h("p", {}, `Reading acuity: ${r.readingAcuity.toFixed(2)} logMAR`),
        h("div", { class: "scroll" }, h("table", {},
          h("thead", {}, h("tr", {}, ...["Size (logMAR)", "Time (s)", "Errors", "Words/min"].map((t) => h("th", {}, t)))),
          h("tbody", {}, ...r.trials.map((t) => h("tr", {},
            h("td", {}, t.logMAR.toFixed(1)),
            h("td", {}, t.ms === null ? "–" : (t.ms / 1000).toFixed(1)),
            h("td", {}, t.unreadable ? "could not read" : String(t.errors)),
            h("td", {}, t.wpm === null ? "–" : t.wpm.toFixed(0))))))),
        h("p", { class: "small" }, `Saved (#${id}). For your own records, not a diagnosis.`)),
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
