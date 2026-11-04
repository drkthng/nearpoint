export interface FeedbackAudio {
  unlock(): void;
  correct(): void;
  wrong(): void;
  /** Soft short tick marking the onset of an observation interval. */
  tick(): void;
}

/**
 * Indices of the first frame of each observation interval (interval 1 and 2), for the interval ticks.
 * Pure (no audio); frames carry `interval` = 0 outside the intervals.
 */
export function intervalOnsets(frames: readonly { interval: number }[]): number[] {
  const out: number[] = [];
  frames.forEach((f, i) => {
    if (f.interval !== 0 && (i === 0 || frames[i - 1].interval !== f.interval)) out.push(i);
  });
  return out;
}

const TICKS_KEY = "nearpoint.intervalTicks";
/** Interval ticks setting (per device, default on). */
export function intervalTicksEnabled(): boolean {
  try {
    return localStorage.getItem(TICKS_KEY) !== "0";
  } catch {
    return true;
  }
}
export function setIntervalTicks(on: boolean): void {
  try {
    localStorage.setItem(TICKS_KEY, on ? "1" : "0");
  } catch {
    /* setting not saved; default applies */
  }
}

const GAIN = 0.15;
const RAMP_S = 0.008;

/** WebAudio feedback tones. Create/unlock on a user gesture; every call is a no-op without AudioContext. */
export function createFeedbackAudio(): FeedbackAudio {
  let ac: AudioContext | null = null;

  function unlock(): void {
    try {
      if (!ac) {
        const Ctor: typeof AudioContext | undefined =
          globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ac = new Ctor();
      }
      if (ac.state === "suspended") void ac.resume().catch(() => undefined);
    } catch {
      ac = null;
    }
  }

  function tone(freq: number, type: OscillatorType, durMs: number, gain = GAIN): void {
    try {
      if (!ac) return;
      const t = ac.currentTime;
      const d = durMs / 1000;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + RAMP_S);
      g.gain.setValueAtTime(gain, t + d - RAMP_S);
      g.gain.linearRampToValueAtTime(0, t + d);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t);
      osc.stop(t + d + 0.01);
    } catch {
      /* audio is optional */
    }
  }

  return {
    unlock,
    correct: () => tone(880, "sine", 80),
    wrong: () => tone(220, "square", 120),
    tick: () => tone(1200, "sine", 30, 0.06),
  };
}
