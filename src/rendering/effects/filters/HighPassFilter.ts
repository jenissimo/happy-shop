import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import { GLSL_GAUSSIAN_ALPHA } from './shaderCommon'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uRadius;

${GLSL_GAUSSIAN_ALPHA}

vec3 hsGaussianRgb(sampler2D tex, vec2 uv, vec2 px, float radius) {
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    float r = max(radius, 0.0);
    if (r < 0.001) {
        vec4 src = texture(tex, uv);
        return src.a > 1e-5 ? src.rgb / src.a : src.rgb;
    }
    float sigma = max(r * 0.5, 0.35);
    float stepPx = r / 3.0;
    for (float y = -3.0; y <= 3.0; y += 1.0) {
        for (float x = -3.0; x <= 3.0; x += 1.0) {
            float d2 = x * x + y * y;
            float w = exp(-d2 / (2.0 * sigma * sigma));
            vec2 o = vec2(x, y) * stepPx * px;
            vec4 s = texture(tex, uv + o);
            vec3 rgb = s.a > 1e-5 ? s.rgb / s.a : s.rgb;
            sum += rgb * w;
            wsum += w;
        }
    }
    return sum / max(wsum, 1e-4);
}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }
    vec2 px = uInputSize.zw;
    vec3 srcRgb = src.rgb / src.a;
    vec3 blurred = hsGaussianRgb(uTexture, vTextureCoord, px, uRadius);
    // Photoshop High Pass: original minus low-frequency blur, offset by 0.5 (neutral grey)
    vec3 highPass = vec3(0.5) + (srcRgb - blurred);
    highPass = clamp(highPass, 0.0, 1.0);
    finalColor = vec4(highPass * src.a, src.a);
}
`

export type HighPassFilterOptions = {
  radius?: number
  padding?: number
}

/** GPU content-phase High Pass filter (Frequency Separation). */
export class HighPassFilter extends Filter {
  constructor(options: HighPassFilterOptions = {}) {
    const uniforms = new UniformGroup({
      uRadius: { value: options.radius ?? 10, type: 'f32' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-high-pass-filter',
      }),
      resources: { highPassUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: HighPassFilterOptions = {}): void {
    const u = this.resources.highPassUniforms.uniforms as {
      uRadius: number
    }
    if (options.radius != null) u.uRadius = options.radius
    if (options.padding != null) this.padding = options.padding
  }
}
