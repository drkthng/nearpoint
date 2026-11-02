import { expect, type Page } from "@playwright/test";

/** Galaxy S24-like landscape viewport (CSS px) and device pixel ratio. */
export const PHONE = { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, hasTouch: true };

/** Collects page errors and console errors (expected browser warnings are filtered by the caller). */
export function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(`console: ${m.text()}`);
  });
  return errs;
}

/** Errors that headless auto mode produces by design (no user gesture for fullscreen / audio). */
export function unexpected(errs: readonly string[]): string[] {
  return errs.filter((e) => !/fullscreen|AudioContext|wake ?lock|orientation|Permissions/i.test(e));
}

/** Calibrates through the UI: checklist, refresh measurement, save (card size left at its default). */
export async function calibrate(page: Page): Promise<void> {
  await page.goto("./#calibrate");
  await page.getByRole("heading", { name: "Calibration" }).waitFor();
  for (const cb of await page.locator("input[type=checkbox]").all()) await cb.check();
  await page.getByRole("button", { name: "Measure refresh rate" }).click();
  const save = page.getByRole("button", { name: "Save calibration" });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  await page.getByRole("heading", { name: "nearpoint" }).waitFor();
}

/** All rows of an IndexedDB object store of the app database. */
export function readStore<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (s) =>
      new Promise<T[]>((resolve, reject) => {
        const r = indexedDB.open("nearpoint");
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const g = r.result.transaction(s).objectStore(s).getAll();
          g.onsuccess = () => {
            r.result.close();
            resolve(g.result as T[]);
          };
          g.onerror = () => reject(g.error);
        };
      }),
    store,
  );
}
