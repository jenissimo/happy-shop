import type {
  RenderLayerMask,
  RenderLayerSource,
  RenderLayerTransform,
  RenderLayerView,
  RenderShapeLayerView,
  RenderTextLayerView,
} from '../contracts/RenderDocumentView'
import type { LayerScaleMode } from './layerTextures'

const bitmapIds = new WeakMap<ImageBitmap, number>()
let nextBitmapId = 1

export function bitmapIdentity(bitmap: ImageBitmap): number {
  let id = bitmapIds.get(bitmap)
  if (id == null) {
    id = nextBitmapId++
    bitmapIds.set(bitmap, id)
  }
  return id
}

export function describeMask(mask: RenderLayerMask | undefined): string {
  if (!mask) return 'none'
  return `mask:${bitmapIdentity(mask.bitmap)}:${mask.width}x${mask.height}`
}

export function describeSource(
  source: RenderLayerSource,
  width: number,
  height: number,
  scaleMode: LayerScaleMode,
): string {
  const mode = scaleMode === 'nearest' ? 'near' : 'lin'
  switch (source.kind) {
    case 'color':
      return `color:${source.color}:${width}x${height}:${mode}`
    case 'url':
      return `url:${source.url}:${width}x${height}:${mode}`
    case 'image-bitmap':
      return `bitmap:${bitmapIdentity(source.bitmap)}:${width}x${height}:${mode}`
  }
}

export function describeText(layer: RenderTextLayerView): string {
  return [
    layer.content,
    layer.fontFamily,
    layer.fontSize,
    layer.fontWeight,
    layer.italic,
    layer.underline,
    layer.color,
    JSON.stringify(layer.runs),
    layer.tracking,
    layer.leading,
    layer.baselineShift,
    layer.align,
    layer.textMode,
    layer.bounds.w,
    layer.bounds.h,
    layer.fillOpacity,
  ].join('|')
}

export function describeShape(layer: RenderShapeLayerView): string {
  return [
    layer.primitive,
    layer.bounds.x,
    layer.bounds.y,
    layer.bounds.w,
    layer.bounds.h,
    layer.cornerRadius ?? 0,
    layer.sides ?? 5,
    layer.starPoints ?? 5,
    layer.starInset ?? 0.5,
    layer.pathData ?? '',
    layer.fillOpacity,
    JSON.stringify(layer.fill),
    JSON.stringify(layer.stroke),
  ].join('|')
}

function serializeEffects(
  effects: RenderLayerView['effects'],
  replacer?: (key: string, value: unknown) => unknown,
): string {
  return JSON.stringify(effects ?? [], (key, value) => {
    if (value instanceof Uint8Array) return `a8:${value.length}`
    return replacer ? replacer(key, value) : value
  })
}

/** Full ordered FX payload for param-only invalidation (ND-EFFECT-STACK-VISION §5.3). */
export function describeEffects(effects: RenderLayerView['effects']): string {
  return serializeEffects(effects)
}

/** Stack structure: ordered ids, types, enabled — rebuild filters when this changes. */
export function describeEffectsStructure(effects: RenderLayerView['effects']): string {
  const rows = (effects ?? []).map((effect) => ({
    id: effect.id,
    type: effect.type,
    enabled: effect.enabled,
  }))
  return JSON.stringify(rows)
}

/** Param + fill fingerprint for uniform-only updates during live scrub. */
export function describeEffectsParams(
  effects: RenderLayerView['effects'],
  fillOpacity: number,
): string {
  return `${serializeEffects(effects)}|fill:${fillOpacity}`
}

export function describeTransform(transform: RenderLayerTransform): string {
  return [
    transform.x,
    transform.y,
    transform.scaleX,
    transform.scaleY,
    transform.rotationDeg,
    transform.skewXDeg,
    transform.skewYDeg,
    transform.pivotX,
    transform.pivotY,
  ].join(',')
}

export function describeLayerView(
  layer: RenderLayerView,
  scaleMode: LayerScaleMode,
): string {
  const base = [
    layer.id,
    layer.kind,
    layer.visible,
    layer.opacity,
    layer.fillOpacity,
    layer.blendMode,
    describeTransform(layer.transform),
    describeEffects(layer.effects),
    describeMask(layer.mask),
    layer.maskHidesEffects ? 'maskHidesFx' : 'maskRespectsFx',
  ].join('|')
  if (layer.kind === 'group') {
    // clipBaseCount changes which children feed the clip alpha, so it has to
    // invalidate an enclosing group's flatten just like the child list does.
    return `${base}|clip:${layer.clipBaseCount ?? 0}[${describeGroupSubtreeKey(layer.children, scaleMode)}]`
  }
  if (layer.kind === 'adjustment') {
    // The backdrop subtree feeds the flatten, and the params feed the shader.
    return `${base}|adj:${JSON.stringify(layer.adjustment)}[${describeGroupSubtreeKey(layer.children, scaleMode)}]`
  }
  if (layer.kind === 'raster') {
    return `${base}|${describeSource(layer.source, layer.width, layer.height, scaleMode)}`
  }
  return layer.kind === 'text'
    ? `${base}|${describeText(layer)}`
    : `${base}|${describeShape(layer)}`
}

/** Structural + content key for an isolated group's child subtree (SPECS/GROUP-LAYER-FX.md §4.2). */
export function describeGroupSubtreeKey(
  layers: readonly RenderLayerView[],
  scaleMode: LayerScaleMode,
): string {
  return layers.map((layer) => describeLayerView(layer, scaleMode)).join(';')
}
