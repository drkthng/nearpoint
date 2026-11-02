// Thin WebGL2 driver for gabor.frag.glsl. No DOM or browser globals are touched at import time.
import fragSrc from "./gabor.frag.glsl?raw";
import type { Patch } from "../core/layout";

export const MAX_PATCHES = 12; // must equal MAX_PATCHES in the shader
export const FRAGMENT_SHADER_SRC: string = fragSrc;
export const VERTEX_SHADER_SRC: string = `#version 300 es
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  antialias: false,
  alpha: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  depth: false,
  stencil: false,
};

export interface PackedPatches {
  centers: Float32Array;
  contrasts: Float32Array;
  count: number;
}

export function packPatches(patches: readonly Patch[]): PackedPatches {
  if (patches.length > MAX_PATCHES) {
    throw new Error(`too many patches: ${patches.length} > MAX_PATCHES (${MAX_PATCHES})`);
  }
  const centers = new Float32Array(2 * MAX_PATCHES);
  const contrasts = new Float32Array(MAX_PATCHES);
  patches.forEach((p, i) => {
    centers[2 * i] = p.x;
    centers[2 * i + 1] = p.y;
    contrasts[i] = p.contrast;
  });
  return { centers, contrasts, count: patches.length };
}

/** Mirrors the shader: top-left device-pixel coordinates from gl_FragCoord. */
export function fragCoordToTopLeft(fragX: number, fragY: number, viewportH: number): [number, number] {
  return [fragX, viewportH - fragY];
}

export interface GpuFrame {
  patches: readonly Patch[];
  lambdaPx: number;
  sigmaPx?: number;
  carrierRad: number;
  mean: number;
  seed: number;
}

const UNIFORM_NAMES = [
  "uCount",
  "uCenter",
  "uContrast",
  "uLambda",
  "uSigma",
  "uCarrier",
  "uMean",
  "uViewportH",
  "uSeed",
] as const;
type UniformName = (typeof UNIFORM_NAMES)[number];

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader compile failed: createShader returned null");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "";
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

export class WebGLStimulusRenderer {
  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly program: WebGLProgram,
    private readonly vao: WebGLVertexArrayObject,
    private readonly loc: Record<UniformName, WebGLUniformLocation | null>,
  ) {}

  static create(canvas: HTMLCanvasElement): WebGLStimulusRenderer | null {
    const gl = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES) as WebGL2RenderingContext | null;
    if (!gl) return null;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    const program = gl.createProgram();
    if (!program) throw new Error("program link failed: createProgram returned null");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "";
      gl.deleteProgram(program);
      throw new Error(`program link failed: ${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const loc = {} as Record<UniformName, WebGLUniformLocation | null>;
    for (const n of UNIFORM_NAMES) loc[n] = gl.getUniformLocation(program, n);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("createVertexArray returned null");
    return new WebGLStimulusRenderer(gl, program, vao, loc);
  }

  /** The caller must pass a new seed every frame (the dither must not repeat). */
  draw(frame: GpuFrame): void {
    const { gl, loc } = this;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.program);
    const packed = packPatches(frame.patches);
    gl.uniform1i(loc.uCount, packed.count);
    gl.uniform2fv(loc.uCenter, packed.centers);
    gl.uniform1fv(loc.uContrast, packed.contrasts);
    gl.uniform1f(loc.uLambda, frame.lambdaPx);
    gl.uniform1f(loc.uSigma, frame.sigmaPx ?? frame.lambdaPx);
    gl.uniform1f(loc.uCarrier, frame.carrierRad);
    gl.uniform1f(loc.uMean, frame.mean);
    gl.uniform1f(loc.uViewportH, gl.drawingBufferHeight);
    gl.uniform1ui(loc.uSeed, frame.seed >>> 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}

export function backingSize(cssWidth: number, cssHeight: number, dpr: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(cssWidth * dpr)),
    height: Math.max(1, Math.round(cssHeight * dpr)),
  };
}

/** Keeps canvas.width/height at exact device pixels. Returns a function that stops observing. */
export function fitCanvasToDevicePixels(
  canvas: HTMLCanvasElement,
  onResize?: (width: number, height: number) => void,
): () => void {
  const apply = (width: number, height: number): void => {
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    onResize?.(width, height);
  };
  const rect = canvas.getBoundingClientRect();
  const first = backingSize(rect.width, rect.height, window.devicePixelRatio);
  apply(first.width, first.height);

  const observer = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    const dev = entry.devicePixelContentBoxSize?.[0];
    if (dev) {
      apply(Math.max(1, dev.inlineSize), Math.max(1, dev.blockSize));
    } else {
      const cb = entry.contentBoxSize[0];
      const s = backingSize(cb.inlineSize, cb.blockSize, window.devicePixelRatio);
      apply(s.width, s.height);
    }
  });
  try {
    observer.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(canvas);
  }
  return () => observer.disconnect();
}
