import { framesFor, snapRefreshRate } from "./core/geometry";

/** Placeholder entry point: measures the refresh rate so the frame-timing path is exercised from day one. */
function measureRefresh(samples = 60): Promise<number> {
  return new Promise((resolve) => {
    const t: number[] = [];
    const tick = (ts: number) => {
      t.push(ts);
      if (t.length <= samples) requestAnimationFrame(tick);
      else {
        const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
        resolve(1000 / d[Math.floor(d.length / 2)]);
      }
    };
    requestAnimationFrame(tick);
  });
}

measureRefresh().then((raw) => {
  const hz = snapRefreshRate(raw);
  const el = document.getElementById("hz");
  if (el) {
    el.textContent = `Display refresh ≈ ${hz} Hz (measured ${raw.toFixed(1)} Hz). A 68 ms target = ${framesFor(68, hz)} frames.`;
  }
});
