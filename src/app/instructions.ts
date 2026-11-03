/** Participant instructions for the training task (shown before a session and on block cards). */
import type { Condition } from "../core/protocol";
import { h } from "./dom";

/** What to look for in each block, in plain words (shown on the block card above the example pictures). */
export const BLOCK_HINT: Record<Condition, string> = {
  SINGLE:
    "Each round a stripy patch pops up in the middle ONCE: at the first moment or at the second moment (half a second later). Tap LEFT if it came first, RIGHT if it came second.",
  LM: "Each round a stripy band pops up TWICE. One time it has a GAP in the middle (two separate blobs). The other time the gap is FILLED (one long band). Tap LEFT if the gap was filled the first time, RIGHT if the second time.",
  CROWD:
    "Each round a group of stripy blobs pops up TWICE. One time the MIDDLE is empty, the other time the middle is FILLED. Tap LEFT if it was filled the first time, RIGHT if the second time.",
  "BM-T":
    "Each round two stripy blobs pop up TWICE. Just before one of the two times, a fainter patch appears in the middle between them. Tap LEFT if that was the first time, RIGHT if the second time.",
  "BM-LM":
    "Like the block with the gap, but each time the band flickers twice quickly. One time the GAP in the middle is FILLED. Tap LEFT if that was the first time, RIGHT if the second time.",
  "BM-CROWD":
    "Like the group block, but each time the group flickers twice quickly. One time the MIDDLE is FILLED. Tap LEFT if that was the first time, RIGHT if the second time.",
};

const STEPS: readonly string[] = [
  "Phone in the stand, 40 cm away, landscape. Keep your eyes on the MIDDLE of the screen the whole time.",
  "A round starts with a small dark circle in the middle. It means: look here now.",
  "Then the screen shows two very short moments, half a second apart. The striped patterns (they look a bit like an interference pattern) pop up at those moments.",
  "Your job each round: find the faint patch IN THE MIDDLE. It is there at only ONE of the two moments. When there are helper blobs around it, the two moments look alike except for the middle: a gap (empty) or no gap (filled). The block card shows pictures of both.",
  "Then the screen shows 1 (left) and 2 (right). Tap LEFT if the middle pattern came at the first moment, RIGHT if it came at the second moment.",
  "Beep + green circle = right, buzz + red circle = wrong. The next round starts by itself.",
  "Every time you get it right twice, the middle pattern gets fainter. It soon becomes so faint that you are guessing often. That is normal and intended: always pick one.",
];

/** The full step-by-step explanation of a trial. */
export function trialInstructions(): HTMLElement {
  return h("ol", { class: "steps" }, ...STEPS.map((s) => h("li", {}, s)));
}

export const RESPONSE_PROMPT = "When was the middle filled?  Left = first time · Right = second time";
