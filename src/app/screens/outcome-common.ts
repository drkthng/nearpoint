/** Shared plumbing for the outcome-test screens (not used by training). */
import type { Calibration, OutcomeTestRow } from "../../data/schema";
import type { AppContext } from "../context";
import { h } from "../dom";
import { keepScreenOn } from "../wake-lock";

export class Stopped extends Error {
  constructor(readonly reason: string) {
    super(`stopped: ${reason}`);
  }
}

export function css(el: HTMLElement, s: Partial<CSSStyleDeclaration>): HTMLElement {
  Object.assign(el.style, s);
  return el;
}

/**
 * Stop handling for one test run: `race(p)` rejects with Stopped once `stop()` was called
 * (Stop button, leaving the route, hidden tab). Cleanups run once, in reverse order.
 */
export class TestRun {
  reason: string | null = null;
  private rejectStopped: (e: Stopped) => void = () => undefined;
  private readonly stopped: Promise<never>;
  private readonly cleanups: (() => void)[] = [];
  private disposed = false;
  readonly abort = new Set<AbortController>();

  constructor() {
    this.stopped = new Promise<never>((_, rej) => {
      this.rejectStopped = rej;
    });
    this.stopped.catch(() => undefined);
    const onHash = (): void => this.stop("left the test screen");
    window.addEventListener("hashchange", onHash);
    this.onCleanup(() => window.removeEventListener("hashchange", onHash));
  }

  race<T>(p: Promise<T>): Promise<T> {
    return Promise.race([p, this.stopped]);
  }

  stop(reason: string): void {
    if (this.reason !== null) return;
    this.reason = reason;
    for (const c of this.abort) c.abort();
    this.rejectStopped(new Stopped(reason));
  }

  onCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const fn of this.cleanups.reverse()) {
      try {
        fn();
      } catch {
        /* best effort */
      }
    }
  }
}

/** Latest calibration, or renders a hint and returns undefined. */
export async function needCalibration(ctx: AppContext, root: HTMLElement): Promise<Calibration | undefined> {
  const cal = await ctx.db.latestCalibration();
  if (!cal) {
    root.append(h("p", {}, "No calibration yet. Calibrate first."), h("button", { onclick: () => ctx.navigate("tests") }, "Back"));
  }
  return cal;
}

/** Fullscreen, landscape lock and screen wake lock (all optional); body.training for a bare page. Call from a user gesture. */
export function enterTestDisplay(run: TestRun): void {
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
  run.onCleanup(() => {
    document.body.classList.remove("training");
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch {
      /* ignored */
    }
    releaseWakeLock();
  });
}

/** A fixed overlay element removed at cleanup. */
export function overlay(run: TestRun, root: HTMLElement, el: HTMLElement, s: Partial<CSSStyleDeclaration>): HTMLElement {
  css(el, { position: "fixed", ...s });
  root.append(el);
  run.onCleanup(() => el.remove());
  return el;
}

/** Full-screen card with a primary button; resolves when it is tapped (or immediately in auto mode). */
export async function card(
  run: TestRun,
  root: HTMLElement,
  label: string,
  children: (Node | string)[],
  opts: { auto?: boolean; background?: string } = {},
): Promise<void> {
  const btn = h("button", { class: "primary" }, label);
  const el = h("div", {}, ...children.map((c) => (typeof c === "string" ? h("p", {}, c) : c)), btn);
  css(el, {
    position: "fixed", inset: "0", zIndex: "50", background: opts.background ?? "#fff", color: "#111", display: "flex",
    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "1rem",
    textAlign: "center", overflow: "auto",
  });
  root.append(el);
  const p = new Promise<void>((res) => btn.addEventListener("click", () => res(), { once: true }));
  if (opts.auto) btn.click();
  try {
    await run.race(p);
  } finally {
    el.remove();
  }
}

/** Stop button (top right) with confirmation. */
export function stopButton(run: TestRun, root: HTMLElement): void {
  overlay(run, root, h("button", { onclick: () => { if (confirm("Stop this test?")) run.stop("stopped by user"); } }, "Stop"), {
    top: "8px", right: "8px", zIndex: "60", opacity: "0.7",
  });
}

export async function saveOutcome(ctx: AppContext, row: OutcomeTestRow): Promise<number> {
  return ctx.db.add("outcomeTests", row);
}

/** Pauses the run (via abort controllers) when the page is hidden. */
export function abortWhenHidden(run: TestRun): void {
  const onVis = (): void => {
    if (document.visibilityState === "hidden") for (const c of run.abort) c.abort();
  };
  document.addEventListener("visibilitychange", onVis);
  run.onCleanup(() => document.removeEventListener("visibilitychange", onVis));
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
