/**
 * Contrast-sensitivity outcome test at 2, 4 and 6 cpd: isolated vertical Gabor, 2IFC, own trial
 * frames and staircase (src/core/outcome/contrast-test.ts). No per-trial feedback: it measures, it does not train.
 */
import { refreshWarnings } from "../../core/calibration";
import { lambdaPx, pxPerDegree } from "../../core/geometry";
import { CONTRAST_TEST, CONTRAST_TEST_CPD, ContrastTestRun, contrastTestFrames, type ContrastTestResult } from "../../core/outcome/contrast-test";
import { mulberry32 } from "../../core/rng";
import type { TrialTimingLog } from "../../core/timing";
import { toStoredTiming, type StoredTiming } from "../../data/timing-record";
import { DEFAULT_MEAN_LUMINANCE } from "../../render/cpu";
import { createFeedbackAudio, intervalOnsets, intervalTicksEnabled, setIntervalTicks } from "../audio";
import { WebGLStimulusRenderer, fitCanvasToDevicePixels } from "../../render/webgl";
import type { AppContext } from "../context";
import { clear, h } from "../dom";
import { measureRefreshNow, waitFrames } from "../frames";
import { playFrames } from "../player";
import {
  Stopped,
  TestRun,
  card,
  css,
  enterTestDisplay,
  errorText,
  needCalibration,
  overlay,
  saveOutcome,
  stopButton,
} from "./outcome-common";

const BG = "#777";
const FIXATION_DEG = 0.7;

interface StoredContrastTrial {
  contrast: number;
  targetInterval: 1 | 2;
  response: 1 | 2;
  correct: boolean;
  valid: boolean;
  rtMs: number;
  timing: StoredTiming;
}

function fmtPct(c: number | null): string {
  if (c === null) return "–";
  const p = c * 100;
  return p < 1 ? `${Number(p.toPrecision(2))} %` : `${p.toFixed(1)} %`;
}

export async function renderContrast(ctx: AppContext, root: HTMLElement, query: URLSearchParams): Promise<void> {
  const quick = query.get("quick") === "1";
  const auto = quick && query.get("auto") === "1";
  const maxTrials = quick ? Math.max(1, Math.floor(Number(query.get("trials") ?? 6)) || 6) : null;
  clear(root);
  const cal = await needCalibration(ctx, root);
  if (!cal) return;

  const startBtn = h("button", { class: "primary" }, "Start");
  const ticksBox = h("input", { type: "checkbox", checked: intervalTicksEnabled(), onchange: () => setIntervalTicks(ticksBox.checked) });
  root.append(
    h("h1", {}, "Contrast sensitivity"),
    h("section", { class: "card" },
      h("p", {}, "Like training block 1: each round, a small dark circle appears in the middle, then a faint stripy patch pops up in the middle ONCE — at the first moment or at the second moment, half a second later."),
      h("p", {}, "Tap the LEFT half if it came first, the RIGHT half if it came second (or keys 1 / 2). It gets fainter as you go; always guess."),
      h("p", {}, `Three runs: ${CONTRAST_TEST_CPD.join(", ")} cycles/degree, about 3 minutes each. Guess when unsure. There is no feedback during this test.`),
      h("p", {}, `Phone in the stand at ${cal.distanceCm} cm, brightness at maximum, dim room.`),
      h("label", { class: "check" }, ticksBox, " Soft tick at each of the two moments (use the same setting every time you repeat this test)"),
      ...(quick ? [h("p", { class: "small" }, `Quick test run: ${String(maxTrials)} trials per run.`)] : [])),
    h("div", { class: "row" }, startBtn, h("button", { onclick: () => ctx.navigate("tests") }, "Back")),
  );
  const run = new TestRun();
  try {
    const clicked = new Promise<void>((res) => startBtn.addEventListener("click", () => res(), { once: true }));
    if (auto) startBtn.click();
    await run.race(clicked);
    const ticks = ticksBox.checked;
    const audio = createFeedbackAudio();
    audio.unlock(); // user gesture
    enterTestDisplay(run);
    clear(root);

    const canvas = document.createElement("canvas");
    overlay(run, root, canvas, { inset: "0", width: "100%", height: "100%", display: "block", background: BG });
    let cw = canvas.width;
    let ch = canvas.height;
    // A resize/rotation or hidden page invalidates the trial in progress, also while waiting for the answer.
    let cancelResponse: (() => void) | null = null;
    let redraw: () => void = () => undefined;
    const disturb = (): void => {
      for (const c of run.abort) c.abort();
      cancelResponse?.();
    };
    run.onCleanup(
      fitCanvasToDevicePixels(canvas, (w, hh) => {
        cw = w;
        ch = hh;
        disturb();
        redraw(); // resizing clears the canvas
      }),
    );
    const onVis = (): void => {
      if (document.visibilityState === "hidden") disturb();
      else redraw();
    };
    document.addEventListener("visibilitychange", onVis);
    run.onCleanup(() => document.removeEventListener("visibilitychange", onVis));
    cw = canvas.width;
    ch = canvas.height;
    const created = WebGLStimulusRenderer.create(canvas);
    if (!created) throw new Error("WebGL2 is required for this test");
    let gl: WebGLStimulusRenderer = created;
    run.onCleanup(() => gl.dispose());
    canvas.addEventListener("webglcontextlost", (ev) => {
      ev.preventDefault();
      disturb();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      const r = WebGLStimulusRenderer.create(canvas);
      if (r) {
        gl = r;
        redraw();
      } else run.stop("graphics could not be restored");
    });

    // response UI
    let accept: ((r: 1 | 2) => void) | null = null;
    const respond = (v: 1 | 2): void => {
      const a = accept;
      if (a) {
        accept = null;
        a(v);
      }
    };
    const half = (label: string, side: "left" | "right", v: 1 | 2): HTMLElement =>
      css(h("button", { "aria-label": `Interval ${label}`, onclick: (ev) => { if ((ev as MouseEvent).detail !== 0) respond(v); } }, label), {
        position: "fixed", top: "0", bottom: "0", [side]: "0", width: "50%", minHeight: "0", borderRadius: "0",
        background: "transparent", border: "1px solid rgba(0,0,0,0.15)", color: "rgba(0,0,0,0.35)", fontSize: "20vh", zIndex: "20",
      });
    const prompt = css(h("div", {}, "When did the patch pop up?  Left = first time · Right = second time"), {
      position: "fixed", left: "0", right: "0", top: "12%", textAlign: "center", zIndex: "25", font: "20px system-ui, sans-serif", color: "rgba(0,0,0,0.6)", pointerEvents: "none",
    });
    const responseUi = overlay(run, root, h("div", {}, half("1", "left", 1), half("2", "right", 2), prompt), { inset: "0", zIndex: "20", display: "none" });
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "1" || ev.key === "ArrowLeft") respond(1);
      else if (ev.key === "2" || ev.key === "ArrowRight") respond(2);
    };
    window.addEventListener("keydown", onKey);
    run.onCleanup(() => window.removeEventListener("keydown", onKey));
    const message = overlay(run, root, h("div", {}), {
      left: "0", right: "0", top: "70%", textAlign: "center", zIndex: "30", font: "24px system-ui, sans-serif", color: "#111", pointerEvents: "none",
    });
    const dpr = window.devicePixelRatio || 1;
    const distanceMm = cal.distanceCm * 10;
    const ringCss = (FIXATION_DEG * pxPerDegree(distanceMm, cal.pxPerMm)) / dpr;
    const ring = overlay(run, root, h("div", {}), {
      left: "50%", top: "50%", width: `${ringCss}px`, height: `${ringCss}px`, boxSizing: "border-box", transform: "translate(-50%, -50%)",
      border: "2px solid rgba(0,0,0,0.85)", borderRadius: "50%", pointerEvents: "none", zIndex: "10", display: "none",
    });
    stopButton(run, root);

    const est = await run.race(measureRefreshNow());
    const hz = est.hz;
    const notes = refreshWarnings(est);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const rand = mulberry32(seed);
    const dither = mulberry32((seed ^ 0x85ebca6b) >>> 0);
    const nextSeed = (): number => Math.floor(dither() * 4294967296);
    const carrier = (CONTRAST_TEST.thetaDeg * Math.PI) / 180;

    const results: ContrastTestResult[] = [];
    const trialsByCpd: Record<string, StoredContrastTrial[]> = {};
    for (let i = 0; i < CONTRAST_TEST_CPD.length; i++) {
      const cpd = CONTRAST_TEST_CPD[i];
      const lam = lambdaPx(cpd, distanceMm, cal.pxPerMm);
      const blank = (): void => gl.draw({ patches: [], lambdaPx: lam, sigmaPx: lam, carrierRad: carrier, mean: DEFAULT_MEAN_LUMINANCE, seed: nextSeed() });
      blank();
      redraw = blank;
      await card(run, root, "Tap to start", [h("h2", {}, `Run ${i + 1} of ${CONTRAST_TEST_CPD.length}: ${cpd} cycles/degree`), "Look at the centre of the screen.", ...notes], { auto, background: BG });
      const st = new ContrastTestRun(cpd, rand, maxTrials !== null ? { maxTrials, maxAttempts: Math.ceil(1.5 * maxTrials) } : {});
      const stored: StoredContrastTrial[] = [];
      trialsByCpd[String(cpd)] = stored;
      while (!st.done) {
        const t = st.next();
        const frames = contrastTestFrames(hz, t.targetInterval);
        const onsets = new Set(intervalOnsets(frames));
        const ctl = new AbortController();
        run.abort.add(ctl);
        let t0 = 0;
        let log: TrialTimingLog;
        try {
          log = await playFrames({
            frames,
            hz,
            signal: ctl.signal,
            drawFrame: (f, k) => {
              if (ticks && onsets.has(k)) audio.tick();
              gl.draw({
                patches: f.showTarget ? [{ x: cw / 2, y: ch / 2, contrast: t.contrast }] : [],
                lambdaPx: lam, sigmaPx: lam, carrierRad: carrier, mean: DEFAULT_MEAN_LUMINANCE, seed: nextSeed(),
              });
              ring.style.display = f.showFixation ? "block" : "none";
            },
            drawEnd: () => {
              blank();
              ring.style.display = "none";
              responseUi.style.display = "block";
              t0 = performance.now();
            },
          });
        } catch (e) {
          ring.style.display = "none";
          if (run.reason !== null) throw new Stopped(run.reason);
          if (e instanceof Error && e.message === "playback aborted") {
            st.discard();
            blank();
            await card(run, root, "Tap to continue", ["Paused — the last round was not counted. Tap to continue"], { auto, background: BG });
            continue;
          }
          throw e;
        } finally {
          run.abort.delete(ctl);
        }
        const resp = new Promise<1 | 2 | 0>((res) => {
          accept = res;
          cancelResponse = () => {
            if (accept) {
              accept = null;
              res(0);
            }
          };
        });
        if (auto) void waitFrames(1).then(() => respond(t.targetInterval));
        const answer = await run.race(resp);
        cancelResponse = null;
        const rtMs = performance.now() - t0;
        responseUi.style.display = "none";
        if (answer === 0) {
          st.discard();
          blank();
          await card(run, root, "Tap to continue", ["Paused — the last round was not counted. Tap to continue"], { auto, background: BG });
          continue;
        }
        const response: 1 | 2 = answer;
        const valid = log.analysis.valid;
        const rec = st.record(response, valid);
        stored.push({ ...rec, rtMs, timing: toStoredTiming(log) });
        if (!valid) message.textContent = "Timing glitch — trial not counted";
        await run.race(waitFrames(Math.round((300 * hz) / 1000)));
        message.textContent = "";
      }
      results.push(st.result());
    }
    run.dispose();
    clear(root);

    const summary: Record<string, number | string | null> = { hz, durationMs: CONTRAST_TEST.durMs, distanceCm: cal.distanceCm, intervalTicks: ticks ? 1 : 0 };
    for (const r of results) {
      summary[`threshold${r.cpd}`] = r.threshold;
      summary[`logCS${r.cpd}`] = r.logCS === null ? null : Math.round(r.logCS * 1000) / 1000;
      summary[`invalid${r.cpd}`] = r.invalidTrials;
    }
    if (quick) summary.testRun = "quick";
    const id = await saveOutcome(ctx, {
      createdAt: new Date().toISOString(),
      kind: "contrast",
      calibrationId: cal.id ?? null,
      summary,
      details: { results, trials: trialsByCpd, seed, thetaDeg: CONTRAST_TEST.thetaDeg, pxPerMm: cal.pxPerMm },
    });
    root.append(
      h("h1", {}, "Result"),
      h("div", { class: "scroll" }, h("table", {},
        h("thead", {}, h("tr", {}, ...["cpd", "Threshold", "log CS", "Valid", "Invalid timing"].map((t) => h("th", {}, t)))),
        h("tbody", {}, ...results.map((r) => h("tr", {},
          h("td", {}, String(r.cpd)),
          h("td", {}, fmtPct(r.threshold)),
          h("td", {}, r.logCS === null ? "not converged" : r.logCS.toFixed(2)),
          h("td", {}, String(r.validTrials)),
          h("td", {}, String(r.invalidTrials))))))),
      h("p", { class: "small" }, `Saved (#${id}). Higher log CS (lower threshold) is better. For your own records, not a diagnosis.`),
      ...(quick ? [h("p", { class: "small" }, "Quick test run.")] : []),
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
