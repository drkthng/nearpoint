import { formatContrastPct } from "./results";

export interface ChartSeries {
  label: string;
  points: { x: number; y: number | null }[];
}
export interface ChartOptions {
  width?: number;
  height?: number;
  title?: string;
}

const PALETTE = ["#2a6fdb", "#d1495b", "#2e8b57", "#e08e0b", "#7b4fd1", "#00838f"];
const TICKS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const f = (n: number) => n.toFixed(1);

export function thresholdChartSvg(series: readonly ChartSeries[], o: ChartOptions = {}): string {
  const W = o.width ?? 640;
  const H = o.height ?? 320;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title ?? "Threshold chart")}">`;
  const pts = series.flatMap((s) => s.points.filter((p): p is { x: number; y: number } => p.y !== null && p.y > 0));
  if (pts.length === 0) {
    return `${head}<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="currentColor" font-size="14">No data yet</text></svg>`;
  }
  const ly = pts.map((p) => Math.log10(p.y));
  const yMin = Math.min(...ly) - 0.1;
  const yMax = Math.max(...ly) + 0.1;
  let xMin = Math.min(...pts.map((p) => p.x));
  let xMax = Math.max(...pts.map((p) => p.x));
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  const top = o.title ? 28 : 12;
  const legendH = 8 + 16 * Math.ceil(series.length / 3);
  const m = { l: 56, r: 12, t: top, b: 30 + legendH };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const X = (x: number) => m.l + ((x - xMin) / (xMax - xMin)) * pw;
  const Y = (v: number) => m.t + ((yMax - Math.log10(v)) / (yMax - yMin)) * ph;

  const out: string[] = [head];
  if (o.title) out.push(`<text x="${W / 2}" y="18" text-anchor="middle" fill="currentColor" font-size="14" font-weight="600">${esc(o.title)}</text>`);
  out.push(`<g stroke="currentColor" stroke-opacity="0.2"><line x1="${m.l}" y1="${f(m.t)}" x2="${m.l}" y2="${f(m.t + ph)}"/><line x1="${m.l}" y1="${f(m.t + ph)}" x2="${W - m.r}" y2="${f(m.t + ph)}"/>`);
  for (const t of TICKS) {
    if (Math.log10(t) < yMin || Math.log10(t) > yMax) continue;
    out.push(`<line x1="${m.l}" y1="${f(Y(t))}" x2="${W - m.r}" y2="${f(Y(t))}"/>`);
  }
  out.push(`</g>`);
  for (const t of TICKS) {
    if (Math.log10(t) < yMin || Math.log10(t) > yMax) continue;
    out.push(`<text x="${m.l - 6}" y="${f(Y(t) + 4)}" text-anchor="end" fill="currentColor" font-size="11">${formatContrastPct(t)}</text>`);
  }
  const first = Math.ceil(xMin - 1e-9);
  const last = Math.floor(xMax + 1e-9);
  const stride = Math.max(1, Math.ceil((last - first + 1) / 10));
  for (let x = first; x <= last; x += stride) {
    out.push(`<text x="${f(X(x))}" y="${f(m.t + ph + 16)}" text-anchor="middle" fill="currentColor" font-size="11">${x}</text>`);
  }
  out.push(`<text x="${f(m.l + pw / 2)}" y="${f(m.t + ph + 30)}" text-anchor="middle" fill="currentColor" font-size="11">Session</text>`);
  series.forEach((s, i) => {
    const col = PALETTE[i % PALETTE.length];
    const sp = s.points.filter((p): p is { x: number; y: number } => p.y !== null && p.y > 0);
    if (sp.length >= 2) {
      out.push(`<polyline fill="none" stroke="${col}" stroke-width="2" points="${sp.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(" ")}"/>`);
    }
    for (const p of sp) out.push(`<circle cx="${f(X(p.x))}" cy="${f(Y(p.y))}" r="3" fill="${col}"/>`);
    const lx = m.l + (i % 3) * (pw / 3);
    const ly2 = m.t + ph + 30 + 16 * (Math.floor(i / 3) + 1);
    out.push(`<rect x="${f(lx)}" y="${f(ly2 - 9)}" width="10" height="10" fill="${col}"/><text x="${f(lx + 14)}" y="${f(ly2)}" fill="currentColor" font-size="11">${esc(s.label)}</text>`);
  });
  out.push(`</svg>`);
  return out.join("");
}
