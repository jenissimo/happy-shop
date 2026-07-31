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
uniform vec4 uSatinColor;
uniform vec2 uOffset;
uniform float uSize;
uniform float uOpacity;
uniform float uInvert;
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

    // Satin ≈ XOR of two offset Gaussian-softened alpha copies.
    float a1 = hsGaussianAlpha(uTexture, vTextureCoord + uOffset * px, px, uSize);
    float a2 = hsGaussianAlpha(uTexture, vTextureCoord - uOffset * px, px, uSize);
    float satin = abs(a1 - a2);
    if (uInvert > 0.5) satin = 1.0 - satin;
    satin *= src.a * uOpacity;

    float t = clamp(satin / max(src.a, 1e-4), 0.0, 1.0);
    vec3 srcRgb = src.rgb / max(src.a, 1e-5);
    vec3 outRgb = hsBlendMix(uBlendMode, srcRgb, uSatinColor.rgb, t);
    finalColor = vec4(outRgb * src.a, src.a);
}
`

export type SatinFilterOptions = {
  color?: [number, number, number]
  opacity?: number
  offsetX?: number
  offsetY?: number
  size?: number
  invert?: boolean
  blendMode?: string
  padding?: number
}

/** GPU satin — Gaussian-softened offset-alpha interference + blend mode. */
export class SatinFilter extends Filter {
  constructor(options: SatinFilterOptions = {}) {
    const color = options.color ?? [0, 0, 0]
    const uniforms = new UniformGroup({
      uSatinColor: { value: [...color, 1], type: 'vec4<f32>' },
      uOffset: {
        value: [options.offsetX ?? 6, options.offsetY ?? 6],
        type: 'vec2<f32>',
      },
      uSize: { value: options.size ?? 7, type: 'f32' },
      uOpacity: { value: options.opacity ?? 0.5, type: 'f32' },
      uInvert: { value: options.invert ? 1 : 0, type: 'f32' },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-satin-filter',
      }),
      resources: { satinUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: SatinFilterOptions = {}): void {
    const u = this.resources.satinUniforms.uniforms as {
      uSatinColor: number[]
      uOffset: number[]
      uSize: number
      uOpacity: number
      uInvert: number
      uBlendMode: number
    }
    if (options.color) {
      u.uSatinColor[0] = options.color[0]!
      u.uSatinColor[1] = options.color[1]!
      u.uSatinColor[2] = options.color[2]!
    }
    if (options.offsetX != null) u.uOffset[0] = options.offsetX
    if (options.offsetY != null) u.uOffset[1] = options.offsetY
    if (options.size != null) u.uSize = options.size
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.invert != null) u.uInvert = options.invert ? 1 : 0
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.padding != null) this.padding = options.padding
  }
}
