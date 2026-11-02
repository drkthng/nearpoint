/**
 * Linear luminance <-> display code values, plus stochastic ("noisy-bit") rounding.
 * sRGB is a fallback; replace with a measured LUT per device model when available.
 */
export function srgbEncode(linear: number): number {
  const L = Math.min(1, Math.max(0, linear));
  return L <= 0.0031308 ? 12.92 * L : 1.055 * L ** (1 / 2.4) - 0.055;
}

export function srgbDecode(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** Stochastic rounding: E[result] = x exactly, for u ~ U[0,1). */
export function stochasticRound(x: number, u: number): number {
  return Math.floor(x + u);
}

/** Linear luminance (0..1) to an 8-bit code value with noisy-bit dithering. */
export function toCode8(linear: number, u: number): number {
  return Math.min(255, Math.max(0, stochasticRound(srgbEncode(linear) * 255, u)));
}

/** Luminance of a Gabor pixel: L0 * (1 + sum of patch contributions). */
export function gaborValue(
  dx: number,
  dy: number,
  lambda: number,
  sigma: number,
  carrierRad: number,
  contrast: number,
  phase = 0,
): number {
  const u = dx * Math.cos(carrierRad) + dy * Math.sin(carrierRad);
  return contrast * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) * Math.cos((2 * Math.PI * u) / lambda + phase);
}
