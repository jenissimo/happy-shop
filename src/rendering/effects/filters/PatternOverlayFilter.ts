import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import { blendModeToUniform, GLSL_BLEND_MODES } from './shaderCommon'
import { PATTERN_GLSL } from '../patterns'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uOpacity;
uniform float uScale;
uniform float uAngle;
uniform float uPattern; // 0=checker, 1=stripes, 2=dots, 3=noise
uniform float uInvert;
uniform vec2 uOffset;
uniform float uBlendMode;

${GLSL_BLEND_MODES}

${PATTERN_GLSL}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }

    float pat = hsSamplePattern(vTextureCoord * uInputSize.xy, uScale, uAngle, uPattern, uInvert, uOffset);

    vec3 patRgb = mix(vec3(0.15), vec3(0.85), pat);
    vec3 srcRgb = src.a > 1e-5 ? src.rgb / src.a : src.rgb;
    vec3 outRgb = hsBlendMix(uBlendMode, srcRgb, patRgb, uOpacity);
    finalColor = vec4(outRgb * src.a, src.a);
}
`

export type PatternOverlayFilterOptions = {
  opacity?: number
  scale?: number
  angle?: number
  pattern?: 'checker' | 'stripes' | 'dots' | 'noise'
  invert?: boolean
  offsetX?: number
  offsetY?: number
  blendMode?: string
  padding?: number
}

function patternUniform(
  pattern: PatternOverlayFilterOptions['pattern'],
): number {
  switch (pattern) {
    case 'stripes':
      return 1
    case 'dots':
      return 2
    case 'noise':
      return 3
    default:
      return 0
  }
}

/** GPU pattern overlay — procedural stub + blend modes. */
export class PatternOverlayFilter extends Filter {
  constructor(options: PatternOverlayFilterOptions = {}) {
    const uniforms = new UniformGroup({
      uOpacity: { value: options.opacity ?? 1, type: 'f32' },
      uScale: { value: options.scale ?? 100, type: 'f32' },
      uAngle: { value: options.angle ?? 0, type: 'f32' },
      uPattern: { value: patternUniform(options.pattern), type: 'f32' },
      uInvert: { value: options.invert ? 1 : 0, type: 'f32' },
      uOffset: {
        value: [options.offsetX ?? 0, options.offsetY ?? 0],
        type: 'vec2<f32>',
      },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-pattern-overlay-filter',
      }),
      resources: { patternOverlayUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: PatternOverlayFilterOptions = {}): void {
    const u = this.resources.patternOverlayUniforms.uniforms as {
      uOpacity: number
      uScale: number
      uAngle: number
      uPattern: number
      uInvert: number
      uOffset: number[]
      uBlendMode: number
    }
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.scale != null) u.uScale = options.scale
    if (options.angle != null) u.uAngle = options.angle
    if (options.pattern != null) u.uPattern = patternUniform(options.pattern)
    if (options.invert != null) u.uInvert = options.invert ? 1 : 0
    if (options.offsetX != null) u.uOffset[0] = options.offsetX
    if (options.offsetY != null) u.uOffset[1] = options.offsetY
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.padding != null) this.padding = options.padding
  }
}
