#version 300 es
// Reference fragment shader (WebGL2). Production shader, driven by src/render/webgl.ts.
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
uniform uint  uSeed;                  // new 32-bit seed every frame
out vec4 outColor;

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
// Uniform in [0, 1): 24 random bits per pixel per frame, keyed by pixel and uSeed.
float dither01(uvec2 px) { return float(pcg(px.x ^ pcg(px.y ^ pcg(uSeed))) >> 8u) * (1.0 / 16777216.0); }

float srgbEncode(float L) {
  L = clamp(L, 0.0, 1.0);
  return L <= 0.0031308 ? 12.92 * L : 1.055 * pow(L, 1.0 / 2.4) - 0.055;
}

void main() {
  // gl_FragCoord is (x + 0.5, H - y - 0.5) for top-left pixel (x, y), so p = (x + 0.5, y + 0.5):
  // the same pixel-centre convention as the CPU renderer.
  vec2 p = vec2(gl_FragCoord.x, uViewportH - gl_FragCoord.y);
  float s = 0.0;
  for (int i = 0; i < MAX_PATCHES; i++) {
    if (i >= uCount) break;
    vec2 d = p - uCenter[i];
    float r2 = dot(d, d);
    if (r2 > 12.25 * uSigma * uSigma) continue; // 3.5 sigma support, same as CPU renderer
    float u = d.x * cos(uCarrier) + d.y * sin(uCarrier);
    s += uContrast[i] * exp(-r2 / (2.0 * uSigma * uSigma)) * cos(6.2831853 * u / uLambda);
  }
  float code = floor(srgbEncode(uMean * (1.0 + s)) * 255.0 + dither01(uvec2(gl_FragCoord.xy)));
  outColor = vec4(vec3(clamp(code, 0.0, 255.0) / 255.0), 1.0);
}
