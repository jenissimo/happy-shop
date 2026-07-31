/**
 * CPU Porter-Duff "over" composite for visible raster layers in document space.
 * Shared by Copy Merged, Merge Down / Visible, and temp brush eyedropper.
 */

import {
  flattenPaintOrder,
  type HappyDocument,
  type Layer,
  type Transform,
} from '../../core/document'
import {
  ensureEditableSurface,
  getEditableSurface,
  type TiledRasterSurface,
} from '../../imaging'
import {
  type Rgb,
  sampleRgbaAverage,
} from '../../imaging/sampleLayerColor'
import { documentToLayerLocal, layerLocalToDocument } from '../tools/brush/layerCoords'

export type DocRegion = {
  x: number
  y: number
  width: number
  height: number
}

export type CompositedPixels = {
  rgba: Uint8ClampedArray
  width: number
  height: number
  originX: number
  originY: number
}

export function layerDocAabb(
  transform: Transform,
  surfaceWidth: number,
  surfaceHeight: number,
): DocRegion {
  const corners = [
    layerLocalToDocument({ x: 0, y: 0 }, transform),
    layerLocalToDocument({ x: surfaceWidth, y: 0 }, transform),
    layerLocalToDocument({ x: 0, y: surfaceHeight }, transform),
    layerLocalToDocument({ x: surfaceWidth, y: surfaceHeight }, transform),
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of corners) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x)
    maxY = Math.max(maxY, c.y)
  }
  const x = Math.floor(minX)
  const y = Math.floor(minY)
  const right = Math.ceil(maxX)
  const bottom = Math.ceil(maxY)
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  }
}

export function unionDocRegions(a: DocRegion, b: DocRegion): DocRegion {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  }
}

function sampleSurface(
  surface: TiledRasterSurface,
  full: { data: Uint8ClampedArray; width: number; height: number },
  lx: number,
  ly: number,
): { r: number; g: number; b: number; a: number } {
  const x = Math.floor(lx)
  const y = Math.floor(ly)
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }
  const i = (y * full.width + x) * 4
  return {
    r: full.data[i]!,
    g: full.data[i + 1]!,
    b: full.data[i + 2]!,
    a: full.data[i + 3]!,
  }
}

function porterDuffOver(
  out: Uint8ClampedArray,
  src: Uint8ClampedArray,
): void {
  for (let i = 0; i < out.length; i += 4) {
    const sa = src[i + 3]! / 255
    if (sa <= 0) continue
    const da = out[i + 3]! / 255
    const outA = sa + da * (1 - sa)
    if (outA <= 0) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0
      continue
    }
    out[i] = Math.round((src[i]! * sa + out[i]! * da * (1 - sa)) / outA)
    out[i + 1] = Math.round(
      (src[i + 1]! * sa + out[i + 1]! * da * (1 - sa)) / outA,
    )
    out[i + 2] = Math.round(
      (src[i + 2]! * sa + out[i + 2]! * da * (1 - sa)) / outA,
    )
    out[i + 3] = Math.round(outA * 255)
  }
}

type CompositeRasterOptions = {
  /** 0..1 coverage per document pixel (e.g. selection mask). */
  sampleCover?: (docX: number, docY: number) => number
  /** Bake layer opacity into alpha (default true; Copy uses false). */
  applyLayerOpacity?: boolean
}

function compositeRasterLayersInto(
  layers: readonly Layer[],
  region: DocRegion,
  resolveSurface: (layer: Layer) => TiledRasterSurface | null | undefined,
  options?: CompositeRasterOptions,
): CompositedPixels | null {
  if (region.width < 1 || region.height < 1) return null

  const out = new Uint8ClampedArray(region.width * region.height * 4)
  const sampleCover = options?.sampleCover
  const applyOpacity = options?.applyLayerOpacity !== false

  for (const layer of layers) {
    if (layer.type !== 'raster') continue
    const opacity = applyOpacity ? layer.opacity : 1
    if (opacity <= 0) continue
    const surface = resolveSurface(layer)
    if (!surface) continue
    const full = surface.toRgbaBuffer()
    const src = new Uint8ClampedArray(region.width * region.height * 4)

    for (let dy = 0; dy < region.height; dy++) {
      for (let dx = 0; dx < region.width; dx++) {
        const docX = region.x + dx
        const docY = region.y + dy
        const cover = sampleCover ? sampleCover(docX, docY) : 1
        if (cover <= 0) continue
        const local = documentToLayerLocal(
          { x: docX + 0.5, y: docY + 0.5 },
          layer.transform,
        )
        const px = sampleSurface(surface, full, local.x, local.y)
        const i = (dy * region.width + dx) * 4
        src[i] = px.r
        src[i + 1] = px.g
        src[i + 2] = px.b
        src[i + 3] = Math.round(px.a * cover * opacity)
      }
    }

    porterDuffOver(out, src)
  }

  return {
    rgba: out,
    width: region.width,
    height: region.height,
    originX: region.x,
    originY: region.y,
  }
}

/**
 * Composite `layers` (bottom → top) into `region` document space.
 * Only raster layers are sampled; callers should pre-filter.
 */
export async function compositeRasterLayers(
  layers: readonly Layer[],
  region: DocRegion,
  options?: CompositeRasterOptions,
): Promise<CompositedPixels | null> {
  const cached = compositeRasterLayersSync(layers, region, options)
  if (cached) return cached

  const resolved = new Map<string, TiledRasterSurface>()
  for (const layer of layers) {
    if (layer.type !== 'raster') continue
    const surface = await ensureEditableSurface(String(layer.pixels))
    if (surface) resolved.set(String(layer.pixels), surface)
  }
  return compositeRasterLayersInto(
    layers,
    region,
    (layer) => (layer.type === 'raster' ? resolved.get(String(layer.pixels)) ?? null : null),
    options,
  )
}

/** Sync composite for hot paths when editable surfaces are already resident. */
export function compositeRasterLayersSync(
  layers: readonly Layer[],
  region: DocRegion,
  options?: CompositeRasterOptions,
): CompositedPixels | null {
  return compositeRasterLayersInto(
    layers,
    region,
    (layer) => (layer.type === 'raster' ? getEditableSurface(String(layer.pixels)) ?? null : null),
    options,
  )
}

/** Read one document-space pixel from a composited region buffer. */
export function sampleRgbaFromComposited(
  composited: CompositedPixels,
  docX: number,
  docY: number,
): [number, number, number, number] {
  const lx = Math.floor(docX) - composited.originX
  const ly = Math.floor(docY) - composited.originY
  if (lx < 0 || ly < 0 || lx >= composited.width || ly >= composited.height) {
    return [0, 0, 0, 0]
  }
  const i = (ly * composited.width + lx) * 4
  return [
    composited.rgba[i]!,
    composited.rgba[i + 1]!,
    composited.rgba[i + 2]!,
    composited.rgba[i + 3]!,
  ]
}

/** Visible rasters in paint order (bottom → top). */
export function visibleRasterLayers(doc: HappyDocument): Layer[] {
  return flattenPaintOrder(doc).filter(
    (layer) => layer.type === 'raster' && layer.visible && layer.opacity > 0,
  )
}

/**
 * Sample composited visible canvas color under a document point (3×3 average).
 * Returns null when the area is fully transparent.
 */
export async function sampleMergedColorAt(
  doc: HappyDocument,
  docX: number,
  docY: number,
): Promise<Rgb | null> {
  const layers = visibleRasterLayers(doc)
  if (layers.length === 0) return null
  const region: DocRegion = {
    x: Math.floor(docX) - 1,
    y: Math.floor(docY) - 1,
    width: 3,
    height: 3,
  }
  const composited = await compositeRasterLayers(layers, region)
  if (!composited) return null
  return sampleRgbaAverage(
    composited.rgba,
    composited.width,
    composited.height,
    1,
    1,
  )
}
