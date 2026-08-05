/**
 * Shared GLSL snippets + TS helpers for Layer Style GPU filters.
 * Photoshop-like effect blend modes (subset); soft edges live in
 * `separableGaussian`.
 */

/**
 * Encode every document blend mode for shader uniforms.
 *
 * Effect blend modes deliberately use the same vocabulary as layer blending;
 * falling back to normal here made persisted effect settings inert in the
 * viewport for most modes.
 */
export function blendModeToUniform(mode: string | undefined): number {
  switch (mode) {
    case 'multiply':
      return 1
    case 'screen':
      return 2
    case 'overlay':
      return 3
    case 'darken':
      return 4
    case 'lighten':
      return 5
    case 'color-dodge':
      return 6
    case 'color-burn':
      return 7
    case 'hard-light':
      return 8
    case 'soft-light':
      return 9
    case 'difference':
      return 10
    case 'exclusion':
      return 11
    case 'linear-burn':
      return 12
    case 'darker-color':
      return 13
    case 'linear-dodge':
      return 14
    case 'lighter-color':
      return 15
    case 'vivid-light':
      return 16
    case 'linear-light':
      return 17
    case 'pin-light':
      return 18
    case 'hard-mix':
      return 19
    case 'subtract':
      return 20
    case 'divide':
      return 21
    case 'hue':
      return 22
    case 'saturation':
      return 23
    case 'color':
      return 24
    case 'luminosity':
      return 25
    case 'dissolve':
    case 'pass-through':
    case 'normal':
    default:
      return 0
  }
}

/**
 * GLSL: blend `effectRgb` over `baseRgb` with mode + coverage `t` in [0,1].
 */
export const GLSL_BLEND_MODES = `
vec3 hsBlendMultiply(vec3 base, vec3 blend) {
    return base * blend;
}

vec3 hsBlendScreen(vec3 base, vec3 blend) {
    return 1.0 - (1.0 - base) * (1.0 - blend);
}

float hsBlendOverlayChannel(float base, float blend) {
    return base < 0.5
        ? (2.0 * base * blend)
        : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
}

vec3 hsBlendOverlay(vec3 base, vec3 blend) {
    return vec3(
        hsBlendOverlayChannel(base.r, blend.r),
        hsBlendOverlayChannel(base.g, blend.g),
        hsBlendOverlayChannel(base.b, blend.b)
    );
}

float hsBlendColorDodgeChannel(float base, float blend) {
    return blend >= 0.9999 ? 1.0 : min(1.0, base / max(1.0 - blend, 0.0001));
}

float hsBlendColorBurnChannel(float base, float blend) {
    return blend <= 0.0001 ? 0.0 : 1.0 - min(1.0, (1.0 - base) / blend);
}

float hsBlendHardLightChannel(float base, float blend) {
    return blend < 0.5
        ? 2.0 * base * blend
        : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
}

float hsBlendSoftLightChannel(float base, float blend) {
    float d = base <= 0.25
        ? ((16.0 * base - 12.0) * base + 4.0) * base
        : sqrt(base);
    return blend <= 0.5
        ? base - (1.0 - 2.0 * blend) * base * (1.0 - base)
        : base + (2.0 * blend - 1.0) * (d - base);
}

float hsBlendVividLightChannel(float base, float blend) {
    return blend < 0.5
        ? hsBlendColorBurnChannel(base, 2.0 * blend)
        : hsBlendColorDodgeChannel(base, 2.0 * (blend - 0.5));
}

float hsBlendLinearLightChannel(float base, float blend) {
    return clamp(base + 2.0 * blend - 1.0, 0.0, 1.0);
}

float hsBlendPinLightChannel(float base, float blend) {
    return blend < 0.5
        ? min(base, 2.0 * blend)
        : max(base, 2.0 * (blend - 0.5));
}

vec3 hsRgbToHsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsHsvToRgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hsLuminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 hsSetLuminance(vec3 c, float l) {
    float d = l - hsLuminance(c);
    return c + vec3(d);
}

vec3 hsBlendChannelsExtended(float mode, vec3 base, vec3 blend) {
    if (mode > 24.5) return hsSetLuminance(base, hsLuminance(blend)); // luminosity
    if (mode > 23.5) { // color
        vec3 hsvBase = hsRgbToHsv(base);
        vec3 hsvBlend = hsRgbToHsv(blend);
        return hsHsvToRgb(vec3(hsvBlend.x, hsvBlend.y, hsvBase.z));
    }
    if (mode > 22.5) { // saturation
        vec3 hsvBase = hsRgbToHsv(base);
        vec3 hsvBlend = hsRgbToHsv(blend);
        return hsHsvToRgb(vec3(hsvBase.x, hsvBlend.y, hsvBase.z));
    }
    if (mode > 21.5) { // hue
        vec3 hsvBase = hsRgbToHsv(base);
        vec3 hsvBlend = hsRgbToHsv(blend);
        return hsHsvToRgb(vec3(hsvBlend.x, hsvBase.y, hsvBase.z));
    }
    if (mode > 20.5) return clamp(base / max(blend, vec3(0.0001)), 0.0, 1.0); // divide
    if (mode > 19.5) return max(vec3(0.0), base - blend); // subtract
    if (mode > 18.5) { // hard-mix
        vec3 vl = vec3(
            hsBlendVividLightChannel(base.r, blend.r),
            hsBlendVividLightChannel(base.g, blend.g),
            hsBlendVividLightChannel(base.b, blend.b)
        );
        return vec3(step(0.5, vl.r), step(0.5, vl.g), step(0.5, vl.b));
    }
    if (mode > 17.5) return vec3(
        hsBlendPinLightChannel(base.r, blend.r),
        hsBlendPinLightChannel(base.g, blend.g),
        hsBlendPinLightChannel(base.b, blend.b)
    );
    if (mode > 16.5) return vec3(
        hsBlendLinearLightChannel(base.r, blend.r),
        hsBlendLinearLightChannel(base.g, blend.g),
        hsBlendLinearLightChannel(base.b, blend.b)
    );
    if (mode > 15.5) return vec3(
        hsBlendVividLightChannel(base.r, blend.r),
        hsBlendVividLightChannel(base.g, blend.g),
        hsBlendVividLightChannel(base.b, blend.b)
    );
    if (mode > 14.5) return hsLuminance(base) > hsLuminance(blend) ? base : blend; // lighter-color
    if (mode > 13.5) return min(vec3(1.0), base + blend); // linear-dodge (add)
    if (mode > 12.5) return hsLuminance(base) < hsLuminance(blend) ? base : blend; // darker-color
    if (mode > 11.5) return max(vec3(0.0), base + blend - vec3(1.0)); // linear-burn
    return vec3(-1.0);
}

vec3 hsBlendChannels(float mode, vec3 base, vec3 blend) {
    if (mode > 11.5) return hsBlendChannelsExtended(mode, base, blend);
    if (mode > 10.5) return base + blend - 2.0 * base * blend; // exclusion
    if (mode > 9.5) return abs(base - blend); // difference
    if (mode > 8.5) return vec3(
        hsBlendSoftLightChannel(base.r, blend.r),
        hsBlendSoftLightChannel(base.g, blend.g),
        hsBlendSoftLightChannel(base.b, blend.b)
    );
    if (mode > 7.5) return vec3(
        hsBlendHardLightChannel(base.r, blend.r),
        hsBlendHardLightChannel(base.g, blend.g),
        hsBlendHardLightChannel(base.b, blend.b)
    );
    if (mode > 6.5) return vec3(
        hsBlendColorBurnChannel(base.r, blend.r),
        hsBlendColorBurnChannel(base.g, blend.g),
        hsBlendColorBurnChannel(base.b, blend.b)
    );
    if (mode > 5.5) return vec3(
        hsBlendColorDodgeChannel(base.r, blend.r),
        hsBlendColorDodgeChannel(base.g, blend.g),
        hsBlendColorDodgeChannel(base.b, blend.b)
    );
    if (mode > 4.5) return max(base, blend); // lighten
    if (mode > 3.5) return min(base, blend); // darken
    return vec3(-1.0);
}

vec3 hsApplyBlend(float mode, vec3 base, vec3 blend) {
    if (mode > 3.5) return hsBlendChannels(mode, base, blend);
    if (mode > 2.5) return hsBlendOverlay(base, blend);
    if (mode > 1.5) return hsBlendScreen(base, blend);
    if (mode > 0.5) return hsBlendMultiply(base, blend);
    return blend;
}

vec3 hsBlendMix(float mode, vec3 base, vec3 effectRgb, float t) {
    vec3 blended = hsApplyBlend(mode, base, effectRgb);
    return mix(base, blended, clamp(t, 0.0, 1.0));
}
`
