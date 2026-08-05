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
uniform vec4 uGlowColor;
uniform float uSize;
uniform float uOpacity;
uniform float uSpread;
uniform float uBlendMode;
uniform float uFillOpacity;

${GLSL_DISTANCE_FIELD_SAMPLE}
${GLSL_BLEND_MODES}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    float shapeA = src.a;
    float fillA = shapeA * clamp(uFillOpacity, 0.0, 1.0);

    float resolution = uInputPixel.x * uInputSize.z;
    float size = max(uSize, 0.0) * resolution;
    float spread = clamp(uSpread / 100.0, 0.0, 1.0);
    float dist = hsFieldDistance(vTextureCoord, uInputPixel, shapeA);

    // Spread is the fraction of the reach that stays fully opaque before the
    // falloff starts; at 100% the glow becomes a hard dilation of the shape.
    float solid = size * spread;
    float glowA = 1.0 - smoothstep(solid, max(size, solid + 0.5), dist);
    glowA = clamp(glowA, 0.0, 1.0) * uOpacity;

    vec3 glowRgb = uGlowColor.rgb;
    vec3 srcRgb = shapeA > 1e-5 ? src.rgb / shapeA : src.rgb;
    vec3 under = glowRgb;
    if (fillA > 0.001 && uBlendMode > 0.5) {
        under = hsApplyBlend(uBlendMode, srcRgb, glowRgb);
    }

    float outA = fillA + glowA * (1.0 - fillA);
    vec3 outRgb = srcRgb * fillA + under * glowA * (1.0 - fillA);
    finalColor = vec4(outRgb, outA);
}
`

export type OuterGlowFilterOptions = {
  color?: [number, number, number]
  opacity?: number
  size?: number
  spread?: number
  blendMode?: string
  fillOpacity?: number
  padding?: number
}

/** GPU outer-glow — distance-field falloff; blend/fill aware. */
export class OuterGlowFilter extends Filter {
  constructor(options: OuterGlowFilterOptions = {}) {
    const color = options.color ?? [1, 1, 0.6]
    const uniforms = new UniformGroup({
      uGlowColor: { value: [...color, 1], type: 'vec4<f32>' },
      uSize: { value: options.size ?? 8, type: 'f32' },
      uOpacity: { value: options.opacity ?? 0.75, type: 'f32' },
      uSpread: { value: options.spread ?? 0, type: 'f32' },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
      uFillOpacity: { value: options.fillOpacity ?? 1, type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-outer-glow-filter',
      }),
      resources: { outerGlowUniforms: uniforms, ...distanceFieldResources() },
      padding: options.padding ?? 0,
    })
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.resources.outerGlowUniforms.uniforms as { uSize: number }
    const field = renderAlphaDistanceField(
      filterManager,
      input,
      Math.max(u.uSize, 0) * input.source._resolution + 2,
    )
    bindDistanceField(this, field)
    filterManager.applyFilter(this, input, output, clearMode)
    releaseAlphaDistanceField(field)
  }

  setParams(options: OuterGlowFilterOptions = {}): void {
    const u = this.resources.outerGlowUniforms.uniforms as {
      uGlowColor: number[]
      uSize: number
      uOpacity: number
      uSpread: number
      uBlendMode: number
      uFillOpacity: number
    }
    if (options.color) {
      u.uGlowColor[0] = options.color[0]!
      u.uGlowColor[1] = options.color[1]!
      u.uGlowColor[2] = options.color[2]!
    }
    if (options.size != null) u.uSize = options.size
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.spread != null) u.uSpread = options.spread
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.fillOpacity != null) u.uFillOpacity = options.fillOpacity
    if (options.padding != null) this.padding = options.padding
  }
}
