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
uniform float uChoke;
uniform float uSource; // 0=edge, 1=center
uniform float uBlendMode;

${GLSL_DISTANCE_FIELD_SAMPLE}
${GLSL_BLEND_MODES}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }

    float resolution = uInputPixel.x * uInputSize.z;
    float size = max(uSize, 0.0) * resolution;
    float choke = clamp(uChoke / 100.0, 0.0, 1.0);
    // Inner glow reads the same field from the inside: how far this texel sits
    // from the outline, which is exactly what the old erosion approximated.
    float inward = max(-hsFieldDistance(vTextureCoord, uInputPixel, src.a), 0.0);

    float solid = size * choke;
    float edge = 1.0 - smoothstep(solid, max(size, solid + 0.5), inward);
    float center = smoothstep(solid, max(size, solid + 0.5), inward);
    float glowMask = mix(edge, center, uSource) * src.a * uOpacity;

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

/** GPU inner-glow — distance-field falloff from the outline + blend mode. */
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
      resources: { innerGlowUniforms: uniforms, ...distanceFieldResources() },
      padding: options.padding ?? 0,
    })
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.resources.innerGlowUniforms.uniforms as { uSize: number }
    const field = renderAlphaDistanceField(
      filterManager,
      input,
      Math.max(u.uSize, 0) * input.source._resolution + 2,
    )
    bindDistanceField(this, field)
    filterManager.applyFilter(this, input, output, clearMode)
    releaseAlphaDistanceField(field)
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
