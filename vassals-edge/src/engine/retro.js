/**
 * retro.js — the Retro Forge pipeline for Vassal's Edge (WebGLRenderer path, three r185).
 *
 * Adapted from threejs-retro-forge/assets/retro-glsl.js. Differences from the skill asset:
 *   - PSXMaterial lights with THREE point lights (up to 4, shared uniform objects) instead of one
 *     directional light, plus an emissive term — the game is torch-lit dungeon space.
 *   - fog, ambient and snap resolution are shared uniform objects: one edit reaches every material.
 *   - the pipeline accepts an overlay callback for the depth-cleared weapon view-model pass.
 *
 * Constraint budget (the spec, written down):
 *   res      short side 240 virtual px, integer upscale, letterboxed remainder
 *   color    RGB555 (32 levels/channel) + canonical 4x4 Bayer, in display space, at res
 *   vertex   snapped to the virtual pixel grid in NDC (w <= 0 guarded)
 *   surface  affine UVs, nearest filtering, 64 px per game-metre
 *   light    per-vertex Gouraud, 4 point lights + ambient + emissive, linear hard fog
 *   signal   CRT TV — barrel, scanlines, aperture mask (>= 3x only), chroma, vignette
 *   anachronism (one, deliberate): real-time halation on the Pale Crystal sources
 */
import * as THREE from 'three';

export const BAYER_GLSL = /* glsl */`
float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
`;
const SRGB_GLSL = /* glsl */`
vec3 linearToSRGB(vec3 c){ return mix(pow(max(c, vec3(0.0)), vec3(0.41666)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308))); }
`;

const PSX_VERT = /* glsl */`
uniform vec2 uSnapRes; uniform float uSnap; uniform float uAffine;
uniform vec3 uLightPos[4]; uniform vec3 uLightCol[4]; uniform float uLightRange[4];
uniform vec3 uAmbient; uniform vec3 uEmissive;
varying vec2 vUVW; varying float vW; varying vec3 vLight; varying float vDepth;
void main(){
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * world;
  vec4 clip = projectionMatrix * mv;
  if (uSnap > 0.5 && clip.w > 1e-4) {                 // snap in NDC, guard w<=0
    vec2 grid = uSnapRes * 0.5; vec3 ndc = clip.xyz / clip.w;
    ndc.xy = floor(ndc.xy * grid + 0.5) / grid; clip.xyz = ndc * clip.w;
  }
  vW = mix(1.0, clip.w, uAffine); vUVW = uv * vW;     // affine: interpolate uv*w and w, divide in fragment
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 L = uAmbient + uEmissive;
  for (int i = 0; i < 4; i++) {
    vec3 d = uLightPos[i] - world.xyz; float dist = length(d);
    float att = clamp(1.0 - dist / uLightRange[i], 0.0, 1.0); att *= att;
    float nd = max(dot(n, d / max(dist, 1e-3)), 0.0);
    L += uLightCol[i] * att * (0.35 + 0.65 * nd);
  }
  vLight = L; vDepth = -mv.z; gl_Position = clip;
}`;
const PSX_FRAG = /* glsl */`
uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uColor; uniform float uAlpha; uniform float uStipple;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUVW; varying float vW; varying vec3 vLight; varying float vDepth;
${BAYER_GLSL}
void main(){
  vec2 t = vUVW / vW;
  vec3 base = uColor; if (uHasMap > 0.5) base *= texture2D(uMap, t).rgb;
  vec3 col = base * vLight;
  float f = clamp((uFogFar - vDepth) / max(uFogFar - uFogNear, 1e-4), 0.0, 1.0);
  col = mix(uFogColor, col, f);
  if (uStipple > 0.5) { if (bayer4(gl_FragCoord.xy) > uAlpha) discard; gl_FragColor = vec4(col, 1.0); }
  else gl_FragColor = vec4(col, uAlpha);
}`;

/** Shared uniform objects — one edit reaches every material. */
export const U = {
  snapRes: { value: new THREE.Vector2(320, 240) }, snap: { value: 1 }, affine: { value: 1 },
  lightPos: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(12, 1.4, 1.6), new THREE.Vector3(4, -2.0, -2.2), new THREE.Vector3(0, -50, 0)] },
  lightCol: { value: [new THREE.Color(1.0, 0.70, 0.40), new THREE.Color(0.55, 0.72, 1.0), new THREE.Color(0.20, 0.36, 0.16), new THREE.Color(0, 0, 0)] },
  lightRange: { value: [9, 10, 7, 1] },
  ambient: { value: new THREE.Color(0.07, 0.07, 0.10) },
  fogColor: { value: new THREE.Color(0.018, 0.02, 0.035) }, fogNear: { value: 2.5 }, fogFar: { value: 13 }
};

export function psxMat(o) {
  o = o || {};
  const m = new THREE.ShaderMaterial({ vertexShader: PSX_VERT, fragmentShader: PSX_FRAG,
    transparent: !o.stipple && (o.opacity !== undefined && o.opacity < 1),
    uniforms: {
      uMap: { value: o.map || null }, uHasMap: { value: o.map ? 1 : 0 },
      uColor: { value: new THREE.Color(o.color !== undefined ? o.color : 0xffffff) },
      uAlpha: { value: o.opacity !== undefined ? o.opacity : 1 }, uStipple: { value: o.stipple ? 1 : 0 },
      uEmissive: { value: new THREE.Color(o.emissive !== undefined ? o.emissive : 0x000000) },
      uSnapRes: U.snapRes, uSnap: U.snap, uAffine: U.affine,
      uLightPos: U.lightPos, uLightCol: U.lightCol, uLightRange: U.lightRange, uAmbient: U.ambient,
      uFogColor: U.fogColor, uFogNear: U.fogNear, uFogFar: U.fogFar
    } });
  if (o.side) m.side = o.side;
  if (o.map) { o.map.magFilter = THREE.NearestFilter; o.map.minFilter = THREE.NearestFilter; o.map.generateMipmaps = false; o.map.needsUpdate = true; }
  return m;
}

/* ---------------- post passes ---------------- */
const QUAD_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLUR_FRAG = /* glsl */`
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uDir; uniform float uThreshold; varying vec2 vUv;
void main(){
  vec3 sum = vec3(0.0); float w[5]; w[0]=0.227; w[1]=0.194; w[2]=0.121; w[3]=0.054; w[4]=0.016;
  for (int i = -4; i <= 4; i++) {
    vec3 s = texture2D(uTex, vUv + uDir * uTexel * float(i)).rgb;
    if (uThreshold >= 0.0) s = max(s - uThreshold, 0.0);
    sum += s * w[int(abs(float(i)))];
  }
  gl_FragColor = vec4(sum, 1.0);
}`;
const QUANT_FRAG = /* glsl */`
uniform sampler2D uScene; uniform sampler2D uHalation; uniform float uHalationAmt; uniform float uExposure;
uniform float uLevels; uniform float uDitherAmt; uniform vec2 uRes; varying vec2 vUv;
${BAYER_GLSL}${SRGB_GLSL}
void main(){
  vec3 col = texture2D(uScene, vUv).rgb * uExposure;
  col += texture2D(uHalation, vUv).rgb * uHalationAmt;
  col = linearToSRGB(clamp(col, 0.0, 8.0));            // dither + quantize in DISPLAY space
  float t = bayer4(vUv * uRes) - 0.5;
  col += t * uDitherAmt / uLevels;
  col = floor(clamp(col, 0.0, 1.0) * (uLevels - 1.0) + 0.5) / (uLevels - 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;
const SIGNAL_FRAG = /* glsl */`
uniform sampler2D uTex; uniform vec2 uOutRes; uniform vec2 uVirtRes; uniform float uCurvature; uniform float uScanline;
uniform float uMask; uniform float uChroma; uniform float uVignette; uniform float uBrightness; varying vec2 vUv;
vec2 barrel(vec2 uv, float k){ uv = uv * 2.0 - 1.0; vec2 off = uv.yx * uv.yx; uv += uv * off * k; return uv * 0.5 + 0.5; }
void main(){
  vec2 uv = uCurvature > 0.0 ? barrel(vUv, uCurvature) : vUv;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 col;
  if (uChroma > 0.0) { float o = uChroma / uOutRes.x;
    col = vec3(texture2D(uTex, uv + vec2(o, 0.0)).r, texture2D(uTex, uv).g, texture2D(uTex, uv - vec2(o, 0.0)).b);
  } else col = texture2D(uTex, uv).rgb;
  if (uScanline > 0.0) { float luma = dot(col, vec3(0.299, 0.587, 0.114));
    float line = sin(uv.y * uVirtRes.y * 3.14159265); float beam = mix(1.0 - uScanline, 1.0, luma);
    col *= mix(1.0, abs(line) * 0.5 + 0.5, 1.0 - beam); }
  if (uMask > 0.0) { float i = mod(gl_FragCoord.x, 3.0);
    vec3 m = i < 1.0 ? vec3(1.0, 0.6, 0.6) : i < 2.0 ? vec3(0.6, 1.0, 0.6) : vec3(0.6, 0.6, 1.0);
    col *= mix(vec3(1.0), m, uMask); }
  if (uVignette > 0.0) { vec2 v = uv * (1.0 - uv.yx); col *= pow(clamp(v.x * v.y * 16.0, 0.0, 1.0), uVignette); }
  gl_FragColor = vec4(clamp(col * uBrightness, 0.0, 1.0), 1.0);
}`;

export class RetroPipeline {
  constructor(renderer, o) {
    this.r = renderer; this.o = o; this.virtualShort = o.virtualShort || 240; renderer.setPixelRatio(1);
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); this.quadCam.position.z = 1;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.sceneRT = new THREE.WebGLRenderTarget(2, 2, Object.assign({ type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false, samples: 0 }, nearest));
    this.quantRT = new THREE.WebGLRenderTarget(2, 2, Object.assign({ depthBuffer: false }, nearest));
    this.blurA = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blurB = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blurMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, uniforms: {
      uTex: { value: null }, uTexel: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) }, uThreshold: { value: 0.75 } } });
    this.quantMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: QUANT_FRAG, uniforms: {
      uScene: { value: null }, uHalation: { value: null }, uHalationAmt: { value: o.halation }, uExposure: { value: 1.0 },
      uLevels: { value: 32 }, uDitherAmt: { value: 1 }, uRes: { value: new THREE.Vector2() } } });
    this.signalMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: SIGNAL_FRAG, uniforms: {
      uTex: { value: null }, uOutRes: { value: new THREE.Vector2() }, uVirtRes: { value: new THREE.Vector2() },
      uCurvature: { value: o.curvature }, uScanline: { value: o.scanline }, uMask: { value: o.mask }, uChroma: { value: o.chroma },
      uVignette: { value: o.vignette }, uBrightness: { value: o.brightness } } });
    this.signalOn = true;
  }
  /** virtual res = output / round(shortSide / virtualShort): integer upscale, tiny letterbox. */
  setSize(outW, outH) {
    this.scale = Math.max(1, Math.round(Math.min(outW, outH) / this.virtualShort));
    this.vw = Math.max(64, Math.floor(outW / this.scale)); this.vh = Math.max(64, Math.floor(outH / this.scale));
    const cw = this.vw * this.scale, ch = this.vh * this.scale;
    this.r.setSize(cw, ch, true);
    this.sceneRT.setSize(this.vw, this.vh); this.quantRT.setSize(this.vw, this.vh);
    this.blurA.setSize(Math.max(1, this.vw >> 1), Math.max(1, this.vh >> 1)); this.blurB.setSize(Math.max(1, this.vw >> 1), Math.max(1, this.vh >> 1));
    this.quantMat.uniforms.uRes.value.set(this.vw, this.vh);
    this.signalMat.uniforms.uOutRes.value.set(cw, ch); this.signalMat.uniforms.uVirtRes.value.set(this.vw, this.vh);
    U.snapRes.value.set(this.vw, this.vh);
    this.setSignal(this.signalOn);
    return { cw, ch, vw: this.vw, vh: this.vh, scale: this.scale };
  }
  setSignal(on) {
    this.signalOn = on; const u = this.signalMat.uniforms, o = this.o;
    u.uCurvature.value = on ? o.curvature : 0; u.uScanline.value = on ? o.scanline : 0;
    u.uMask.value = on && this.scale >= 3 ? o.mask : 0; u.uChroma.value = on ? o.chroma : 0;
    u.uVignette.value = on ? o.vignette : 0; u.uBrightness.value = on ? o.brightness : 1.0;
  }
  blit(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.quadScene, this.quadCam); }
  render(scene, camera, overlay) {
    const r = this.r;
    r.setRenderTarget(this.sceneRT); r.render(scene, camera);
    if (overlay) overlay(r);                                   // view-model pass into the same low-res target
    const bw = this.blurA.width, bh = this.blurA.height, bu = this.blurMat.uniforms;
    bu.uTex.value = this.sceneRT.texture; bu.uTexel.value.set(1 / bw, 1 / bh); bu.uDir.value.set(1, 0); bu.uThreshold.value = 0.75;
    this.blit(this.blurMat, this.blurA);
    bu.uTex.value = this.blurA.texture; bu.uDir.value.set(0, 1); bu.uThreshold.value = -1;
    this.blit(this.blurMat, this.blurB);
    this.quantMat.uniforms.uScene.value = this.sceneRT.texture; this.quantMat.uniforms.uHalation.value = this.blurB.texture;
    this.blit(this.quantMat, this.quantRT);
    this.signalMat.uniforms.uTex.value = this.quantRT.texture;
    this.blit(this.signalMat, null);
  }
}
