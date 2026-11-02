import type { FrameSpec } from "./trial";
import { maskPatches, stimulusPatches, type LayoutParams, type Patch } from "./layout";

/**
 * Gabor patches to draw for one frame. Pure.
 * - "stim": target (if this is the target interval) plus flankers of the condition.
 * - "mask": mask flankers only.
 * - every other phase: nothing.
 */
export function framePatches(frame: FrameSpec, lp: Omit<LayoutParams, "targetPresent">): Patch[] {
  if (frame.phase === "stim") return stimulusPatches({ ...lp, targetPresent: frame.showTarget });
  if (frame.phase === "mask") return maskPatches({ ...lp, targetPresent: false });
  return [];
}
