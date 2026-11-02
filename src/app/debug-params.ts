import type { Condition } from "../core/protocol";
import { DEFAULT_MEAN_LUMINANCE } from "../render/cpu";

export interface DebugParams {
  condition: Condition;
  cpd: number;
  thetaDeg: number;
  sepLambda: number;
  targetContrast: number;
  flankerContrast: number;
  nFlankers: number;
  distanceCm: number;
  pxPerMm: number;
  mean: number;
  seed: number;
  frame: "target" | "mask";
  targetPresent: boolean;
}

export const DEBUG_DEFAULTS: DebugParams = {
  condition: "LM",
  cpd: 4,
  thetaDeg: 0,
  sepLambda: 3,
  targetContrast: 0.1,
  flankerContrast: 0.6,
  nFlankers: 8,
  distanceCm: 40,
  pxPerMm: 416 / 25.4, // Galaxy S24: 416 ppi (0.061 mm pitch); calibrate for real use
  mean: DEFAULT_MEAN_LUMINANCE,
  seed: 1,
  frame: "target",
  targetPresent: true,
};

const CONDITIONS: readonly string[] = ["SINGLE", "LM", "CROWD", "BM-T", "BM-LM", "BM-CROWD"];

export function parseDebugParams(search: string): { params: DebugParams; errors: string[] } {
  const q = new URLSearchParams(search);
  const params: DebugParams = { ...DEBUG_DEFAULTS };
  const errors: string[] = [];

  // Returns the parsed value, or undefined if missing/invalid (recording the error when invalid).
  const get = <T>(key: string, parse: (raw: string) => T | undefined): T | undefined => {
    const raw = q.get(key);
    if (raw === null) return undefined;
    const v = parse(raw);
    if (v === undefined) errors.push(`invalid ${key}: ${raw}`);
    return v;
  };
  const num = (ok: (n: number) => boolean) => (raw: string): number | undefined => {
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && ok(n) ? n : undefined;
  };

  params.condition = (get("condition", (r) => (CONDITIONS.includes(r) ? (r as Condition) : undefined))
    ?? params.condition);
  params.cpd = get("cpd", num((n) => n > 0)) ?? params.cpd;
  params.thetaDeg = get("theta", num(() => true)) ?? params.thetaDeg;
  params.sepLambda = get("sep", num((n) => n > 0)) ?? params.sepLambda;
  params.targetContrast = get("tc", num((n) => n >= 0 && n <= 1)) ?? params.targetContrast;
  params.flankerContrast = get("fc", num((n) => n >= 0 && n <= 1)) ?? params.flankerContrast;
  params.nFlankers = get("nflank", num((n) => Number.isInteger(n))) ?? params.nFlankers;
  params.distanceCm = get("distanceCm", num((n) => n > 0)) ?? params.distanceCm;
  params.pxPerMm = get("pxPerMm", num((n) => n > 0)) ?? params.pxPerMm;
  params.mean = get("mean", num((n) => n >= 0 && n <= 1)) ?? params.mean;
  params.seed = get("seed", num((n) => Number.isInteger(n))) ?? params.seed;
  params.frame = get("frame", (r) => (r === "target" || r === "mask" ? r : undefined)) ?? params.frame;
  params.targetPresent = get("present", (r) =>
    r === "0" || r === "false" ? false : r === "1" || r === "true" ? true : undefined,
  ) ?? params.targetPresent;

  return { params, errors };
}
