import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import type { DocumentTextureTransform } from './BevelEmbossFilter'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uOpacity;
uniform vec2 uTextureDocumentXAxis;
uniform vec2 uTextureDocumentYAxis;
uniform vec2 uTextureDocumentOffset;

// Deterministic per-document-pixel hash: no seed churn, so the pattern is
// stable across frames (Photoshop only reshuffles on re-rasterize).
float dissolveNoise(vec2 p)
{
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    vec2 localPx = vTextureCoord * uInputSize.xy;
    vec2 docPx = uTextureDocumentOffset
        + localPx.x * uTextureDocumentXAxis
        + localPx.y * uTextureDocumentYAxis;

    // Premultiplied input: recover straight colour so surviving pixels are
    // fully opaque, which is the whole point of Dissolve.
    float a = src.a * clamp(uOpacity, 0.0, 1.0);
    vec3 rgb = src.a > 0.0 ? src.rgb / src.a : vec3(0.0);
    float keep = step(dissolveNoise(floor(docPx)), a) * step(0.0001, a);
    finalColor = vec4(rgb * keep, keep);
}
`

export type DissolveFilterParams = {
  /** Layer opacity, applied here instead of on the node (see DissolveFilter). */
  opacity: number
  textureTransform: DocumentTextureTransform
}

/**
 * Photoshop "Dissolve": a stochastic alpha threshold rather than a blend
 * equation, which is why Pixi has no such blend mode.
 *
 * Layer opacity is folded in as a uniform because dissolve is *defined* in
 * terms of it — at 50% opacity half the pixels survive at full alpha, instead
 * of every pixel rendering at half alpha. Callers therefore set the node's own
 * alpha to 1 while this filter is attached.
 *
 * The threshold pattern is anchored in document space so it does not swim when
 * the camera pans or zooms.
 */
export class DissolveFilter extends Filter {
  constructor(params: DissolveFilterParams) {
    const uniforms = new UniformGroup({
      uOpacity: { value: params.opacity, type: 'f32' },
      uTextureDocumentXAxis: { value: params.textureTransform.xAxis, type: 'vec2<f32>' },
      uTextureDocumentYAxis: { value: params.textureTransform.yAxis, type: 'vec2<f32>' },
      uTextureDocumentOffset: { value: params.textureTransform.offset, type: 'vec2<f32>' },
    })
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-dissolve-filter',
      }),
      resources: { dissolveUniforms: uniforms },
      padding: 0,
    })
  }

  setParams(params: DissolveFilterParams): void {
    const u = this.resources.dissolveUniforms.uniforms as {
      uOpacity: number
      uTextureDocumentXAxis: Float32Array | number[]
      uTextureDocumentYAxis: Float32Array | number[]
      uTextureDocumentOffset: Float32Array | number[]
    }
    u.uOpacity = params.opacity
    u.uTextureDocumentXAxis[0] = params.textureTransform.xAxis[0]
    u.uTextureDocumentXAxis[1] = params.textureTransform.xAxis[1]
    u.uTextureDocumentYAxis[0] = params.textureTransform.yAxis[0]
    u.uTextureDocumentYAxis[1] = params.textureTransform.yAxis[1]
    u.uTextureDocumentOffset[0] = params.textureTransform.offset[0]
    u.uTextureDocumentOffset[1] = params.textureTransform.offset[1]
  }
}
