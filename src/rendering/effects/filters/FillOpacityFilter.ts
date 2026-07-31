import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uFillOpacity;
uniform float uKeepShape; // 1 = fade RGB only (styles follow); 0 = fade alpha (no styles)

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    float f = clamp(uFillOpacity, 0.0, 1.0);
    if (uKeepShape > 0.5) {
        // With Layer Styles: fade fill pixels, preserve shape alpha for FX sampling.
        finalColor = vec4(src.rgb * f, src.a);
    } else {
        // No styles: PS Fill Opacity = transparent fill (alpha scales).
        finalColor = vec4(src.rgb, src.a * f);
    }
}
`

export type FillOpacityFilterOptions = {
  fillOpacity?: number
  /** When true, keep alpha for subsequent style filters (PS Fill vs Opacity). */
  keepShapeForStyles?: boolean
}

/**
 * Photoshop Fill Opacity.
 * - Alone: scales alpha (layer pixels fade).
 * - With styles: scales RGB, keeps shape alpha so Drop Shadow / Glow stay full strength.
 */
export class FillOpacityFilter extends Filter {
  constructor(
    fillOpacity = 1,
    keepShapeForStyles = false,
  ) {
    const uniforms = new UniformGroup({
      uFillOpacity: { value: fillOpacity, type: 'f32' },
      uKeepShape: { value: keepShapeForStyles ? 1 : 0, type: 'f32' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-fill-opacity-filter',
      }),
      resources: { fillOpacityUniforms: uniforms },
      padding: 0,
    })
  }

  setParams(options: FillOpacityFilterOptions = {}): void {
    const u = this.resources.fillOpacityUniforms.uniforms as {
      uFillOpacity: number
      uKeepShape: number
    }
    if (options.fillOpacity != null) u.uFillOpacity = options.fillOpacity
    if (options.keepShapeForStyles != null) {
      u.uKeepShape = options.keepShapeForStyles ? 1 : 0
    }
  }
}
