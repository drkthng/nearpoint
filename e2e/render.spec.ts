import { expect, test } from "@playwright/test";

/**
 * GPU (WebGL2 shader under SwiftShader) vs CPU reference renderer for every condition. The debug page
 * reads the GPU frame back in the draw task and compares it with renderCpu() statistically
 * (src/render/compare.ts): grey, residual within one code value, unbiased, local means agree.
 */
const CASES: { name: string; query: string }[] = [
  { name: "SINGLE", query: "condition=SINGLE&tc=0.3" },
  { name: "LM", query: "condition=LM&tc=0.2&fc=0.6&sep=3" },
  { name: "CROWD", query: "condition=CROWD&tc=0.2&fc=0.6&sep=3&nflank=8&theta=45" },
  { name: "BM-T mask", query: "condition=BM-T&frame=mask&fc=0.6&theta=90" },
  { name: "BM-LM", query: "condition=BM-LM&tc=0.1&fc=0.6&theta=135" },
  { name: "BM-CROWD mask", query: "condition=BM-CROWD&frame=mask&fc=0.6&nflank=4" },
  { name: "low contrast", query: "condition=SINGLE&tc=0.004" },
  { name: "blank interval", query: "condition=LM&present=0" },
];

test.use({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 });

for (const c of CASES) {
  test(`GPU matches CPU reference: ${c.name}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    // pxPerMm 4 keeps the patches small enough to fit the 480 × 320 test canvas.
    await page.goto(`./debug.html?${c.query}&pxPerMm=4&seed=7&readback=1`);
    const handle = await page.waitForFunction(() => (window as unknown as { __nearpointDebug?: unknown }).__nearpointDebug ?? null);
    const r = (await handle.jsonValue()) as {
      renderer: string;
      width: number;
      height: number;
      patches: number;
      stats: { ok: boolean; reasons: string[]; stimulusPixels: number; maxResidual: number; meanResidual: number; maxBlockError: number; residualSd: number } | null;
      error?: string;
    };
    await page.screenshot({ path: info.outputPath(`${c.name.replace(/\s+/g, "-")}.png`) });
    await info.attach("stats", { body: JSON.stringify(r, null, 2), contentType: "application/json" });
    expect(errors.filter((e) => /shader|program|WebGL/i.test(e))).toEqual([]);
    expect(r.error).toBeUndefined();
    expect(r.renderer).toBe("webgl2");
    expect(await page.locator("#readout").innerText()).toContain("renderer: WebGL2");
    expect(r.width).toBe(480);
    expect(r.height).toBe(320);
    expect(r.stats?.reasons).toEqual([]);
    expect(r.stats?.ok).toBe(true);
    if (!c.name.startsWith("blank") || r.patches > 0) expect(r.stats!.stimulusPixels).toBeGreaterThan(100);
  });
}
