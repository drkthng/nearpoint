import { refreshWarnings } from "../../core/calibration";
import { BlockRunner } from "../../core/block-runner";
import { nextSession } from "../../core/curriculum";
import { framePatches } from "../../core/frame-patches";
import { framesFor, lambdaPx, pxPerDegree } from "../../core/geometry";
import { carrierRad } from "../../core/layout";
import type { Block, Condition } from "../../core/protocol";
import { formatContrastPct, pastThresholds, summarizeBlock } from "../../core/results";
import { mulberry32 } from "../../core/rng";
import type { TrialTimingLog } from "../../core/timing";
import { expandFrames } from "../../core/trial";
import type { BlockRow, SessionRow, TrialRow } from "../../data/schema";
import { toStoredTiming } from "../../data/timing-record";
import { DEFAULT_MEAN_LUMINANCE } from "../../render/cpu";
import { WebGLStimulusRenderer, fitCanvasToDevicePixels } from "../../render/webgl";
import { createFeedbackAudio } from "../audio";
import type { AppContext } from "../context";
import { clear, h } from "../dom";
import { measureRefreshNow, waitFrames } from "../frames";
import { playFrames } from "../player";
import { keepScreenOn } from "../wake-lock";
import { BLOCK_HINT, RESPONSE_PROMPT, trialInstructions } from "../instructions";
import { blockExamples } from "../examples";

const CONDITION_WORDS: Record<Condition, string> = {
  SINGLE: "Single target",
  LM: "Target with two flankers",
  CROWD: "Target in a crowd",
  "BM-T": "Target, then mask",
  "BM-LM": "Flankers, then mask",
  "BM-CROWD": "Crowd, then mask",
};

const FEEDBACK_MS = 400;
const FIXATION_DEG = 0.7;
const OVERLAY_BG = "#777";

class Stopped extends Error {
  constructor(readonly reason: string) {
    super(`stopped: ${reason}`);
  }
}

function style(el: HTMLElement, s: Partial<CSSStyleDeclaration>): HTMLElement {
  Object.assign(el.style, s);
  return el;
}

interface BlockSummaryRow {
  condition: Condition;
  threshold: number | null;
  relative: string;
  valid: number;
  invalid: number;
}

function relativeText(threshold: number | null, past: readonly number[]): string {
  if (threshold === null) return "no threshold estimated";
  const s = summarizeBlock(threshold, past);
  if (s.relativeIndexPct === null) return "first measurement";
  const p = Math.abs(s.relativeIndexPct).toFixed(0);
  return s.relativeIndexPct >= 0 ? `${p} % lower than your median` : `${p} % higher than your median`;
}

let active: { stop(reason: string): void; done: Promise<void> } | null = null;

/** Called by the router before it renders another route: stops a running session and resolves once it is saved as aborted. */
export function leaveTraining(): Promise<void> {
  if (!active) return Promise.resolve();
  active.stop("left the training screen");
  return active.done;
}

export async function renderTrain(ctx: AppContext, root: HTMLElement, query: URLSearchParams): Promise<void> {
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((res) => {
    resolveDone = res;
  });
  const mine: { stop(reason: string): void; done: Promise<void> } = { stop: () => undefined, done };
  try {
    await runTrain(ctx, root, query, (stop) => {
      mine.stop = stop;
      active = mine;
    });
  } finally {
    if (active === mine) active = null;
    resolveDone();
  }
}

async function runTrain(
  ctx: AppContext,
  root: HTMLElement,
  query: URLSearchParams,
  register: (stop: (reason: string) => void) => void,
): Promise<void> {
  const quick = query.get("quick") === "1";
  const auto = quick && query.get("auto") === "1";
  const trialsOverride = quick ? Math.max(1, Math.floor(Number(query.get("trials") ?? 6)) || 6) : null;

  // The router sets body.training for #train; the pre-session screen is normal DOM.
  document.body.classList.remove("training");
  clear(root);

  const cal = await ctx.db.latestCalibration();
  if (!cal) {
    root.append(h("p", {}, "No calibration yet. Calibrate first."), h("button", { onclick: () => ctx.navigate("start") }, "Back"));
    return;
  }
  const history = await ctx.db.completedHistory();
  const r = nextSession(ctx.curriculum, history);
  if (r.stop) {
    root.append(h("h1", {}, "Program complete"), h("p", {}, r.reason), h("button", { onclick: () => ctx.navigate("start") }, "Back"));
    return;
  }
  const plan = r.plan;
  const cpd = plan.params.cpd;
  const thetaDeg = plan.params.thetaDeg;
  const blocks: Block[] = plan.blocks.map((b) => (trialsOverride !== null ? { ...b, trials: trialsOverride } : b));

  // ---- stop handling (user, navigation, errors) ----
  let stopReason: string | null = null;
  let rejectStopped: (e: Stopped) => void = () => undefined;
  const stopped = new Promise<never>((_, rej) => {
    rejectStopped = rej;
  });
  stopped.catch(() => undefined);
  const race = <T>(p: Promise<T>): Promise<T> => Promise.race([p, stopped]);
  let controller: AbortController | null = null;
  const stop = (reason: string): void => {
    if (stopReason !== null) return;
    stopReason = reason;
    controller?.abort();
    rejectStopped(new Stopped(reason));
  };
  register(stop);
  const onHash = (): void => stop("left the training screen");
  window.addEventListener("hashchange", onHash);

  // ---- pre-session screen ----
  const startBtn = h("button", { class: "primary" }, "Start");
  root.append(
    h("h1", {}, `Session ${plan.sessionIndex + 1}`),
    h(
      "section",
      { class: "card" },
      h("p", {}, `${cpd} cpd, orientation ${thetaDeg}°`),
      h("p", {}, plan.reason),
      h("p", {}, `${blocks.length} blocks${quick ? " (quick test run, trials per block: " + String(trialsOverride) + ")" : ""}:`),
      h("ol", {}, ...blocks.map((b) => h("li", {}, `${CONDITION_WORDS[b.condition]}, ${b.trials} trials`))),
    ),
    h("p", {}, "Phone in the stand at 40 cm, brightness at maximum, dim room."),
    // Open by default for the first sessions; always available.
    h("details", { class: "card", open: history.length < 3 },
      h("summary", {}, "How a trial works (read before your first session)"),
      trialInstructions()),
    h("div", { class: "row" },
      startBtn,
      ...(quick ? [] : [h("button", { onclick: () => ctx.navigate("train", "quick=1&trials=6") }, "Practice first (short, not counted)")]),
      h("button", { onclick: () => ctx.navigate("start") }, "Back")),
  );
  const clicked = new Promise<void>((res) => startBtn.addEventListener("click", () => res(), { once: true }));
  if (auto) startBtn.click();
  try {
    await race(clicked);
  } catch {
    window.removeEventListener("hashchange", onHash);
    return;
  }

  // ---- start (user gesture) ----
  const audio = createFeedbackAudio();
  audio.unlock();
  const releaseWakeLock = keepScreenOn();
  try {
    void document.documentElement.requestFullscreen().catch(() => undefined);
  } catch {
    /* ignored */
  }
  try {
    void screen.orientation.lock("landscape").catch(() => undefined);
  } catch {
    /* ignored */
  }
  document.body.classList.add("training");
  clear(root);
  const canvas = document.createElement("canvas");
  style(canvas, { position: "fixed", inset: "0", width: "100vw", height: "100vh", display: "block", background: OVERLAY_BG });
  root.append(canvas);
  let cw = 0;
  let ch = 0;
  const stopFit = fitCanvasToDevicePixels(canvas, (w, hh) => {
    cw = w;
    ch = hh;
    controller?.abort(); // a resize mid-trial invalidates it; the pause path discards the trial
  });
  cw = canvas.width;
  ch = canvas.height;

  let renderer: WebGLStimulusRenderer | null = null;
  const overlays: HTMLElement[] = [];
  let toreDown = false;
  const teardown = (): void => {
    if (toreDown) return;
    toreDown = true;
    window.removeEventListener("hashchange", onHash);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("keydown", onKey);
    stopFit();
    try {
      renderer?.dispose();
    } catch {
      /* context may be lost */
    }
    renderer = null;
    for (const o of overlays) o.remove();
    canvas.remove();
    document.body.classList.remove("training");
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch {
      /* ignored */
    }
    releaseWakeLock();
  };

  // ---- response handling ----
  let accept: ((r: 1 | 2) => void) | null = null;
  const respond = (v: 1 | 2): void => {
    const a = accept;
    if (a) {
      accept = null;
      a(v);
    }
  };
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === "1" || ev.key === "ArrowLeft") respond(1);
    else if (ev.key === "2" || ev.key === "ArrowRight") respond(2);
  }
  function onVisibility(): void {
    if (document.visibilityState === "hidden") controller?.abort();
  }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("keydown", onKey);

  // ---- DOM chrome ----
  const addOverlay = (el: HTMLElement): HTMLElement => {
    overlays.push(el);
    root.append(el);
    return el;
  };
  const respBtn = (label: string, side: "left" | "right", v: 1 | 2): HTMLButtonElement => {
    const b = h(
      "button",
      {
        "aria-label": `Interval ${label}`,
        onclick: (ev) => {
          // detail === 0: a keyboard-activated click (Enter/Space); only taps and the 1/2/arrow keys answer.
          if ((ev as MouseEvent).detail === 0) return;
          b.blur();
          respond(v);
        },
        onkeydown: (ev) => {
          const k = (ev as KeyboardEvent).key;
          if (k === "Enter" || k === " ") ev.preventDefault();
        },
      },
      label,
    );
    style(b, {
      position: "fixed", top: "0", bottom: "0", [side]: "0", width: "50%", minHeight: "0", borderRadius: "0",
      background: "transparent", border: "1px solid rgba(0,0,0,0.15)", color: "rgba(0,0,0,0.35)", fontSize: "20vh", zIndex: "20",
    });
    return b;
  };
  const prompt = h("div", {}, RESPONSE_PROMPT);
  style(prompt, { position: "fixed", left: "0", right: "0", top: "12%", textAlign: "center", zIndex: "25", font: "20px system-ui, sans-serif", color: "rgba(0,0,0,0.6)", pointerEvents: "none" });
  const responseUi = addOverlay(h("div", {}, respBtn("1", "left", 1), respBtn("2", "right", 2), prompt));
  responseUi.style.display = "none";
  const counter = addOverlay(h("div", {}));
  style(counter, { position: "fixed", left: "8px", bottom: "8px", zIndex: "30", font: "24px system-ui, sans-serif", color: "rgba(0,0,0,0.75)", pointerEvents: "none" });
  const message = addOverlay(h("div", {}));
  style(message, { position: "fixed", left: "0", right: "0", top: "70%", textAlign: "center", zIndex: "30", font: "24px system-ui, sans-serif", color: "#111", pointerEvents: "none" });
  const ring = addOverlay(h("div", {}));
  const dpr = window.devicePixelRatio || 1;
  const distanceMm = cal.distanceCm * 10;
  const ppd = pxPerDegree(distanceMm, cal.pxPerMm);
  const ringCssPx = (FIXATION_DEG * ppd) / dpr;
  style(ring, {
    position: "fixed", left: "50%", top: "50%", width: `${ringCssPx}px`, height: `${ringCssPx}px`, boxSizing: "border-box",
    transform: "translate(-50%, -50%)", border: "2px solid rgba(0,0,0,0.85)", borderRadius: "50%", pointerEvents: "none", zIndex: "10", display: "none",
  });
  let fixationOn = false;
  const setFixation = (on: boolean): void => {
    if (on === fixationOn) return;
    fixationOn = on;
    ring.style.display = on ? "block" : "none";
  };
  const confirmStop = (): void => {
    if (confirm("Stop this session?")) stop("stopped by user");
  };
  const stopBtn = h("button", { onclick: confirmStop }, "Stop");
  style(stopBtn, { position: "fixed", top: "8px", right: "8px", zIndex: "60", opacity: "0.6" });
  addOverlay(stopBtn);

  // ---- session state ----
  let sessionRow: SessionRow | null = null;
  const summary: BlockSummaryRow[] = [];
  let totalInvalid = 0;

  // The block in progress, so a stop/abort/error can save its partial counts.
  let currentBlock: { row: BlockRow; id: number; runner: BlockRunner } | null = null;
  const flushBlock = async (): Promise<void> => {
    const cb = currentBlock;
    if (!cb) return;
    const res = cb.runner.result();
    try {
      await ctx.db.put("blocks", {
        ...cb.row,
        id: cb.id,
        threshold: res.threshold,
        reversals: res.reversals,
        validTrials: res.validTrials,
        invalidTrials: res.invalidTrials,
      });
    } catch {
      /* best effort */
    }
  };

  const markAborted = async (reason: string): Promise<void> => {
    if (!sessionRow || sessionRow.status !== "in-progress") return;
    const aborted: SessionRow = { ...sessionRow, status: "aborted", endedAt: new Date().toISOString(), abortReason: reason };
    try {
      await ctx.db.put("sessions", aborted as SessionRow & { id: number });
      sessionRow = aborted;
    } catch {
      /* best effort */
    }
  };

  try {
    const gl = WebGLStimulusRenderer.create(canvas);
    renderer = gl;
    if (!gl) {
      teardown();
      clear(root);
      root.append(h("p", {}, "WebGL2 is required for training on this device."), h("button", { onclick: () => ctx.navigate("start") }, "Back"));
      return;
    }

    // refresh check
    const est = await race(measureRefreshNow());
    const hz = est.hz;
    const notes = [...refreshWarnings(est)];
    if (hz !== cal.hz) notes.push(`Refresh differs from calibration (${hz} vs ${cal.hz} Hz)`);

    // seeds
    const rngSeed = crypto.getRandomValues(new Uint32Array(1))[0];
    const rand = mulberry32(rngSeed);
    const ditherRand = mulberry32((rngSeed ^ 0x9e3779b9) >>> 0);
    const nextDitherSeed = (): number => Math.floor(ditherRand() * 4294967296);

    sessionRow = {
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "in-progress",
      sessionIndex: plan.sessionIndex,
      calibrationId: cal.id ?? null,
      curriculumVersion: ctx.curriculum.version,
      cpd,
      thetaDeg,
      change: plan.change,
      reason: plan.reason,
      rngSeed,
      appVersion: ctx.appVersion,
    };
    const sessionId = await race(ctx.db.add("sessions", sessionRow));
    sessionRow = { ...sessionRow, id: sessionId };

    // geometry
    const lam = lambdaPx(cpd, distanceMm, cal.pxPerMm);
    const sigma = lam;
    const carrier = carrierRad(thetaDeg);
    const drawBlank = (): void =>
      gl.draw({ patches: [], lambdaPx: lam, sigmaPx: sigma, carrierRad: carrier, mean: DEFAULT_MEAN_LUMINANCE, seed: nextDitherSeed() });
    drawBlank();

    const card = (...children: (Node | string)[]): { el: HTMLElement; btn: HTMLButtonElement } => {
      const btn = h("button", { class: "primary" }, "");
      const el = h("div", { class: "overlay-card" }, ...children.map((c) => (typeof c === "string" ? h("p", {}, c) : c)));
      style(el, {
        position: "fixed", inset: "0", zIndex: "50", background: OVERLAY_BG, color: "#111", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "safe center", gap: "0.5rem", padding: "1rem", textAlign: "center", overflow: "auto",
      });
      el.append(btn, h("button", { class: "stop-session", onclick: confirmStop }, "Stop session"));
      return { el, btn };
    };
    const showCard = async (label: string, ...children: (Node | string)[]): Promise<void> => {
      const { el, btn } = card(...children);
      btn.textContent = label;
      addOverlay(el);
      const p = new Promise<void>((res) => btn.addEventListener("click", () => res(), { once: true }));
      if (auto) btn.click();
      try {
        await race(p);
      } finally {
        el.remove();
      }
    };

    const updateCounter = (k: number): void => {
      counter.textContent = `Trial ${k} · invalid timing: ${totalInvalid}`;
    };

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      await showCard(
        "Tap to start",
        h("h2", {}, `Block ${i + 1} of ${blocks.length}`),
        CONDITION_WORDS[block.condition],
        `${block.trials} trials`,
        BLOCK_HINT[block.condition],
        blockExamples(block, thetaDeg, lam, Math.min(170, window.innerHeight * 0.4)),
        "(In the pictures the middle pattern is stronger than in the task; it will get fainter as you go.)",
        ...notes,
      );
      const blockRow: BlockRow = {
        sessionId,
        blockIndex: i,
        condition: block.condition,
        cpd,
        thetaDeg,
        durMs: block.dur_ms,
        trialsPlanned: block.trials,
        flankContrast: block.flank_contrast ?? null,
        nFlankers: block.n_flankers ?? null,
        sepLambda: block.sep_lambda ?? [],
        isiMs: block.isi_ms ?? [],
        threshold: null,
        reversals: [],
        validTrials: 0,
        invalidTrials: 0,
      };
      const blockId = await race(ctx.db.add("blocks", blockRow));
      const runner = new BlockRunner(block, ctx.curriculum.staircase, hz, rand);
      currentBlock = { row: blockRow, id: blockId, runner };
      updateCounter(1);

      while (!runner.done) {
        const s = runner.next();
        const cx = cw / 2;
        const cy = ch / 2;
        const lp = {
          condition: block.condition,
          thetaDeg,
          sepLambda: s.sepLambda ?? 3,
          lambdaPx: lam,
          cx,
          cy,
          targetContrast: s.contrast,
          flankerContrast: block.flank_contrast ?? 0,
          nFlankers: block.n_flankers,
        };
        const frames = expandFrames(s.plan);
        controller = new AbortController();
        let t0 = 0;
        let log: TrialTimingLog;
        try {
          log = await playFrames({
            frames,
            hz,
            signal: controller.signal,
            drawFrame: (f) => {
              gl.draw({ patches: framePatches(f, lp), lambdaPx: lam, sigmaPx: sigma, carrierRad: carrier, mean: DEFAULT_MEAN_LUMINANCE, seed: nextDitherSeed() });
              setFixation(f.showFixation);
            },
            drawEnd: () => {
              drawBlank();
              setFixation(false);
              responseUi.style.display = "block";
              t0 = performance.now();
            },
          });
        } catch (e) {
          controller = null;
          setFixation(false);
          if (stopReason !== null) throw new Stopped(stopReason);
          if (e instanceof Error && e.message === "playback aborted") {
            runner.discard();
            drawBlank();
            await showCard("Tap to continue", "Paused — tap to continue");
            audio.unlock();
            continue;
          }
          throw e;
        }
        controller = null;

        const responded = new Promise<1 | 2>((res) => {
          accept = res;
        });
        if (auto) void waitFrames(1).then(() => respond(s.plan.targetInterval));
        const response = await race(responded);
        const rtMs = performance.now() - t0;
        responseUi.style.display = "none";

        const valid = log.analysis.valid;
        const outcome = runner.record({ response, timingValid: valid });
        if (!valid) totalInvalid++;
        updateCounter(runner.result().attempts + 1);

        const trialRow: TrialRow = {
          sessionId,
          blockId,
          trialIndex: s.trialIndex,
          at: new Date().toISOString(),
          contrast: s.contrast,
          sepLambda: s.sepLambda,
          isiMs: s.isiMs,
          targetInterval: s.plan.targetInterval,
          response,
          correct: outcome.correct,
          rtMs,
          valid,
          timing: toStoredTiming(log),
          flankerContrast: block.flank_contrast ?? null,
        };
        const persist = ctx.db.add("trials", trialRow);
        persist.catch(() => undefined);

        // feedback: every trial, visual and auditory
        if (!valid) {
          message.textContent = "Timing glitch — trial not counted";
        } else {
          if (outcome.correct) audio.correct();
          else audio.wrong();
          ring.style.borderColor = outcome.correct ? "#2ecc71" : "#e74c3c";
          setFixation(true);
        }
        await race(waitFrames(framesFor(FEEDBACK_MS, hz)));
        message.textContent = "";
        setFixation(false);
        ring.style.borderColor = "rgba(0,0,0,0.85)";
        await race(persist);
      }

      const res = runner.result();
      await race(
        ctx.db.put("blocks", {
          ...blockRow,
          id: blockId,
          threshold: res.threshold,
          reversals: res.reversals,
          validTrials: res.validTrials,
          invalidTrials: res.invalidTrials,
        }),
      );
      currentBlock = null;
      const rel = relativeText(res.threshold, pastThresholds(history, block.condition, cpd));
      summary.push({ condition: block.condition, threshold: res.threshold, relative: rel, valid: res.validTrials, invalid: res.invalidTrials });
      drawBlank();
      await showCard(
        i === blocks.length - 1 ? "Finish" : "Next block",
        h("h2", {}, CONDITION_WORDS[block.condition]),
        `Threshold: ${formatContrastPct(res.threshold)}`,
        `Relative to your past blocks: ${rel}`,
        `Valid trials: ${res.validTrials} · invalid timing: ${res.invalidTrials}`,
      );
    }

    const finalRow: SessionRow = {
      ...sessionRow,
      status: quick ? "aborted" : "completed",
      endedAt: new Date().toISOString(),
      ...(quick ? { abortReason: "quick mode (test run)" } : {}),
    };
    await ctx.db.put("sessions", finalRow as SessionRow & { id: number });
    sessionRow = finalRow;
    teardown();

    clear(root);
    root.append(
      h("h1", {}, "Session complete"),
      h(
        "div",
        { class: "scroll" },
        h(
          "table",
          {},
          h("thead", {}, h("tr", {}, ...["Block", "Condition", "Threshold", "Relative index", "Valid", "Invalid timing"].map((t) => h("th", {}, t)))),
          h(
            "tbody",
            {},
            ...summary.map((b, i) =>
              h("tr", {}, ...[String(i + 1), CONDITION_WORDS[b.condition], formatContrastPct(b.threshold), b.relative, String(b.valid), String(b.invalid)].map((t) => h("td", {}, t))),
            ),
          ),
        ),
      ),
      h("p", {}, `Trials with invalid timing (not counted): ${totalInvalid}`),
      ...(quick ? [h("p", { class: "small" }, "Quick test run: not stored as a completed session.")] : []),
      h("div", { class: "row" }, h("button", { class: "primary", onclick: () => ctx.navigate("start") }, "Back to start")),
    );
  } catch (e) {
    const wasStopped = stopReason !== null;
    await flushBlock();
    await markAborted(stopReason ?? `error: ${e instanceof Error ? e.message : String(e)}`);
    teardown();
    if (wasStopped) {
      if (stopReason === "stopped by user") ctx.navigate("start");
    } else {
      clear(root);
      root.append(
        h("p", {}, `Training stopped: ${e instanceof Error ? e.message : String(e)}`),
        h("button", { onclick: () => ctx.navigate("start") }, "Back"),
      );
    }
  } finally {
    teardown();
  }
}
