import { expect, test } from "@playwright/test";

/** PWA checks that replace Lighthouse's removed PWA category: installability, service worker, offline. */
test("installable, controlled by the service worker, and works offline after the first load", async ({ page, context }) => {
  await page.goto("./");
  await page.getByRole("heading", { name: "nearpoint" }).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // First visit: wait until the worker controls the page (clients.claim on activate).
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 });

  const cdp = await context.newCDPSession(page);
  const inst = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: unknown[] };
  expect(inst.installabilityErrors).toEqual([]);
  const manifest = (await cdp.send("Page.getAppManifest")) as { errors: unknown[]; url: string };
  expect(manifest.errors).toEqual([]);
  expect(manifest.url).toContain("manifest.webmanifest");

  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys.find((k) => k.startsWith("nearpoint-"))!);
    return (await c.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached).toContain("/index.html");
  expect(cached.some((p) => /\/assets\/main-.*\.js$/.test(p))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "nearpoint" }).waitFor();
  await expect(page.getByText("not a medical device")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "#tests";
  });
  await page.getByRole("heading", { name: "Outcome tests" }).waitFor();
  await context.setOffline(false);
});
