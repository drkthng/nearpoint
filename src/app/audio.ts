export interface FeedbackAudio {
  unlock(): void;
  correct(): void;
  wrong(): void;
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

  function tone(freq: number, type: OscillatorType, durMs: number): void {
    try {
      if (!ac) return;
      const t = ac.currentTime;
      const d = durMs / 1000;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(GAIN, t + RAMP_S);
      g.gain.setValueAtTime(GAIN, t + d - RAMP_S);
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
  };
}
