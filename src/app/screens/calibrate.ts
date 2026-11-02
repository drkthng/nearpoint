import {
  ID1_CARD_MM,
  blindSpotDistanceMm,
  estimateRefresh,
  pxPerMmFromCard,
  refreshWarnings,
  type RefreshEstimate,
} from "../../core/calibration";
import type { Calibration } from "../../data/schema";
import type { AppContext } from "../context";
import { clear, h } from "../dom";

const CHECKLIST = [
  "Brightness at maximum",
  "Adaptive brightness off",
  "Eye comfort shield off",
  "Motion smoothness: Standard (60 Hz)",
  "Screen mode: Natural",
  "Dim room",
  "No reading glasses (habitual distance correction only)",
  "Phone in a stand at 40 cm, landscape",
];

function measureTimestamps(n: number): Promise<number[]> {
  return new Promise((resolve) => {
    const t: number[] = [];
    const tick = (ts: number) => {
      t.push(ts);
      if (t.length < n) requestAnimationFrame(tick);
      else resolve(t);
    };
    requestAnimationFrame(tick);
  });
}

export async function renderCalibrate(ctx: AppContext, root: HTMLElement): Promise<void> {
  const dpr = window.devicePixelRatio;
  let width = (ID1_CARD_MM.width * 96) / 25.4;
  let refresh: RefreshEstimate | null = null;

  // a) checklist
  const boxes = CHECKLIST.map((label) => {
    const cb = h("input", { type: "checkbox", onchange: update });
    return { cb, row: h("label", { class: "check" }, cb, " " + label) };
  });

  // b) card
  const cardBox = h("div", { class: "cardbox" });
  const range = h("input", { type: "range", min: 200, max: 600, step: 0.25, value: width, oninput: () => setWidth(Number(range.value)) });
  const readout = h("p", { class: "small" });
  function setWidth(w: number) {
    width = Math.min(600, Math.max(200, w));
    range.value = String(width);
    cardBox.style.width = `${width}px`;
    cardBox.style.height = `${(width * ID1_CARD_MM.height) / ID1_CARD_MM.width}px`;
    readout.textContent = `${pxPerMmFromCard(width, dpr).toFixed(3)} px/mm (device px per mm), devicePixelRatio ${dpr}`;
    update();
  }

  // c) distance
  const distance = h("input", { type: "number", min: 25, max: 60, step: 1, value: 40, oninput: update });

  // d) blind spot
  const dot = h("div", { class: "bs-dot" });
  const bsRange = h("input", { type: "range", min: 0, max: 400, step: 1, value: 0, oninput: moveDot });
  const bsOut = h("p", { class: "small" });
  function moveDot() {
    dot.style.left = `${Number(bsRange.value)}px`;
  }
  const bsStage = h("div", { class: "bs-stage" }, h("div", { class: "bs-cross" }, "+"), dot);

  // e) refresh
  const hzOut = h("div", {});
  const hzBtn = h("button", {
    onclick: async () => {
      hzBtn.disabled = true;
      hzBtn.textContent = "Measuring…";
      try {
        refresh = estimateRefresh(await measureTimestamps(121));
        clear(hzOut);
        hzOut.append(
          h("p", {}, `${refresh.hz} Hz (measured ${refresh.hzMeasured.toFixed(1)} Hz)`),
          ...refreshWarnings(refresh).map((w) => h("p", { class: "warn" }, w)),
        );
      } finally {
        hzBtn.disabled = false;
        hzBtn.textContent = "Measure refresh rate";
      }
      update();
    },
  }, "Measure refresh rate");

  // f) save
  const save = h("button", {
    class: "primary",
    onclick: async () => {
      const d = Number(distance.value);
      if (!refresh || !(d >= 25 && d <= 60)) return;
      const row: Calibration = {
        createdAt: new Date().toISOString(),
        pxPerMm: pxPerMmFromCard(width, dpr),
        distanceCm: d,
        hzMeasured: refresh.hzMeasured,
        hz: refresh.hz,
        devicePixelRatio: dpr,
        screenWidthPx: Math.round(screen.width * dpr),
        screenHeightPx: Math.round(screen.height * dpr),
        method: "card",
        userAgent: navigator.userAgent,
      };
      await ctx.db.add("calibrations", row);
      ctx.navigate("start");
    },
  }, "Save calibration");
  function update() {
    const d = Number(distance.value);
    save.disabled = !(boxes.every((b) => b.cb.checked) && refresh && d >= 25 && d <= 60);
  }

  const section = (n: number, title: string, ...kids: (Node | string)[]) =>
    h("section", { class: "card" }, h("h2", {}, `${n}. ${title}`), ...kids.map((k) => (typeof k === "string" ? h("p", {}, k) : k)));

  clear(root);
  root.append(
    h("h1", {}, "Calibration"),
    section(1, "Checklist", ...boxes.map((b) => b.row)),
    section(
      2,
      "Card size",
      "Hold a bank card (ID-1, 85.60 × 53.98 mm) against the screen and adjust until the outline matches the card exactly.",
      cardBox,
      h("div", { class: "row" },
        h("button", { onclick: () => setWidth(width - 0.25) }, "−"),
        range,
        h("button", { onclick: () => setWidth(width + 0.25) }, "+")),
      readout,
    ),
    section(3, "Distance", h("label", {}, "Distance (cm) ", distance),
      "Use a stand. Measure 40 cm from the screen to the bridge of your nose with a tape measure or a 40 cm string."),
    section(4, "Blind-spot check (optional)",
      "Close your left eye, look at the cross with your right eye, and move the slider until the dot disappears.",
      bsStage, bsRange,
      h("button", {
        onclick: () => {
          const off = Number(bsRange.value);
          if (!(off > 0)) { bsOut.textContent = "Move the slider first."; return; }
          const cm = blindSpotDistanceMm(off * dpr, pxPerMmFromCard(width, dpr)) / 10;
          bsOut.textContent = `≈ ${cm.toFixed(0)} cm (rough check)`;
        },
      }, "Dot disappeared"),
      bsOut),
    section(5, "Refresh rate", hzBtn, hzOut),
    section(6, "Save", save),
    h("button", { onclick: () => ctx.navigate("start") }, "Back"),
  );
  setWidth(width);
}
