import { describe, expect, it } from "vitest";
import {
  CONTEXT_ATTRIBUTES,
  FRAGMENT_SHADER_SRC,
  VERTEX_SHADER_SRC,
  backingSize,
  fragCoordToTopLeft,
  packPatches,
} from "./webgl";

describe("packPatches", () => {
  it("packs 3 patches and pads with zeros", () => {
    const p = packPatches([
      { x: 1, y: 2, contrast: 0.1 },
      { x: 3, y: 4, contrast: 0.2 },
      { x: 5, y: 6, contrast: 0.3 },
    ]);
    expect(p.centers.length).toBe(24);
    expect(p.contrasts.length).toBe(12);
    expect(p.count).toBe(3);
    expect(Array.from(p.centers.slice(0, 6))).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 6; i < 24; i++) expect(p.centers[i]).toBe(0);
    expect(p.contrasts[0]).toBeCloseTo(0.1, 6);
    expect(p.contrasts[1]).toBeCloseTo(0.2, 6);
    expect(p.contrasts[2]).toBeCloseTo(0.3, 6);
    for (let i = 3; i < 12; i++) expect(p.contrasts[i]).toBe(0);
  });

  it("handles empty, full and overfull input", () => {
    expect(packPatches([]).count).toBe(0);
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: i, contrast: 0.5 }));
    expect(packPatches(mk(12)).count).toBe(12);
    expect(() => packPatches(mk(13))).toThrow("too many patches: 13 > MAX_PATCHES (12)");
  });
});

describe("shader sources", () => {
  it("satisfies the shader contract", () => {
    expect(FRAGMENT_SHADER_SRC).toContain("const int MAX_PATCHES = 12;");
    expect(FRAGMENT_SHADER_SRC).toMatch(/uniform\s+uint\s+uSeed;/);
    expect(FRAGMENT_SHADER_SRC).toMatch(/precision\s+highp\s+int;/);
    expect(FRAGMENT_SHADER_SRC).toContain("12.25 * uSigma * uSigma");
    for (const n of ["uCount", "uCenter", "uContrast", "uLambda", "uSigma", "uCarrier", "uMean", "uViewportH", "uSeed"]) {
      expect(FRAGMENT_SHADER_SRC).toContain(n);
    }
    // No sin-based hash (the carrier legitimately uses sin(uCarrier)).
    expect(FRAGMENT_SHADER_SRC).not.toMatch(/fract\s*\(\s*sin\s*\(/);
    expect(FRAGMENT_SHADER_SRC).not.toMatch(/sin\s*\([^)]*43758/);
    expect(VERTEX_SHADER_SRC.startsWith("#version 300 es")).toBe(true);
  });
});

describe("coordinates and sizing", () => {
  it("gl_FragCoord maps to top-left pixel centres (x+0.5, y+0.5), matching the CPU renderer", () => {
    const H = 256;
    for (const [x, y] of [[0, 0], [10, 20], [255, 255]] as const) {
      const fragX = x + 0.5;
      const fragY = H - y - 0.5;
      expect(fragCoordToTopLeft(fragX, fragY, H)).toEqual([x + 0.5, y + 0.5]);
    }
  });

  it("backingSize rounds and clamps", () => {
    expect(backingSize(800, 600, 2)).toEqual({ width: 1600, height: 1200 });
    expect(backingSize(333.5, 100, 1.5)).toEqual({ width: 500, height: 150 });
    expect(backingSize(0.1, 0.1, 1)).toEqual({ width: 1, height: 1 });
  });

  it("context attributes disable antialiasing, alpha and buffer preservation", () => {
    expect(CONTEXT_ATTRIBUTES.antialias).toBe(false);
    expect(CONTEXT_ATTRIBUTES.alpha).toBe(false);
    expect(CONTEXT_ATTRIBUTES.premultipliedAlpha).toBe(false);
    expect(CONTEXT_ATTRIBUTES.preserveDrawingBuffer).toBe(false);
  });
});
