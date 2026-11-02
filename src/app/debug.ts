import { pxPerDegree, lambdaPx } from "../core/geometry";
import { carrierRad, maskPatches, stimulusPatches, type LayoutParams } from "../core/layout";
import { mulberry32 } from "../core/rng";
import { renderCpu } from "../render/cpu";
import { compareWithReference, type CompareStats } from "../render/compare";
import { WebGLStimulusRenderer, fitCanvasToDevicePixels } from "../render/webgl";
import { parseDebugParams } from "./debug-params";

const { params, errors } = parseDebugParams(location.search);

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.style.cssText = "position:fixed; inset:0; width:100vw; height:100vh; display:block";
  document.body.appendChild(c);
  return c;
}

const readout = document.createElement("pre");
readout.id = "readout";
readout.style.cssText =
  "position:fixed; top:0; left:0; margin:0; padding:6px 8px; font:11px/1.4 monospace; " +
  "background:rgba(0,0,0,0.7); color:#fff; pointer-events:none; white-space:pre";

let canvas = makeCanvas();
document.body.appendChild(readout);

let gl: WebGLStimulusRenderer | null = null;
let rendererLine = "renderer: CPU (WebGL2 unavailable)";
try {
  gl = WebGLStimulusRenderer.create(canvas);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  rendererLine = `renderer: CPU (WebGL2 error: ${msg})`;
  canvas.remove();
  canvas = makeCanvas();
}
if (gl) rendererLine = "renderer: WebGL2";
const ctx2d = gl ? null : canvas.getContext("2d");

interface DebugResult {
  renderer: "webgl2" | "cpu";
  width: number;
  height: number;
  patches: number;
  lambdaPx: number;
  stats: CompareStats | null;
  error?: string;
}
function publish(r: DebugResult): void {
  (window as unknown as { __nearpointDebug?: DebugResult }).__nearpointDebug = r;
}

const rng = mulberry32(params.seed);
const nextSeed = (): number => Math.floor(rng() * 4294967296);

function render(w: number, h: number): void {
  const distanceMm = params.distanceCm * 10;
  const lines: string[] = ["nearpoint debug — personal research tool, not a medical device; have your eyes examined by a professional", rendererLine];
  try {
    const lam = lambdaPx(params.cpd, distanceMm, params.pxPerMm);
    const sigma = lam;
    const lp: LayoutParams = {
      condition: params.condition,
      thetaDeg: params.thetaDeg,
      sepLambda: params.sepLambda,
      lambdaPx: lam,
      cx: w / 2,
      cy: h / 2,
      targetContrast: params.targetContrast,
      flankerContrast: params.flankerContrast,
      nFlankers: params.nFlankers,
      targetPresent: params.targetPresent,
    };
    const patches = params.frame === "mask" ? maskPatches(lp) : stimulusPatches(lp);
    const seed = nextSeed();
    const common = {
      patches,
      lambdaPx: lam,
      sigmaPx: sigma,
      carrierRad: carrierRad(params.thetaDeg),
      mean: params.mean,
      seed,
    };
    if (gl) {
      gl.draw(common);
      if (params.readback) {
        // Same task as draw(): the drawing buffer is still valid.
        const gpu = gl.readPixels();
        const ref = renderCpu({ width: gpu.width, height: gpu.height, ...common, dither: true });
        const stats = compareWithReference(gpu.rgba, ref.linear, gpu.width, gpu.height, params.mean);
        publish({ renderer: "webgl2", width: gpu.width, height: gpu.height, patches: patches.length, lambdaPx: lam, stats });
        lines.push(`readback: ${stats.ok ? "OK" : "FAIL " + stats.reasons.join("; ")}`);
      }
    } else if (ctx2d) {
      const r = renderCpu({ width: w, height: h, ...common, dither: true });
      ctx2d.putImageData(new ImageData(new Uint8ClampedArray(r.rgba), w, h), 0, 0);
    }
    lines.push(
      `condition: ${params.condition}  frame: ${params.frame}  patches: ${patches.length}`,
      `px/deg: ${pxPerDegree(distanceMm, params.pxPerMm).toFixed(2)}`,
      `λ px: ${lam.toFixed(2)}  σ px: ${sigma.toFixed(2)}`,
    );
  } catch (e) {
    lines.push(`error: ${e instanceof Error ? e.message : String(e)}`);
    if (params.readback) publish({ renderer: gl ? "webgl2" : "cpu", width: w, height: h, patches: 0, lambdaPx: 0, stats: null, error: String(e) });
  }
  if (params.readback && !gl) publish({ renderer: "cpu", width: w, height: h, patches: 0, lambdaPx: 0, stats: null, error: rendererLine });
  lines.push(
    `devicePixelRatio: ${window.devicePixelRatio}`,
    `canvas backing: ${w}×${h}`,
    `cpd ${params.cpd}  θ ${params.thetaDeg}°  sep ${params.sepLambda}λ  tc ${params.targetContrast}  fc ${params.flankerContrast}  mean ${params.mean}`,
  );
  for (const err of errors) lines.push(`error: ${err}`);
  readout.textContent = lines.join("\n");
}

fitCanvasToDevicePixels(canvas, (w, h) => render(w, h));
render(canvas.width, canvas.height);
