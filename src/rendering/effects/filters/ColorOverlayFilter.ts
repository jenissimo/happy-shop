import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import { blendModeToUniform, GLSL_BLEND_MODES } from './shaderCommon'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uBlendMode;

${GLSL_BLEND_MODES}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }
    vec3 srcRgb = src.a > 1e-5 ? src.rgb / src.a : src.rgb;
    vec3 outRgb = hsBlendMix(uBlendMode, srcRgb, uColor, uOpacity);
    finalColor = vec4(outRgb * src.a, src.a);
}
`

export type ColorOverlayFilterOptions = {
  color?: [number, number, number]
  opacity?: number
  blendMode?: string
  padding?: number
}

/** GPU color overlay with effect blend modes (normal/multiply/screen/overlay). */
export class ColorOverlayFilter extends Filter {
  constructor(options: ColorOverlayFilterOptions = {}) {
    const uniforms = new UniformGroup({
      uColor: { value: options.color ?? [1, 0, 0], type: 'vec3<f32>' },
      uOpacity: { value: options.opacity ?? 1, type: 'f32' },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-color-overlay-filter',
      }),
      resources: { colorOverlayUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: ColorOverlayFilterOptions = {}): void {
    const u = this.resources.colorOverlayUniforms.uniforms as {
      uColor: number[]
      uOpacity: number
      uBlendMode: number
    }
    if (options.color) {
      u.uColor[0] = options.color[0]!
      u.uColor[1] = options.color[1]!
      u.uColor[2] = options.color[2]!
    }
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.padding != null) this.padding = options.padding
  }
}
