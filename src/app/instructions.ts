/** Participant instructions for the training task (shown before a session and on block cards). */
import type { Condition } from "../core/protocol";
import { h } from "./dom";

/** What changes per block, in plain words. */
export const BLOCK_HINT: Record<Condition, string> = {
  SINGLE:
    "Only the faint centre patch. It is in one flash; the other flash shows nothing, so you see either “patch, then nothing” or “nothing, then patch”.",
  LM: "Two bright helper patches sit above and below the centre in BOTH flashes. Ignore them: was the faint patch between them in the first or the second flash?",
  CROWD:
    "Eight bright helper patches surround the centre in BOTH flashes. Ignore them: was the faint patch in the middle in the first or the second flash?",
  "BM-T":
    "The faint centre patch is followed quickly by two bright patches (a “mask”) in BOTH flashes. Was the faint patch in the first or the second flash?",
  "BM-LM":
    "Two bright helper patches appear with the faint centre patch and flash again right after it, in BOTH flashes. Was the faint patch in the first or the second flash?",
  "BM-CROWD":
    "Eight bright helper patches appear around the centre and flash again right after it, in BOTH flashes. Was the faint patch in the first or the second flash?",
};

const STEPS: readonly string[] = [
  "Put the phone in the stand at 40 cm, landscape, at eye height. Look at the CENTRE of the screen for the whole block; do not follow anything with your eyes.",
  "Get ready: a small dark ring flashes in the centre (0.2 s). It means “look here now”. Keep looking at that spot after it disappears.",
  "Two very short flashes follow, half a second apart (each about 1/15 s). A faint patch of stripes appears in the centre in exactly ONE of them.",
  "Answer: a faint 1 appears on the left half and a 2 on the right half. Tap the LEFT half if the patch was in the FIRST flash, the RIGHT half if it was in the SECOND flash (or keys 1 / 2).",
  "Feedback: high beep and green ring = correct; low buzz and red ring = wrong. The next trial starts by itself.",
  "The patch gets fainter after two correct answers and stronger after a mistake, so it soon becomes hard and you will be unsure about a third of the time. That is intended. Always guess; there is no “don't know”.",
  "After each block a card shows your threshold (lower = better). Tap “Next block”. “Timing glitch — not counted” means the phone stuttered; just carry on.",
];

/** The full step-by-step explanation of a trial. */
export function trialInstructions(): HTMLElement {
  return h("ol", { class: "steps" }, ...STEPS.map((s) => h("li", {}, s)));
}

export const RESPONSE_PROMPT = "Which flash had the centre patch?  Left = first · Right = second";
