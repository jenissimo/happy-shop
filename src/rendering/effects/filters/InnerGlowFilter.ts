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
uniform vec4 uGlowColor;
uniform float uSize;
uniform float uOpacity;
uniform float uChoke;
uniform float uSource; // 0=edge, 1=center
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
    float size = max(uSize, 0.0);
    float choke = clamp(uChoke / 100.0, 0.0, 1.0);

    float softA = hsGaussianAlpha(uTexture, vTextureCoord, px, size);
    float minA = 1.0;
    for (float y = -3.0; y <= 3.0; y += 1.0) {
        for (float x = -3.0; x <= 3.0; x += 1.0) {
            vec2 o = vec2(x, y) * (size / 3.0) * px;
            minA = min(minA, texture(uTexture, vTextureCoord + o).a);
        }
    }

    float edgeGlow = src.a * (1.0 - minA);
    float centerGlow = src.a * (1.0 - softA);
    float glowMask = mix(edgeGlow, centerGlow, uSource);
    // Soften edge mask with Gaussian falloff for softer technique feel.
    glowMask = mix(glowMask, src.a * (1.0 - softA), 0.45);
    glowMask = mix(glowMask, step(0.02, glowMask) * src.a, choke);
    glowMask *= uOpacity;

    float t = clamp(glowMask / max(src.a, 1e-4), 0.0, 1.0);
    vec3 srcRgb = src.rgb / max(src.a, 1e-5);
    vec3 outRgb = hsBlendMix(uBlendMode, srcRgb, uGlowColor.rgb, t);
    finalColor = vec4(outRgb * src.a, src.a);
}
`

export type InnerGlowFilterOptions = {
  color?: [number, number, number]
  opacity?: number
  size?: number
  choke?: number
  /** 0 = edge, 1 = center */
  source?: number
  blendMode?: string
  padding?: number
}

/** GPU inner-glow — edge/center + Gaussian soften + blend mode. */
export class InnerGlowFilter extends Filter {
  constructor(options: InnerGlowFilterOptions = {}) {
    const color = options.color ?? [1, 1, 0.6]
    const uniforms = new UniformGroup({
      uGlowColor: { value: [...color, 1], type: 'vec4<f32>' },
      uSize: { value: options.size ?? 5, type: 'f32' },
      uOpacity: { value: options.opacity ?? 0.75, type: 'f32' },
      uChoke: { value: options.choke ?? 0, type: 'f32' },
      uSource: { value: options.source ?? 0, type: 'f32' },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-inner-glow-filter',
      }),
      resources: { innerGlowUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: InnerGlowFilterOptions = {}): void {
    const u = this.resources.innerGlowUniforms.uniforms as {
      uGlowColor: number[]
      uSize: number
      uOpacity: number
      uChoke: number
      uSource: number
      uBlendMode: number
    }
    if (options.color) {
      u.uGlowColor[0] = options.color[0]!
      u.uGlowColor[1] = options.color[1]!
      u.uGlowColor[2] = options.color[2]!
    }
    if (options.size != null) u.uSize = options.size
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.choke != null) u.uChoke = options.choke
    if (options.source != null) u.uSource = options.source
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.padding != null) this.padding = options.padding
  }
}
