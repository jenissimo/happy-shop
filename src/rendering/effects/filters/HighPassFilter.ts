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
  SIGMA_PER_RADIUS,
  withGaussianBlur,
} from './separableGaussian'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputClamp;

${GLSL_GAUSSIAN_BLUR_SAMPLE}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }
    vec3 srcRgb = src.rgb / src.a;
    vec3 blurred = hsBlurRgb(vTextureCoord, uInputClamp);
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
      resources: { highPassUniforms: uniforms, ...gaussianBlurResources() },
      padding: options.padding ?? 0,
    })
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.resources.highPassUniforms.uniforms as { uRadius: number }
    withGaussianBlur(
      this,
      filterManager,
      input,
      u.uRadius,
      () => filterManager.applyFilter(this, input, output, clearMode),
      SIGMA_PER_RADIUS,
    )
  }

  setParams(options: HighPassFilterOptions = {}): void {
    const u = this.resources.highPassUniforms.uniforms as {
      uRadius: number
    }
    if (options.radius != null) u.uRadius = options.radius
    if (options.padding != null) this.padding = options.padding
  }
}
