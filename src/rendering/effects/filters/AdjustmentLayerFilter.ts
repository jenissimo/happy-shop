import { Filter, GlProgram, Texture, UniformGroup } from 'pixi.js'
import type {
  RenderAdjustment,
  RenderBlendMode,
  RenderLayerMask,
} from '../../contracts/RenderDocumentView'
import { adjustmentUniforms } from '../adjustmentUniforms'
import { GLSL_ADJUSTMENTS } from './AdjustmentFilter'
import type { DocumentTextureTransform } from './BevelEmbossFilter'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import { blendModeToUniform, GLSL_BLEND_MODES } from './shaderCommon'

/**
 * The whole adjustment-layer composite in one pass:
 *
 *   out = mix(backdrop, blend(backdrop, adjust(backdrop)), opacity * mask)
 *
 * The input texture *is* the backdrop (the compositor flattens everything
 * beneath the adjustment layer into it), which is why blending, opacity and
 * the layer mask all belong inside this shader instead of on the sprite: a
 * separate composite would double a semi-transparent backdrop's contribution,
 * and a mask applied as alpha would punch a hole in it. Alpha is passed
 * through untouched — an adjustment layer never adds or removes coverage.
 */
const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uMaskTexture;
uniform highp vec4 uInputSize;
uniform float uMode;
uniform vec3 uParams;
uniform float uOpacity;
uniform float uBlendMode;
uniform float uHasMask;
uniform vec2 uMaskSize;
uniform vec2 uTextureDocumentXAxis;
uniform vec2 uTextureDocumentYAxis;
uniform vec2 uTextureDocumentOffset;
${GLSL_ADJUSTMENTS}
${GLSL_BLEND_MODES}
float hsAdjustmentMaskCoverage(void) {
    if (uHasMask < 0.5) return 1.0;
    vec2 localPx = vTextureCoord * uInputSize.xy;
    vec2 docPx = uTextureDocumentOffset
        + localPx.x * uTextureDocumentXAxis
        + localPx.y * uTextureDocumentYAxis;
    vec2 maskUv = docPx / max(uMaskSize, vec2(1.0));
    if (maskUv.x < 0.0 || maskUv.x > 1.0 || maskUv.y < 0.0 || maskUv.y > 1.0) return 0.0;
    return texture(uMaskTexture, maskUv).r;
}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }
    vec3 backdrop = src.rgb / src.a;
    vec3 adjusted = hsApplyAdjustment(uMode, backdrop, uParams);
    float coverage = clamp(uOpacity, 0.0, 1.0) * hsAdjustmentMaskCoverage();
    vec3 outRgb = hsBlendMix(uBlendMode, backdrop, adjusted, coverage);
    finalColor = vec4(clamp(outRgb, 0.0, 1.0) * src.a, src.a);
}
`

export type AdjustmentLayerFilterOptions = {
  adjustment: RenderAdjustment
  opacity: number
  blendMode: RenderBlendMode
  /** Document -> texture mapping used to sample the (document-space) mask. */
  textureTransform: DocumentTextureTransform
  mask?: RenderLayerMask
}

type AdjustmentLayerUniforms = {
  uMode: number
  uParams: number[]
  uOpacity: number
  uBlendMode: number
  uHasMask: number
  uMaskSize: number[]
  uTextureDocumentXAxis: number[]
  uTextureDocumentYAxis: number[]
  uTextureDocumentOffset: number[]
}

function maskTextureFor(mask: RenderLayerMask | undefined): Texture {
  if (!mask) return Texture.EMPTY
  return Texture.from(
    {
      resource: mask.bitmap,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      addressMode: 'clamp-to-edge',
    },
    true,
  )
}

/** GPU compositor for an adjustment *layer* (`RenderAdjustmentLayerView`). */
export class AdjustmentLayerFilter extends Filter {
  constructor(options: AdjustmentLayerFilterOptions) {
    const { mode, params } = adjustmentUniforms(options.adjustment)
    const maskTexture = maskTextureFor(options.mask)
    const uniforms = new UniformGroup({
      uMode: { value: mode, type: 'f32' },
      uParams: { value: params, type: 'vec3<f32>' },
      uOpacity: { value: options.opacity, type: 'f32' },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
      uHasMask: { value: options.mask ? 1 : 0, type: 'f32' },
      uMaskSize: {
        value: [options.mask?.width ?? 1, options.mask?.height ?? 1],
        type: 'vec2<f32>',
      },
      uTextureDocumentXAxis: { value: options.textureTransform.xAxis, type: 'vec2<f32>' },
      uTextureDocumentYAxis: { value: options.textureTransform.yAxis, type: 'vec2<f32>' },
      uTextureDocumentOffset: { value: options.textureTransform.offset, type: 'vec2<f32>' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-adjustment-layer-filter',
      }),
      resources: {
        adjustmentLayerUniforms: uniforms,
        uMaskTexture: maskTexture.source,
        uMaskSampler: maskTexture.source.style,
      },
      padding: 0,
    })
  }

  /**
   * Uniform-only update. The mask texture is baked in at construction, so the
   * caller must build a new filter when the mask *identity* changes (see
   * `PixiRenderBackend.applyAdjustmentLayer`).
   */
  setParams(options: AdjustmentLayerFilterOptions): void {
    const u = this.resources.adjustmentLayerUniforms.uniforms as AdjustmentLayerUniforms
    const { mode, params } = adjustmentUniforms(options.adjustment)
    u.uMode = mode
    u.uParams[0] = params[0]
    u.uParams[1] = params[1]
    u.uParams[2] = params[2]
    u.uOpacity = options.opacity
    u.uBlendMode = blendModeToUniform(options.blendMode)
    u.uTextureDocumentXAxis[0] = options.textureTransform.xAxis[0]
    u.uTextureDocumentXAxis[1] = options.textureTransform.xAxis[1]
    u.uTextureDocumentYAxis[0] = options.textureTransform.yAxis[0]
    u.uTextureDocumentYAxis[1] = options.textureTransform.yAxis[1]
    u.uTextureDocumentOffset[0] = options.textureTransform.offset[0]
    u.uTextureDocumentOffset[1] = options.textureTransform.offset[1]
  }
}
