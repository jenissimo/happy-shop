/**
 * Shared GLSL snippets + TS helpers for Layer Style GPU filters.
 * Gaussian soft edges + Photoshop-like effect blend modes (subset).
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
    case 'normal':
    default:
      return 0
  }
}

/**
 * GLSL: 7×7 separable-weight Gaussian of alpha centered at `uv`.
 * `radius` is the PS Size in pixels; sigma ≈ radius/2.
 */
export const GLSL_GAUSSIAN_ALPHA = `
float hsGaussianAlpha(sampler2D tex, vec2 uv, vec2 px, float radius) {
    float r = max(radius, 0.0);
    if (r < 0.001) {
        return texture(tex, uv).a;
    }
    float sigma = max(r * 0.5, 0.35);
    float sum = 0.0;
    float wsum = 0.0;
    float stepPx = r / 3.0;
    for (float y = -3.0; y <= 3.0; y += 1.0) {
        for (float x = -3.0; x <= 3.0; x += 1.0) {
            float d2 = x * x + y * y;
            float w = exp(-d2 / (2.0 * sigma * sigma));
            vec2 o = vec2(x, y) * stepPx * px;
            sum += texture(tex, uv + o).a * w;
            wsum += w;
        }
    }
    return sum / max(wsum, 1e-4);
}

float hsGaussianInverseAlpha(sampler2D tex, vec2 uv, vec2 px, float radius) {
    return 1.0 - hsGaussianAlpha(tex, uv, px, radius);
}
`

/**
 * GLSL: blend `effectRgb` over `baseRgb` with mode + coverage `t` in [0,1].
 * Modes mirror `RenderBlendMode`: normal, multiply, screen, overlay, darken,
 * lighten, color-dodge, color-burn, hard-light, soft-light, difference,
 * exclusion.
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

vec3 hsBlendChannels(float mode, vec3 base, vec3 blend) {
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
