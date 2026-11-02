import { expect, test } from "@playwright/test";
import { PHONE, calibrate, readStore, unexpected, watchErrors } from "./helpers";

interface OutcomeRow { kind: string; summary: Record<string, number | string | null>; details: Record<string, unknown> }

test.use(PHONE);

test("outcome tests run in auto mode and store their results", async ({ page }, info) => {
  const errs = watchErrors(page);
  await calibrate(page);
  await page.goto("./#tests");
  await page.getByRole("heading", { name: "Outcome tests" }).waitFor();
  await page.screenshot({ path: info.outputPath("tests-menu.png"), fullPage: true });

  const runs = [
    "acuity?crowding=crowded&timing=unlimited&auto=1",
    "acuity?crowding=uncrowded&timing=timed&auto=1",
    "reading?auto=1",
    "contrast?quick=1&auto=1&trials=4",
  ];
  for (const q of runs) {
    await page.evaluate((h) => {
      location.hash = h;
    }, `#${q}`);
    await page.getByRole("heading", { name: "Result" }).waitFor({ timeout: 180_000 });
    await page.screenshot({ path: info.outputPath(`result-${q.split("?")[0]}-${runs.indexOf(q)}.png`), fullPage: true });
  }

  const rows = await readStore<OutcomeRow>(page, "outcomeTests");
  expect(rows.map((r) => r.kind)).toEqual(["acuity-crowded-unlimited", "acuity-uncrowded-timed", "reading", "contrast"]);
  // The auto responder reads lines ≥ 0.3 logMAR and nothing below: per-letter score 0.3.
  expect(rows[0].summary.logMAR).toBeCloseTo(0.3, 5);
  expect(rows[1].summary.logMAR).toBeCloseTo(0.3, 5);
  expect(rows[1].summary.durationMs).toBe(250);
  // Timed presentations carry their frame logs (N + 1 timestamps).
  const presented = rows[1].details.presented as { shown: { timing?: { segments: { frames: number }[]; timestamps: number[] } }[] }[];
  const timings = presented.flatMap((p) => p.shown.map((s) => s.timing)).filter((t) => t !== undefined);
  expect(timings.length).toBeGreaterThan(0);
  for (const t of timings) expect(t!.timestamps).toHaveLength(t!.segments.reduce((a, s) => a + s.frames, 0) + 1);
  expect(rows[2].summary.readingAcuity).toBeCloseTo(0.3, 5);
  expect(rows[3].summary.testRun).toBe("quick");
  for (const r of rows) expect(r.summary.testRun ?? null).not.toBeNull();

  // History hides test runs.
  await page.goto("./#history");
  await page.getByRole("heading", { name: "Outcome tests" }).waitFor();
  await expect(page.getByText("No outcome tests yet.")).toBeVisible();
  expect(unexpected(errs)).toEqual([]);
});

test("printable chart opens as an SVG download", async ({ page }) => {
  await page.goto("./#tests");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download chart A (SVG)" }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe("nearpoint-near-chart-A-40cm.svg");
});
