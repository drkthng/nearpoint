import { describe, expect, it } from "vitest";
import { intervalOnsets } from "./audio";

describe("intervalOnsets", () => {
  it("first frame of each interval (stim, isi and mask frames share the interval number)", () => {
    const f = (interval: number) => ({ interval });
    expect(intervalOnsets([f(0), f(0), f(1), f(1), f(1), f(0), f(0), f(2), f(2)])).toEqual([2, 7]);
    expect(intervalOnsets([f(1), f(1), f(2)])).toEqual([0, 2]);
    expect(intervalOnsets([f(0), f(0)])).toEqual([]);
  });
});
