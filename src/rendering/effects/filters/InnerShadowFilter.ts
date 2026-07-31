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
uniform vec4 uShadowColor;
uniform vec2 uOffset;
uniform float uBlur;
uniform float uOpacity;
uniform float uChoke;
uniform float uBlendMode;

${GLSL_GAUSSIAN_ALPHA}
${GLSL_BLEND_MODES}

void main(void)
{
    vec2 px = uInputSize.zw;
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }

    vec2 shadowUv = vTextureCoord - uOffset * px;
    float shadowA = hsGaussianInverseAlpha(uTexture, shadowUv, px, uBlur);
    float choke = clamp(uChoke / 100.0, 0.0, 1.0);
    shadowA = mix(shadowA, step(0.15, shadowA), choke);
    shadowA *= src.a * uOpacity;

    float t = clamp(shadowA / max(src.a, 1e-4), 0.0, 1.0);
    vec3 srcRgb = src.rgb / max(src.a, 1e-5);
    vec3 outRgb = hsBlendMix(uBlendMode, srcRgb, uShadowColor.rgb, t);
    finalColor = vec4(outRgb * src.a, src.a);
}
`

export type InnerShadowFilterOptions = {
  color?: [number, number, number]
  opacity?: number
  offsetX?: number
  offsetY?: number
  blur?: number
  choke?: number
  blendMode?: string
  padding?: number
}

/** GPU inner-shadow — Gaussian soft inset + effect blend mode. */
export class InnerShadowFilter extends Filter {
  constructor(options: InnerShadowFilterOptions = {}) {
    const color = options.color ?? [0, 0, 0]
    const uniforms = new UniformGroup({
      uShadowColor: { value: [...color, 1], type: 'vec4<f32>' },
      uOffset: {
        value: [options.offsetX ?? 4, options.offsetY ?? 4],
        type: 'vec2<f32>',
      },
      uBlur: { value: options.blur ?? 5, type: 'f32' },
      uOpacity: { value: options.opacity ?? 0.75, type: 'f32' },
      uChoke: { value: options.choke ?? 0, type: 'f32' },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-inner-shadow-filter',
      }),
      resources: { innerShadowUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: InnerShadowFilterOptions = {}): void {
    const u = this.resources.innerShadowUniforms.uniforms as {
      uShadowColor: number[]
      uOffset: number[]
      uBlur: number
      uOpacity: number
      uChoke: number
      uBlendMode: number
    }
    if (options.color) {
      u.uShadowColor[0] = options.color[0]!
      u.uShadowColor[1] = options.color[1]!
      u.uShadowColor[2] = options.color[2]!
    }
    if (options.offsetX != null) u.uOffset[0] = options.offsetX
    if (options.offsetY != null) u.uOffset[1] = options.offsetY
    if (options.blur != null) u.uBlur = options.blur
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.choke != null) u.uChoke = options.choke
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.padding != null) this.padding = options.padding
  }
}
