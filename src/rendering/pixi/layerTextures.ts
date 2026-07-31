import { BufferImageSource, Texture } from 'pixi.js'

/** Transparent border so bilinear sampling softens rotated hard edges without MSAA. */
export const LAYER_EDGE_PAD = 1

export type LayerScaleMode = 'linear' | 'nearest'

/**
 * Solid fill used for `source.kind === 'color'`. Sized to the layer plus a
 * 1px transparent pad; with `scaleMode: 'linear'` the pad becomes a soft
 * coverage ramp on diagonals (Photoshop-like preview AA).
 */
export function createColorLayerTexture(
  width: number,
  height: number,
  scaleMode: LayerScaleMode = 'linear',
): Texture {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const pad = scaleMode === 'linear' ? LAYER_EDGE_PAD : 0
  const tw = w + pad * 2
  const th = h + pad * 2
  const data = new Uint8Array(tw * th * 4)

  for (let y = pad; y < pad + h; y++) {
    for (let x = pad; x < pad + w; x++) {
      const i = (y * tw + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
    }
  }

  return new Texture({
    source: new BufferImageSource({
      resource: data,
      width: tw,
      height: th,
      scaleMode,
      autoGenerateMipmaps: scaleMode === 'linear',
      addressMode: 'clamp-to-edge',
      alphaMode: 'premultiply-alpha-on-upload',
    }),
  })
}

/** Apply preview sampler policy to an existing texture source. */
export function applyPreviewSampling(texture: Texture, scaleMode: LayerScaleMode): void {
  const source = texture.source
  source.scaleMode = scaleMode
  source.autoGenerateMipmaps = scaleMode === 'linear'
  if (scaleMode === 'linear') {
    source.style.mipmapFilter = 'linear'
    source.updateMipmaps()
  }
}
