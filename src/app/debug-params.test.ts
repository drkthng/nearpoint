import { describe, expect, it } from "vitest";
import { DEBUG_DEFAULTS, parseDebugParams } from "./debug-params";

describe("parseDebugParams", () => {
  it("returns defaults for an empty query", () => {
    const r = parseDebugParams("");
    expect(r.params).toEqual(DEBUG_DEFAULTS);
    expect(r.errors).toEqual([]);
    expect(DEBUG_DEFAULTS.pxPerMm).toBeCloseTo(16.378, 3); // S24, 416 ppi
    expect(DEBUG_DEFAULTS.mean).toBe(0.214);
  });

  it("parses all valid values", () => {
    const r = parseDebugParams(
      "?condition=CROWD&cpd=6&theta=45&sep=2.5&tc=0.02&fc=0.4&nflank=4&distanceCm=35&pxPerMm=10&mean=0.3&seed=9&frame=mask&present=0&readback=1",
    );
    expect(r.errors).toEqual([]);
    expect(r.params).toEqual({
      condition: "CROWD",
      cpd: 6,
      thetaDeg: 45,
      sepLambda: 2.5,
      targetContrast: 0.02,
      flankerContrast: 0.4,
      nFlankers: 4,
      distanceCm: 35,
      pxPerMm: 10,
      mean: 0.3,
      seed: 9,
      frame: "mask",
      targetPresent: false,
      readback: true,
    });
  });

  it("falls back to defaults and reports invalid values", () => {
    const r = parseDebugParams("?cpd=abc&condition=FOO&tc=2&nflank=2.5&frame=x&present=maybe&cpd2=1");
    expect(r.params).toEqual(DEBUG_DEFAULTS);
    expect([...r.errors].sort()).toEqual(
      [
        "invalid cpd: abc",
        "invalid condition: FOO",
        "invalid tc: 2",
        "invalid nflank: 2.5",
        "invalid frame: x",
        "invalid present: maybe",
      ].sort(),
    );
  });

  it("treats an empty value as invalid", () => {
    expect(parseDebugParams("?cpd=").errors).toEqual(["invalid cpd: "]);
  });
});
