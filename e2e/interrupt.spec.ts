import { expect, test } from "@playwright/test";
import { PHONE, calibrate, readStore, watchErrors, unexpected } from "./helpers";

/**
 * Operator report (3 Nov 2026): rotating the phone or pressing Home during the ANSWER phase left a
 * black screen whose next tap counted as an answer. Now any disturbance discards the round and pauses.
 */
test.use(PHONE);

const PROMPT = "When was the middle filled?";

/** RGB of the screenshot's centre pixel, decoded by the browser itself (no PNG dependency). */
async function centrePixel(page: import("@playwright/test").Page): Promise<number[]> {
  const b64 = (await page.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d")!;
    g.drawImage(bmp, 0, 0);
    return Array.from(g.getImageData(Math.floor(bmp.width / 2), Math.floor(bmp.height / 2), 1, 1).data.slice(0, 3));
  }, b64);
}

test("rotation or leaving the app during the answer phase discards the round and pauses", async ({ page }) => {
  const errs = watchErrors(page);
  // Playwright cannot resize a fullscreen window: keep the page windowed (rotation = viewport change).
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("disabled in test"));
  });
  await calibrate(page);
  await page.goto("./#train?quick=1&trials=3");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Tap to start" }).click();

  // 1) Rotate to portrait while the answer is pending.
  await page.getByText(PROMPT).waitFor({ state: "visible" });
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByText("Turn the phone to landscape.")).toBeVisible();
  await page.setViewportSize(PHONE.viewport);
  const paused = page.getByText(/Paused — the last round was not counted/);
  await expect(paused).toBeVisible();
  await expect(page.getByText(PROMPT)).toBeHidden();
  await page.getByRole("button", { name: "Tap to continue" }).click();

  // The stimulus area is mid-grey again, not black.
  const [r, g, b] = await centrePixel(page);
  expect(r).toBeGreaterThan(90);
  expect(Math.abs(r - g) + Math.abs(r - b)).toBeLessThan(6);

  // 2) "Home" while the answer is pending: the page becomes hidden, then visible again.
  await page.getByText(PROMPT).waitFor({ state: "visible" });
  await page.evaluate(() => {
    const set = (v: string) => Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
    set("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    set("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(paused).toBeVisible();
  await page.getByRole("button", { name: "Tap to continue" }).click();

  // Answer the remaining rounds normally; no interrupted round may be stored.
  for (const end = Date.now() + 150_000; Date.now() < end; ) {
    if (await page.getByRole("heading", { name: "Session complete" }).isVisible()) break;
    const next = page.getByRole("button", { name: /Next block|Finish|Tap to start/ });
    if (await next.isVisible()) { await next.click(); continue; }
    if (await page.getByText(PROMPT).isVisible()) { await page.keyboard.press("1"); continue; }
    await page.waitForTimeout(200);
  }
  await page.getByRole("heading", { name: "Session complete" }).waitFor({ timeout: 60_000 });
  const trials = await readStore<{ response: number | null }>(page, "trials");
  for (const t of trials) expect([1, 2]).toContain(t.response);
  const blocks = await readStore<{ validTrials: number; invalidTrials: number }>(page, "blocks");
  expect(trials.length).toBe(blocks.reduce((a, b) => a + b.validTrials + b.invalidTrials, 0));
  expect(unexpected(errs)).toEqual([]);
});
