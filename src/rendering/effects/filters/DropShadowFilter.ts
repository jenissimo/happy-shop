import {
  Filter,
  GlProgram,
  Texture,
  UniformGroup,
  type FilterSystem,
  type RenderSurface,
} from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import {
  gaussianBlurResources,
  GLSL_GAUSSIAN_BLUR_SAMPLE,
  withGaussianBlur,
} from './separableGaussian'
import { blendModeToUniform, GLSL_BLEND_MODES } from './shaderCommon'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uShadowColor;
uniform vec2 uOffset;
uniform float uOpacity;
uniform float uSpread;
uniform float uBlendMode;
uniform float uFillOpacity;
uniform float uKnockOut;

${GLSL_GAUSSIAN_BLUR_SAMPLE}
${GLSL_BLEND_MODES}

void main(void)
{
    vec2 px = uInputSize.zw;
    vec4 src = texture(uTexture, vTextureCoord);
    float shapeA = src.a;
    vec3 srcRgb = shapeA > 1e-5 ? src.rgb / shapeA : src.rgb;
    float fillA = shapeA * clamp(uFillOpacity, 0.0, 1.0);

    vec2 shadowUv = vTextureCoord - uOffset * px;
    float shadowA = hsBlurAlpha(shadowUv, uInputClamp);

    // Spread is the share of the blur that stays fully opaque: dividing the
    // blurred coverage by the remaining head-room pushes the solid core out to
    // the matching iso-contour and compresses the falloff into what is left.
    // 0 leaves the gaussian untouched; 100 makes the shadow a hard dilation
    // reaching as far as the blur did (same reading as Outer Glow's spread).
    float spread = clamp(uSpread / 100.0, 0.0, 1.0);
    shadowA = clamp(shadowA / max(1.0 - spread, 1e-3), 0.0, 1.0) * uOpacity;

    // Layer Knocks Out Drop Shadow: hide shadow under opaque fill shape.
    if (uKnockOut > 0.5) {
        shadowA *= (1.0 - shapeA);
    }

    vec3 shadowRgb = uShadowColor.rgb;
    vec3 under = shadowRgb;
    if (fillA > 0.001 && uBlendMode > 0.5) {
        under = hsApplyBlend(uBlendMode, srcRgb, shadowRgb);
    }

    float outA = fillA + shadowA * (1.0 - fillA);
    vec3 outRgb = srcRgb * fillA + under * shadowA * (1.0 - fillA);
    // Pixi filter IO is premultiplied.
    finalColor = vec4(outRgb, outA);
}
`

export type DropShadowFilterOptions = {
  color?: [number, number, number]
  opacity?: number
  offsetX?: number
  offsetY?: number
  blur?: number
  /** Percent of the blur that stays solid before the falloff starts. */
  spread?: number
  blendMode?: string
  fillOpacity?: number
  knockOut?: boolean
  padding?: number
}

/**
 * GPU drop-shadow — Gaussian soft edge, effect blend modes, Fill Opacity aware.
 */
export class DropShadowFilter extends Filter {
  constructor(options: DropShadowFilterOptions = {}) {
    const color = options.color ?? [0, 0, 0]
    const opacity = options.opacity ?? 0.75
    const offsetX = options.offsetX ?? 4
    const offsetY = options.offsetY ?? 4
    const blur = options.blur ?? 8
    const padding = options.padding ?? 0

    const uniforms = new UniformGroup({
      uShadowColor: { value: [...color, 1], type: 'vec4<f32>' },
      uOffset: { value: [offsetX, offsetY], type: 'vec2<f32>' },
      uBlur: { value: blur, type: 'f32' },
      uOpacity: { value: opacity, type: 'f32' },
      uSpread: { value: options.spread ?? 0, type: 'f32' },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
      uFillOpacity: { value: options.fillOpacity ?? 1, type: 'f32' },
      uKnockOut: { value: options.knockOut === false ? 0 : 1, type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-drop-shadow-filter',
      }),
      resources: { dropShadowUniforms: uniforms, ...gaussianBlurResources() },
      padding,
    })
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.resources.dropShadowUniforms.uniforms as { uBlur: number }
    withGaussianBlur(this, filterManager, input, u.uBlur, () => {
      filterManager.applyFilter(this, input, output, clearMode)
    })
  }

  setParams(options: DropShadowFilterOptions): void {
    const u = this.resources.dropShadowUniforms.uniforms as {
      uShadowColor: number[]
      uOffset: number[]
      uBlur: number
      uOpacity: number
      uSpread: number
      uBlendMode: number
      uFillOpacity: number
      uKnockOut: number
    }
    if (options.color) {
      u.uShadowColor[0] = options.color[0]!
      u.uShadowColor[1] = options.color[1]!
      u.uShadowColor[2] = options.color[2]!
    }
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.offsetX != null) u.uOffset[0] = options.offsetX
    if (options.offsetY != null) u.uOffset[1] = options.offsetY
    if (options.blur != null) u.uBlur = options.blur
    if (options.spread != null) u.uSpread = options.spread
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.fillOpacity != null) u.uFillOpacity = options.fillOpacity
    if (options.knockOut != null) u.uKnockOut = options.knockOut ? 1 : 0
    if (options.padding != null) this.padding = options.padding
  }
}
