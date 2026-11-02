#version 300 es
// Reference fragment shader (WebGL2). Session S1 turns this into the production renderer.
// Contract: identical math to src/core/luminance.ts gaborValue + toCode8, so the CPU reference
// renderer can be used to test GPU output pixel-for-pixel (within dithering noise).
precision highp float;

const int MAX_PATCHES = 12;
uniform int   uCount;
uniform vec2  uCenter[MAX_PATCHES];   // device px, origin top-left (convert from gl_FragCoord)
uniform float uContrast[MAX_PATCHES]; // Michelson contrast per patch
uniform float uLambda;                // px per cycle
uniform float uSigma;                 // px
uniform float uCarrier;               // carrier direction, rad
uniform float uMean;                  // mean luminance, linear 0..1
uniform float uViewportH;             // for y flip
uniform float uSeed;                  // new per frame
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }

float srgbEncode(float L) {
  L = clamp(L, 0.0, 1.0);
  return L <= 0.0031308 ? 12.92 * L : 1.055 * pow(L, 1.0 / 2.4) - 0.055;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uViewportH - gl_FragCoord.y);
  float s = 0.0;
  for (int i = 0; i < MAX_PATCHES; i++) {
    if (i >= uCount) break;
    vec2 d = p - uCenter[i];
    float u = d.x * cos(uCarrier) + d.y * sin(uCarrier);
    s += uContrast[i] * exp(-dot(d, d) / (2.0 * uSigma * uSigma)) * cos(6.2831853 * u / uLambda);
  }
  float code = floor(srgbEncode(uMean * (1.0 + s)) * 255.0 + hash(gl_FragCoord.xy));
  outColor = vec4(vec3(clamp(code, 0.0, 255.0) / 255.0), 1.0);
}
