import {
  Filter,
  GlProgram,
  Texture,
  UniformGroup,
  type FilterSystem,
  type RenderSurface,
} from 'pixi.js'
import {
  bindDistanceField,
  distanceFieldResources,
  GLSL_DISTANCE_FIELD_SAMPLE,
  releaseAlphaDistanceField,
  renderAlphaDistanceField,
} from './alphaDistanceField'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import { blendModeToUniform, GLSL_BLEND_MODES } from './shaderCommon'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uInputPixel;
uniform vec4 uStrokeColor;
uniform float uSize;
uniform float uOpacity;
uniform float uPosition; // 0=outside, 1=center, 2=inside
uniform float uBlendMode;
uniform float uFillOpacity;

${GLSL_DISTANCE_FIELD_SAMPLE}
${GLSL_BLEND_MODES}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    float shapeA = src.a;
    float fillA = shapeA * clamp(uFillOpacity, 0.0, 1.0);

    // Sizes arrive in pass pixels; the field is measured in device texels.
    float resolution = uInputPixel.x * uInputSize.z;
    float size = max(uSize, 0.0) * resolution;
    float dist = hsFieldDistance(vTextureCoord, uInputPixel, shapeA);

    // One texel of ramp either side of the threshold — the same width the
    // glyph's own antialiasing occupies, so small strokes stay smooth.
    float strokeMask;
    if (uPosition < 0.5) {
        strokeMask = 1.0 - smoothstep(size - 0.5, size + 0.5, dist);
    } else if (uPosition < 1.5) {
        // Centre straddles the outline: half the width in, half out.
        float halfSize = size * 0.5;
        strokeMask = 1.0 - smoothstep(halfSize - 0.5, halfSize + 0.5, abs(dist));
    } else {
        strokeMask = shapeA * smoothstep(-size - 0.5, -size + 0.5, dist);
    }
    strokeMask = clamp(strokeMask, 0.0, 1.0) * uOpacity;

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

/** GPU stroke/outline — distance-field edge + blend/fill aware. */
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
      resources: { strokeUniforms: uniforms, ...distanceFieldResources() },
      padding: options.padding ?? 0,
    })
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.resources.strokeUniforms.uniforms as { uSize: number }
    // The flood has to resolve distances out to the threshold plus the
    // antialiasing ramp; the size is in pass pixels, the field in device texels.
    const field = renderAlphaDistanceField(
      filterManager,
      input,
      Math.max(u.uSize, 0) * input.source._resolution + 2,
    )
    bindDistanceField(this, field)
    filterManager.applyFilter(this, input, output, clearMode)
    releaseAlphaDistanceField(field)
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
