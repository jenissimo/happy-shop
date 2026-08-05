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
uniform float uAmount;

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
    vec3 sharp = srcRgb + (srcRgb - blurred) * uAmount;
    sharp = clamp(sharp, 0.0, 1.0);
    finalColor = vec4(sharp * src.a, src.a);
}
`

export type SharpenFilterOptions = {
  amount?: number
  radius?: number
  padding?: number
}

/** GPU content-phase unsharp mask. */
export class SharpenFilter extends Filter {
  constructor(options: SharpenFilterOptions = {}) {
    const uniforms = new UniformGroup({
      uAmount: { value: options.amount ?? 1, type: 'f32' },
      uRadius: { value: options.radius ?? 1, type: 'f32' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-sharpen-content-filter',
      }),
      resources: { sharpenUniforms: uniforms, ...gaussianBlurResources() },
      padding: options.padding ?? 0,
    })
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.resources.sharpenUniforms.uniforms as { uRadius: number }
    withGaussianBlur(
      this,
      filterManager,
      input,
      u.uRadius,
      () => filterManager.applyFilter(this, input, output, clearMode),
      SIGMA_PER_RADIUS,
    )
  }

  setParams(options: SharpenFilterOptions = {}): void {
    const u = this.resources.sharpenUniforms.uniforms as {
      uAmount: number
      uRadius: number
    }
    if (options.amount != null) u.uAmount = options.amount
    if (options.radius != null) u.uRadius = options.radius
    if (options.padding != null) this.padding = options.padding
  }
}
