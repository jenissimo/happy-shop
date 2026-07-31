import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uAmount;
uniform float uDistribution;
uniform float uMonochromatic;

float hashNoise(vec2 p, float channel) {
    return fract(sin(dot(p + channel, vec2(12.9898, 78.233))) * 43758.5453);
}

float uniformDelta(vec2 p, float channel) {
    return (hashNoise(p, channel) - 0.5) * 2.0;
}

float gaussianDelta(vec2 p, float channel) {
    float u1 = max(hashNoise(p, channel), 1e-6);
    float u2 = hashNoise(p + vec2(17.0, 31.0), channel);
    return (sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2)) / 3.0;
}

float sampleDelta(vec2 p, float channel) {
    return uDistribution > 0.5 ? gaussianDelta(p, channel) : uniformDelta(p, channel);
}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }
    vec2 px = gl_FragCoord.xy;
    vec3 srcRgb = src.rgb / src.a;
    vec3 delta;
    if (uMonochromatic > 0.5) {
        float n = sampleDelta(px, 0.0);
        delta = vec3(n);
    } else {
        delta = vec3(
            sampleDelta(px, 0.0),
            sampleDelta(px, 1.0),
            sampleDelta(px, 2.0)
        );
    }
    vec3 noisy = clamp(srcRgb + delta * uAmount, 0.0, 1.0);
    finalColor = vec4(noisy * src.a, src.a);
}
`

export type NoiseContentFilterOptions = {
  amount?: number
  distribution?: 'uniform' | 'gaussian'
  monochromatic?: boolean
  padding?: number
}

/** GPU content-phase Add Noise — transforms RGB in place, preserves alpha. */
export class NoiseContentFilter extends Filter {
  constructor(options: NoiseContentFilterOptions = {}) {
    const uniforms = new UniformGroup({
      uAmount: { value: options.amount ?? 0, type: 'f32' },
      uDistribution: {
        value: options.distribution === 'gaussian' ? 1 : 0,
        type: 'f32',
      },
      uMonochromatic: { value: options.monochromatic ? 1 : 0, type: 'f32' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-noise-content-filter',
      }),
      resources: { noiseContentUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: NoiseContentFilterOptions = {}): void {
    const u = this.resources.noiseContentUniforms.uniforms as {
      uAmount: number
      uDistribution: number
      uMonochromatic: number
    }
    if (options.amount != null) u.uAmount = options.amount
    if (options.distribution != null) {
      u.uDistribution = options.distribution === 'gaussian' ? 1 : 0
    }
    if (options.monochromatic != null) {
      u.uMonochromatic = options.monochromatic ? 1 : 0
    }
    if (options.padding != null) this.padding = options.padding
  }
}
