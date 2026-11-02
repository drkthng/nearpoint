import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Staircase, convergencePoint } from "./staircase";
import { DEFAULT_OBSERVER, makeObserver, weibull, weibullInverse } from "./observer";
import { mulberry32 } from "./rng";
import { framesFor, lambdaPx, mmPerDegree, snapRefreshRate } from "./geometry";
import { srgbDecode, srgbEncode, stochasticRound, toCode8 } from "./luminance";
import { type Curriculum, validateCurriculum } from "./protocol";

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("staircase vs simulated observer", () => {
  for (const down of [2, 3]) {
    it(`${down}-down/1-up recovers the observer's ${(convergencePoint(down) * 100).toFixed(1)} % point`, () => {
      const truth = weibullInverse(convergencePoint(down), DEFAULT_OBSERVER);
      const ests: number[] = [];
      for (let seed = 1; seed <= 200; seed++) {
        const obs = makeObserver(DEFAULT_OBSERVER, mulberry32(seed));
        const s = new Staircase({ start: 0.3, down });
        for (let t = 0; t < 300; t++) s.update(obs(s.contrast));
        const th = s.threshold();
        expect(th).not.toBeNull();
        ests.push(th as number);
      }
      const ratio = median(ests) / truth;
      expect(ratio).toBeGreaterThan(0.8);
      expect(ratio).toBeLessThan(1.2);
    });
  }

  it("respects floor and ceiling", () => {
    const s = new Staircase({ start: 0.5, floor: 0.01, ceil: 0.6 });
    for (let i = 0; i < 100; i++) s.update(true);
    expect(s.contrast).toBeCloseTo(0.01, 6);
    for (let i = 0; i < 100; i++) s.update(false);
    expect(s.contrast).toBeCloseTo(0.6, 6);
  });

  it("weibull and its inverse agree", () => {
    for (const pc of [0.6, 0.707, 0.8, 0.9]) {
      expect(weibull(weibullInverse(pc, DEFAULT_OBSERVER), DEFAULT_OBSERVER)).toBeCloseTo(pc, 9);
    }
  });
});

describe("geometry and timing", () => {
  it("one degree at 40 cm is ~6.98 mm", () => {
    expect(mmPerDegree(400)).toBeCloseTo(6.981, 3);
  });

  it("8 cpd at 40 cm on a 0.078 mm pixel pitch is ~11 px per cycle (2016 iOS study)", () => {
    expect(lambdaPx(8, 400, 1 / 0.078)).toBeCloseTo(11.19, 1);
  });

  it("published durations are whole frames at 60 Hz", () => {
    expect([34, 68, 116].map((ms) => framesFor(ms, 60))).toEqual([2, 4, 7]);
    expect([68, 83, 116, 150].map((ms) => framesFor(ms, 60))).toEqual([4, 5, 7, 9]);
  });

  it("frame counts double on 120 Hz panels", () => {
    expect([34, 68, 116].map((ms) => framesFor(ms, 120))).toEqual([4, 8, 14]);
  });

  it("snaps measured refresh rates", () => {
    expect(snapRefreshRate(59.94)).toBe(60);
    expect(snapRefreshRate(119.6)).toBe(120);
  });
});

describe("luminance encoding and dithering", () => {
  it("sRGB encode/decode round-trips", () => {
    for (const L of [0, 0.001, 0.05, 0.214, 0.5, 1]) expect(srgbDecode(srgbEncode(L))).toBeCloseTo(L, 9);
  });

  it("stochastic rounding is unbiased", () => {
    const rand = mulberry32(42);
    const x = 127.3;
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += stochasticRound(x, rand());
    expect(Math.abs(sum / n - x)).toBeLessThan(0.01);
  });

  it("a 0.5 % contrast step survives 8-bit output on average", () => {
    const rand = mulberry32(7);
    const mean = 0.214;
    const n = 200_000;
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      a += srgbDecode(toCode8(mean, rand()) / 255);
      b += srgbDecode(toCode8(mean * 1.005, rand()) / 255);
    }
    const measured = (b - a) / a;
    expect(measured).toBeGreaterThan(0.004);
    expect(measured).toBeLessThan(0.006);
  });
});

describe("curriculum", () => {
  it("docs/curriculum.json is valid", () => {
    const c = JSON.parse(readFileSync("docs/curriculum.json", "utf8")) as Curriculum;
    expect(validateCurriculum(c)).toEqual([]);
  });

  it("flags a masked block without ISIs", () => {
    const c = JSON.parse(readFileSync("docs/curriculum.json", "utf8")) as Curriculum;
    delete c.session_template[2].isi_ms;
    expect(validateCurriculum(c).join()).toMatch(/isi_ms required/);
  });
});
