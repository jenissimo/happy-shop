import { Filter, GlProgram, Texture, UniformGroup } from 'pixi.js'
import type { RenderLayerMask } from '../../contracts/RenderDocumentView'
import type { DocumentTextureTransform } from './BevelEmbossFilter'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uMaskTexture;
uniform highp vec4 uInputSize;
uniform vec2 uMaskSize;
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
    vec2 maskUv = docPx / max(uMaskSize, vec2(1.0));
    float coverage = 0.0;
    if (maskUv.x >= 0.0 && maskUv.x <= 1.0 && maskUv.y >= 0.0 && maskUv.y <= 1.0) {
        coverage = texture(uMaskTexture, maskUv).r;
    }
    finalColor = vec4(src.rgb, src.a * coverage);
}
`

/**
 * Multiplies source alpha by a document-space layer mask **before** the FX stack
 * (Photoshop default — effects may extend beyond the mask).
 */
export class LayerMaskPreFilter extends Filter {
  constructor(
    mask: RenderLayerMask,
    textureTransform: DocumentTextureTransform,
  ) {
    const maskTexture = Texture.from(
      {
        resource: mask.bitmap,
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        addressMode: 'clamp-to-edge',
      },
      true,
    )
    const uniforms = new UniformGroup({
      uMaskSize: { value: [mask.width, mask.height], type: 'vec2<f32>' },
      uTextureDocumentXAxis: { value: textureTransform.xAxis, type: 'vec2<f32>' },
      uTextureDocumentYAxis: { value: textureTransform.yAxis, type: 'vec2<f32>' },
      uTextureDocumentOffset: { value: textureTransform.offset, type: 'vec2<f32>' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-layer-mask-pre-filter',
      }),
      resources: {
        maskPreUniforms: uniforms,
        uMaskTexture: maskTexture.source,
        uMaskSampler: maskTexture.source.style,
      },
      padding: 0,
    })
  }
}
