import { Filter, GlProgram, Texture, UniformGroup } from 'pixi.js'
import type { DocumentTextureTransform } from './BevelEmbossFilter'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uClipTexture;
uniform highp vec4 uInputSize;
uniform vec2 uClipOrigin;
uniform vec2 uClipSize;
uniform vec2 uTextureDocumentXAxis;
uniform vec2 uTextureDocumentYAxis;
uniform vec2 uTextureDocumentOffset;

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    vec2 localPx = vTextureCoord * uInputSize.xy;
    vec2 docPx = uTextureDocumentOffset
        + localPx.x * uTextureDocumentXAxis
        + localPx.y * uTextureDocumentYAxis;
    vec2 clipUv = (docPx - uClipOrigin) / max(uClipSize, vec2(1.0));
    float coverage = 0.0;
    if (clipUv.x >= 0.0 && clipUv.x <= 1.0 && clipUv.y >= 0.0 && clipUv.y <= 1.0) {
        coverage = texture(uClipTexture, clipUv).a;
    }
    // The input is the *flattened* clipping group (base + clipped run), so the
    // target alpha is the base's alpha, not "current alpha times base alpha" —
    // otherwise a soft-edged base would be squared. Rescaling premultiplied
    // texels by coverage/src.a lands the group on exactly the base's alpha
    // while keeping the composited colour. src.a >= coverage always holds
    // because the base is drawn underneath the run.
    float scale = src.a > 0.0 ? min(1.0, coverage / src.a) : 0.0;
    finalColor = src * scale;
}
`

export type ClipAlphaFilterParams = {
  /** Document-space rect covered by the clip (base) texture. */
  originX: number
  originY: number
  width: number
  height: number
  textureTransform: DocumentTextureTransform
}

/**
 * Photoshop clipping mask: multiplies the source alpha by the alpha of the
 * clipping *base*, sampled in document space.
 *
 * The base alpha arrives as a render texture (the flattened base of a clipping
 * group), not as a document-sized bitmap, hence the origin/size uniforms —
 * otherwise this is the same document-space sampling as `LayerMaskPreFilter`.
 */
export class ClipAlphaFilter extends Filter {
  constructor(clipTexture: Texture, params: ClipAlphaFilterParams) {
    const uniforms = new UniformGroup({
      uClipOrigin: { value: [params.originX, params.originY], type: 'vec2<f32>' },
      uClipSize: { value: [params.width, params.height], type: 'vec2<f32>' },
      uTextureDocumentXAxis: { value: params.textureTransform.xAxis, type: 'vec2<f32>' },
      uTextureDocumentYAxis: { value: params.textureTransform.yAxis, type: 'vec2<f32>' },
      uTextureDocumentOffset: { value: params.textureTransform.offset, type: 'vec2<f32>' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-clip-alpha-filter',
      }),
      resources: {
        clipAlphaUniforms: uniforms,
        uClipTexture: clipTexture.source,
        uClipSampler: clipTexture.source.style,
      },
      padding: 0,
    })
  }

  setParams(params: ClipAlphaFilterParams): void {
    const u = this.resources.clipAlphaUniforms.uniforms as {
      uClipOrigin: Float32Array | number[]
      uClipSize: Float32Array | number[]
      uTextureDocumentXAxis: Float32Array | number[]
      uTextureDocumentYAxis: Float32Array | number[]
      uTextureDocumentOffset: Float32Array | number[]
    }
    u.uClipOrigin[0] = params.originX
    u.uClipOrigin[1] = params.originY
    u.uClipSize[0] = params.width
    u.uClipSize[1] = params.height
    u.uTextureDocumentXAxis[0] = params.textureTransform.xAxis[0]
    u.uTextureDocumentXAxis[1] = params.textureTransform.xAxis[1]
    u.uTextureDocumentYAxis[0] = params.textureTransform.yAxis[0]
    u.uTextureDocumentYAxis[1] = params.textureTransform.yAxis[1]
    u.uTextureDocumentOffset[0] = params.textureTransform.offset[0]
    u.uTextureDocumentOffset[1] = params.textureTransform.offset[1]
  }
}
