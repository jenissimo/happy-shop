import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'

/**
 * GLSL for the `Adjustment` param union, shared by the content-phase effect
 * node (this filter) and by adjustment *layers*
 * (`AdjustmentLayerFilter`), so the two can never drift apart.
 *
 * `hsApplyAdjustment` takes straight (un-premultiplied) RGB.
 * Modes: 0 brightness/contrast, 1 hue/saturation, 2 levels. Anything else is
 * identity — `curves` has no GPU evaluator yet (see `adjustmentCommands.ts`).
 */
export const GLSL_ADJUSTMENTS = `
vec3 applyBrightnessContrast(vec3 rgb, float brightness, float contrast) {
    float b = brightness * 255.0;
    float c = contrast;
    float factor = (259.0 * (c * 255.0 + 255.0)) / (255.0 * (259.0 - c * 255.0));
    vec3 outRgb = factor * (rgb * 255.0 - vec3(128.0)) + vec3(128.0) + vec3(b);
    return clamp(outRgb / 255.0, 0.0, 1.0);
}

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 applyHueSaturation(vec3 rgb, float hueDeg, float saturation, float lightness) {
    vec3 hsv = rgb2hsv(rgb);
    hsv.x = fract(hsv.x + hueDeg / 360.0);
    hsv.y = clamp(hsv.y * (1.0 + saturation), 0.0, 1.0);
    hsv.z = clamp(hsv.z + lightness, 0.0, 1.0);
    return hsv2rgb(hsv);
}

vec3 applyLevels(vec3 rgb, float black, float white, float gamma) {
    float lo = clamp(black, 0.0, 254.0) / 255.0;
    float hi = clamp(max(white, black + 1.0), 1.0, 255.0) / 255.0;
    float g = max(gamma, 0.01);
    vec3 t = clamp((rgb - vec3(lo)) / max(hi - lo, 1e-4), 0.0, 1.0);
    return pow(t, vec3(1.0 / g));
}

vec3 hsApplyAdjustment(float mode, vec3 rgb, vec3 params) {
    if (mode < 0.5) return applyBrightnessContrast(rgb, params.x, params.y);
    if (mode < 1.5) return applyHueSaturation(rgb, params.x, params.y, params.z);
    if (mode < 2.5) return applyLevels(rgb, params.x, params.y, params.z);
    return rgb;
}
`

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uMode;
uniform vec3 uParams;
${GLSL_ADJUSTMENTS}
void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }
    vec3 srcRgb = src.rgb / src.a;
    finalColor = vec4(hsApplyAdjustment(uMode, srcRgb, uParams) * src.a, src.a);
}
`

export type AdjustmentFilterOptions = {
  mode?: 'brightness-contrast' | 'hue-saturation' | 'levels'
  params?: [number, number, number]
  padding?: number
}

/** GPU content-phase adjustment (mirrors AdjustmentLayer param union). */
export class AdjustmentFilter extends Filter {
  constructor(options: AdjustmentFilterOptions = {}) {
    const mode =
      options.mode === 'hue-saturation' ? 1
        : options.mode === 'levels' ? 2
          : 0
    const uniforms = new UniformGroup({
      uMode: { value: mode, type: 'f32' },
      uParams: { value: options.params ?? [0, 0, 0], type: 'vec3<f32>' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-adjustment-content-filter',
      }),
      resources: { adjustmentUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: AdjustmentFilterOptions = {}): void {
    const u = this.resources.adjustmentUniforms.uniforms as {
      uMode: number
      uParams: number[]
    }
    if (options.mode != null) {
      u.uMode =
        options.mode === 'hue-saturation' ? 1
          : options.mode === 'levels' ? 2
            : 0
    }
    if (options.params) {
      u.uParams[0] = options.params[0]!
      u.uParams[1] = options.params[1]!
      u.uParams[2] = options.params[2]!
    }
    if (options.padding != null) this.padding = options.padding
  }
}
