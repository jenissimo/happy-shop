import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import {
  blendModeToUniform,
  GLSL_BLEND_MODES,
  GLSL_GAUSSIAN_ALPHA,
} from './shaderCommon'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 uStrokeColor;
uniform float uSize;
uniform float uOpacity;
uniform float uPosition; // 0=outside, 1=center, 2=inside
uniform float uBlendMode;
uniform float uFillOpacity;

${GLSL_GAUSSIAN_ALPHA}
${GLSL_BLEND_MODES}

void main(void)
{
    vec2 px = uInputSize.zw;
    float size = max(uSize, 0.0);
    vec4 src = texture(uTexture, vTextureCoord);
    float shapeA = src.a;
    float fillA = shapeA * clamp(uFillOpacity, 0.0, 1.0);

    float maxA = 0.0;
    float minA = 1.0;
    for (float i = 0.0; i < 16.0; i += 1.0) {
        float ang = i * 0.3926991;
        vec2 o = vec2(cos(ang), sin(ang)) * size * px;
        float a = texture(uTexture, vTextureCoord + o).a;
        maxA = max(maxA, a);
        minA = min(minA, a);
    }
    for (float i = 0.0; i < 8.0; i += 1.0) {
        float ang = i * 0.7853982;
        vec2 o = vec2(cos(ang), sin(ang)) * (size * 0.5) * px;
        float a = texture(uTexture, vTextureCoord + o).a;
        maxA = max(maxA, a);
        minA = min(minA, a);
    }

    // Soften stroke mask edge with a light Gaussian of shape alpha.
    float softA = hsGaussianAlpha(uTexture, vTextureCoord, px, max(size * 0.35, 0.5));

    float strokeMask = 0.0;
    if (uPosition < 0.5) {
        // Use dilated coverage directly; fillA already discounts stroke under the fill.
        // Subtracting shapeA here double-discounts soft glyph edges → gray stroke halo.
        strokeMask = clamp(maxA, 0.0, 1.0);
        strokeMask = mix(strokeMask, clamp(max(maxA, softA), 0.0, 1.0), 0.35);
    } else if (uPosition < 1.5) {
        strokeMask = clamp(maxA - minA, 0.0, 1.0);
    } else {
        strokeMask = shapeA * (1.0 - minA);
        strokeMask = mix(strokeMask, shapeA * (1.0 - softA), 0.35);
    }
    strokeMask *= uOpacity;

    vec3 strokeRgb = uStrokeColor.rgb;
    vec3 srcRgb = shapeA > 1e-5 ? src.rgb / shapeA : src.rgb;
    float outA;
    vec3 outRgb;
    if (uPosition >= 1.5) {
        float t = clamp(strokeMask / max(shapeA, 1e-4), 0.0, 1.0);
        vec3 filled = hsBlendMix(uBlendMode, srcRgb, strokeRgb, t);
        outA = fillA;
        outRgb = filled * outA;
        if (outA <= 0.0) {
            finalColor = vec4(0.0);
            return;
        }
    } else {
        vec3 under = strokeRgb;
        if (fillA > 0.001 && uBlendMode > 0.5) {
            under = hsApplyBlend(uBlendMode, srcRgb, strokeRgb);
        }
        outA = fillA + strokeMask * (1.0 - fillA);
        outRgb = under * strokeMask * (1.0 - fillA) + srcRgb * fillA;
    }

    finalColor = vec4(outRgb, outA);
}
`

export type StrokeFilterOptions = {
  color?: [number, number, number]
  opacity?: number
  size?: number
  /** 0=outside, 1=center, 2=inside */
  position?: number
  blendMode?: string
  fillOpacity?: number
  padding?: number
}

/** GPU stroke/outline — soft edges + blend/fill aware. */
export class StrokeFilter extends Filter {
  constructor(options: StrokeFilterOptions = {}) {
    const color = options.color ?? [0, 0, 0]
    const uniforms = new UniformGroup({
      uStrokeColor: { value: [...color, 1], type: 'vec4<f32>' },
      uSize: { value: options.size ?? 2, type: 'f32' },
      uOpacity: { value: options.opacity ?? 1, type: 'f32' },
      uPosition: { value: options.position ?? 0, type: 'f32' },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
      uFillOpacity: { value: options.fillOpacity ?? 1, type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-stroke-filter',
      }),
      resources: { strokeUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: StrokeFilterOptions): void {
    const u = this.resources.strokeUniforms.uniforms as {
      uStrokeColor: number[]
      uSize: number
      uOpacity: number
      uPosition: number
      uBlendMode: number
      uFillOpacity: number
    }
    if (options.color) {
      u.uStrokeColor[0] = options.color[0]!
      u.uStrokeColor[1] = options.color[1]!
      u.uStrokeColor[2] = options.color[2]!
    }
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.size != null) u.uSize = options.size
    if (options.position != null) u.uPosition = options.position
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.fillOpacity != null) u.uFillOpacity = options.fillOpacity
    if (options.padding != null) this.padding = options.padding
  }
}
