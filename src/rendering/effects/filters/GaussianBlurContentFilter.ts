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
    vec3 blurred = hsBlurRgb(vTextureCoord, uInputClamp);
    finalColor = vec4(blurred * src.a, src.a);
}
`

export type GaussianBlurContentFilterOptions = {
  radius?: number
  padding?: number
}

/** GPU content-phase Gaussian blur — transforms RGB in place, preserves alpha. */
export class GaussianBlurContentFilter extends Filter {
  constructor(options: GaussianBlurContentFilterOptions = {}) {
    const uniforms = new UniformGroup({
      uRadius: { value: options.radius ?? 0, type: 'f32' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-gaussian-blur-content-filter',
      }),
      resources: { gaussianBlurUniforms: uniforms, ...gaussianBlurResources() },
      padding: options.padding ?? 0,
    })
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.resources.gaussianBlurUniforms.uniforms as { uRadius: number }
    withGaussianBlur(
      this,
      filterManager,
      input,
      u.uRadius,
      () => filterManager.applyFilter(this, input, output, clearMode),
      SIGMA_PER_RADIUS,
    )
  }

  setParams(options: GaussianBlurContentFilterOptions = {}): void {
    const u = this.resources.gaussianBlurUniforms.uniforms as { uRadius: number }
    if (options.radius != null) u.uRadius = options.radius
    if (options.padding != null) this.padding = options.padding
  }
}
