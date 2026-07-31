import {
  EMPTY_INITIAL_RASTER_ASSET_ID,
  type GroupLayer,
  type HappyDocument,
  type Layer,
  type LayerEffect,
  type LayerId,
} from '../../core/document'
import { getRasterSurface, type RasterSurfaceEntry } from '../../imaging'
import type {
  RenderDocumentView,
  RenderGroupLayerView,
  RenderLayerEffect,
  RenderLayerMask,
  RenderLayerSource,
  RenderLayerView,
} from '../../rendering/contracts'
import type { RenderChromaConnectivityMask } from '../../rendering/contracts'

const FALLBACK_PLACEHOLDER_COLOR = '#5c6673'
/**
 * Lookup for resolved raster pixels keyed by `RasterAssetRef` / asset id.
 * Tests and export paths can pass an explicit map; the live editor defaults
 * to `imaging/RasterSurfaceStore`.
 */
export type RenderAssetLookup = {
  get(assetId: string): RasterSurfaceEntry | undefined
}

export type ChromaFloodMaskLookup = (
  surface: RasterSurfaceEntry,
  effect: Extract<LayerEffect, { type: 'chroma-key' }>,
) => RenderChromaConnectivityMask | undefined

const defaultAssets: RenderAssetLookup = {
  get: getRasterSurface,
}

function resolveMask(
  maskRef: string | undefined,
  maskEnabled: boolean | undefined,
  assets: RenderAssetLookup,
): RenderLayerMask | undefined {
  if (!maskRef || maskEnabled === false) return undefined
  const surface = assets.get(maskRef)
  if (!surface) return undefined
  return {
    bitmap: surface.bitmap,
    width: surface.width,
    height: surface.height,
  }
}

function maskViewProps(
  layer: Layer,
  mask: RenderLayerMask | undefined,
): { mask?: RenderLayerMask; maskHidesEffects?: boolean } {
  if (!mask) return {}
  return layer.maskHidesEffects ? { mask, maskHidesEffects: true } : { mask }
}

function mapEffects(
  effects: LayerEffect[],
  floodMask?: (effect: Extract<LayerEffect, { type: 'chroma-key' }>) => RenderChromaConnectivityMask | undefined,
): RenderLayerEffect[] {
  return effects
    .filter((e) => e.enabled)
    .map((e): RenderLayerEffect => {
      switch (e.type) {
        case 'drop-shadow':
          return {
            id: e.id,
            type: 'drop-shadow',
            enabled: e.enabled,
            blendMode: e.blendMode,
            color: e.color,
            opacity: e.opacity,
            angle: e.angle,
            distance: e.distance,
            spread: e.spread,
            size: e.size,
            contour: e.contour,
            noise: e.noise,
            layerKnocksOutDropShadow: e.layerKnocksOutDropShadow,
          }
        case 'inner-shadow':
          return {
            id: e.id,
            type: 'inner-shadow',
            enabled: e.enabled,
            blendMode: e.blendMode,
            color: e.color,
            opacity: e.opacity,
            angle: e.angle,
            distance: e.distance,
            choke: e.choke,
            size: e.size,
            contour: e.contour,
            noise: e.noise,
          }
        case 'outer-glow':
          return {
            id: e.id,
            type: 'outer-glow',
            enabled: e.enabled,
            blendMode: e.blendMode,
            opacity: e.opacity,
            noise: e.noise,
            technique: e.technique,
            color: e.color,
            spread: e.spread,
            size: e.size,
            contour: e.contour,
            range: e.range,
            jitter: e.jitter,
          }
        case 'inner-glow':
          return {
            id: e.id,
            type: 'inner-glow',
            enabled: e.enabled,
            blendMode: e.blendMode,
            opacity: e.opacity,
            noise: e.noise,
            technique: e.technique,
            source: e.source,
            color: e.color,
            choke: e.choke,
            size: e.size,
            contour: e.contour,
            range: e.range,
            jitter: e.jitter,
          }
        case 'bevel-emboss':
          return {
            id: e.id,
            type: 'bevel-emboss',
            enabled: e.enabled,
            style: e.style,
            technique: e.technique,
            depth: e.depth,
            direction: e.direction,
            size: e.size,
            soften: e.soften,
            angle: e.angle,
            altitude: e.altitude,
            highlightColor: e.highlightColor,
            highlightOpacity: e.highlightOpacity,
            highlightMode: e.highlightMode,
            shadowColor: e.shadowColor,
            shadowOpacity: e.shadowOpacity,
            shadowMode: e.shadowMode,
            contourEnabled: e.contour.enabled,
            contour: e.contour.contour,
            contourRange: e.contour.range,
            contourAntiAliased: e.contour.antiAliased,
            textureEnabled: e.texture.enabled,
            texturePattern: e.texture.pattern,
            textureScale: e.texture.scale,
            textureDepth: e.texture.depth,
            textureInvert: e.texture.invert,
            textureAlignWithLayer: e.texture.alignWithLayer,
          }
        case 'satin':
          return {
            id: e.id,
            type: 'satin',
            enabled: e.enabled,
            blendMode: e.blendMode,
            color: e.color,
            opacity: e.opacity,
            angle: e.angle,
            distance: e.distance,
            size: e.size,
            contour: e.contour,
            invert: e.invert,
          }
        case 'color-overlay':
          return {
            id: e.id,
            type: 'color-overlay',
            enabled: e.enabled,
            blendMode: e.blendMode,
            color: e.color,
            opacity: e.opacity,
          }
        case 'gradient-overlay':
          return {
            id: e.id,
            type: 'gradient-overlay',
            enabled: e.enabled,
            blendMode: e.blendMode,
            opacity: e.opacity,
            stops: e.gradient.stops.map((s) => ({ ...s })),
            style: e.style,
            angle: e.angle,
            scale: e.scale,
            reverse: e.reverse,
            offsetX: e.offsetX,
            offsetY: e.offsetY,
          }
        case 'pattern-overlay':
          return {
            id: e.id,
            type: 'pattern-overlay',
            enabled: e.enabled,
            blendMode: e.blendMode,
            opacity: e.opacity,
            pattern: e.pattern,
            scale: e.scale,
            angle: e.angle,
            invert: e.invert,
            offsetX: e.offsetX,
            offsetY: e.offsetY,
          }
        case 'stroke':
          return {
            id: e.id,
            type: 'stroke',
            enabled: e.enabled,
            blendMode: e.blendMode,
            color: e.color,
            opacity: e.opacity,
            size: e.size,
            position: e.position,
            overprint: e.overprint,
            fillType: e.fillType,
          }
        case 'chroma-key': {
          const connectivityMask = e.mode === 'flood' ? floodMask?.(e) : undefined
          return {
            id: e.id,
            type: 'chroma-key',
            enabled: e.enabled,
            keyColor: e.keyColor,
            mode: e.mode,
            floodOrigins: e.floodOrigins,
            tolerance: e.tolerance,
            softness: e.softness,
            despill: e.despill,
            choke: e.choke,
            edgeBlur: e.edgeBlur,
            ...(connectivityMask ? { connectivityMask } : {}),
          }
        }
        case 'gaussian-blur':
          return {
            id: e.id,
            type: 'gaussian-blur',
            enabled: e.enabled,
            radius: e.radius,
          }
        case 'sharpen':
          return {
            id: e.id,
            type: 'sharpen',
            enabled: e.enabled,
            amount: e.amount,
            radius: e.radius,
          }
        case 'adjustment':
          return {
            id: e.id,
            type: 'adjustment',
            enabled: e.enabled,
            adjustment: e.adjustment,
          }
        case 'noise':
          return {
            id: e.id,
            type: 'noise',
            enabled: e.enabled,
            amount: e.amount,
            distribution: e.distribution,
            monochromatic: e.monochromatic,
          }
      }
    })
}

/**
 * Maps one non-group leaf layer (raster/text/shape). `undefined` for
 * adjustment layers, which stay unrendered (SPEC §8.1 adjustments are a
 * below-stack render concern, not yet wired — see `ND-EFFECT-STACK-VISION.md`).
 */
function mapLeafLayer(
  layer: Layer,
  doc: HappyDocument,
  assets: RenderAssetLookup,
  floodMasks: ChromaFloodMaskLookup | undefined,
): RenderLayerView | undefined {
  const mask = resolveMask(layer.mask, layer.maskEnabled, assets)
  const fillOpacity = layer.fillOpacity ?? 1

  if (layer.type === 'text') {
    return {
      id: layer.id,
      kind: 'text',
      visible: layer.visible,
      opacity: layer.opacity,
      fillOpacity,
      blendMode: layer.blendMode,
      transform: { ...layer.transform },
      content: layer.content,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      italic: layer.italic,
      underline: layer.underline,
      color: layer.color,
      runs: layer.runs.map((run) => ({
        start: run.start,
        end: run.end,
        fontFamily: run.fontFamily,
        fontSize: run.fontSize,
        fontWeight: run.fontWeight,
        italic: run.italic,
        color: run.color,
        ...(run.underline !== undefined ? { underline: run.underline } : {}),
        ...(run.tracking !== undefined ? { tracking: run.tracking } : {}),
      })),
      tracking: layer.tracking,
      leading: layer.leading,
      align: layer.align,
      textMode: layer.textMode,
      bounds: { w: layer.bounds.w, h: layer.bounds.h },
      effects: mapEffects(layer.effects),
      ...maskViewProps(layer, mask),
    }
  }

  if (layer.type === 'shape') {
    return {
      id: layer.id,
      kind: 'shape',
      visible: layer.visible,
      opacity: layer.opacity,
      fillOpacity,
      blendMode: layer.blendMode,
      transform: { ...layer.transform },
      primitive: layer.primitive,
      bounds: { ...layer.bounds },
      fill: { ...layer.fill },
      stroke: { ...layer.stroke },
      cornerRadius: layer.cornerRadius,
      sides: layer.sides,
      starPoints: layer.starPoints,
      starInset: layer.starInset,
      pathData: layer.pathData,
      effects: mapEffects(layer.effects),
      ...maskViewProps(layer, mask),
    }
  }

  if (layer.type !== 'raster') return undefined

  const surface = assets.get(layer.pixels)
  // A repaired document can receive its blank backing surface lazily when a
  // paint tool first targets it. Until then, preserve the transparent canvas
  // rather than rendering the generic missing-asset swatch.
  if (!surface && String(layer.pixels) === String(EMPTY_INITIAL_RASTER_ASSET_ID)) return undefined
  const width = surface?.width ?? doc.canvas.width
  const height = surface?.height ?? doc.canvas.height
  const source: RenderLayerSource = surface
    ? { kind: 'image-bitmap', bitmap: surface.bitmap }
    : { kind: 'color', color: FALLBACK_PLACEHOLDER_COLOR }

  return {
    id: layer.id,
    kind: 'raster',
    visible: layer.visible,
    opacity: layer.opacity,
    fillOpacity,
    blendMode: layer.blendMode,
    transform: { ...layer.transform },
    width,
    height,
    source,
    effects: mapEffects(
      layer.effects,
      surface && floodMasks ? (effect) => floodMasks(surface, effect) : undefined,
    ),
    ...maskViewProps(layer, mask),
  }
}

/**
 * Isolated group → one `RenderGroupLayerView` carrying its own recursively
 * mapped `children` (flatten-then-FX composite; see `SPECS/GROUP-LAYER-FX.md`).
 */
function mapIsolatedGroup(
  layer: GroupLayer,
  doc: HappyDocument,
  assets: RenderAssetLookup,
  floodMasks: ChromaFloodMaskLookup | undefined,
): RenderGroupLayerView {
  const mask = resolveMask(layer.mask, layer.maskEnabled, assets)
  return {
    id: layer.id,
    kind: 'group',
    visible: layer.visible,
    opacity: layer.opacity,
    fillOpacity: layer.fillOpacity ?? 1,
    blendMode: layer.blendMode,
    transform: { ...layer.transform },
    effects: mapEffects(layer.effects),
    children: mapChildren(layer.children, doc, assets, floodMasks),
    ...maskViewProps(layer, mask),
  }
}

/**
 * Bottom -> top mapping of one child list. A hidden group (`visible: false`)
 * drops its whole subtree — group visibility was previously ignored entirely
 * (a silent no-op: see `SPECS/GROUP-LAYER-FX.md`). A pass-through group
 * (`isolated: false`, the default) inlines its mapped children directly,
 * exactly matching the pre-existing flatten behavior. An isolated group
 * (`isolated: true`) becomes one nested `RenderGroupLayerView`.
 */
function mapChildren(
  ids: readonly LayerId[],
  doc: HappyDocument,
  assets: RenderAssetLookup,
  floodMasks: ChromaFloodMaskLookup | undefined,
): RenderLayerView[] {
  const out: RenderLayerView[] = []
  for (const id of ids) {
    const layer = doc.layers[id]
    if (!layer) continue

    if (layer.type === 'group') {
      if (!layer.visible) continue
      if (layer.isolated) {
        out.push(mapIsolatedGroup(layer, doc, assets, floodMasks))
      } else {
        out.push(...mapChildren(layer.children, doc, assets, floodMasks))
      }
      continue
    }

    const mapped = mapLeafLayer(layer, doc, assets, floodMasks)
    if (mapped) out.push(mapped)
  }
  return out
}

/**
 * `HappyDocument` (+ resolved assets) → `RenderDocumentView` (SPEC §6:
 * DocumentStore metadata → RenderCoordinator → Pixi RenderBackend).
 *
 * Raster + text + shape layers are always represented. Groups are
 * pass-through (inlined, no compositing of their own) unless `isolated:
 * true`, in which case they become a nested `RenderGroupLayerView` — see
 * `SPECS/GROUP-LAYER-FX.md`. Adjustment layers are still skipped.
 */
export function toRenderDocumentView(
  doc: HappyDocument,
  assets: RenderAssetLookup = defaultAssets,
  floodMasks?: ChromaFloodMaskLookup,
): RenderDocumentView {
  return {
    id: doc.id,
    width: doc.canvas.width,
    height: doc.canvas.height,
    background: doc.canvas.background,
    layers: mapChildren(doc.rootChildren, doc, assets, floodMasks),
  }
}
