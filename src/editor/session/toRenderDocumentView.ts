import {
  EMPTY_INITIAL_RASTER_ASSET_ID,
  type AdjustmentLayer,
  type GroupLayer,
  type HappyDocument,
  type Layer,
  type LayerEffect,
  type LayerId,
} from '../../core/document'
import { getRasterSurface, type RasterSurfaceEntry } from '../../imaging'
import type {
  RenderAdjustmentLayerView,
  RenderDocumentView,
  RenderGroupLayerView,
  RenderLayerEffect,
  RenderLayerMask,
  RenderLayerSource,
  RenderLayerTransform,
  RenderLayerView,
} from '../../rendering/contracts'
import { identityTransform } from '../../rendering/contracts'
import type { RenderChromaConnectivityMask } from '../../rendering/contracts'
import { composeLayerTransforms } from './composeLayerTransform'
import { normalizedTextRuns } from '../tools/text/textRuns'

const IDENTITY_TRANSFORM: RenderLayerTransform = identityTransform()

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
 * An adjustment layer maps to a *placeholder* node: its `children` (the
 * backdrop it modifies) are filled in later by {@link resolveAdjustmentScopes},
 * once the enclosing scope is known.
 *
 * The layer's own `transform` is deliberately dropped — an adjustment reads the
 * composite beneath it in document space, so moving/rotating it is meaningless
 * (Photoshop offers no transform on adjustment layers either).
 */
function mapAdjustmentLayer(
  layer: AdjustmentLayer,
  mask: RenderLayerMask | undefined,
): RenderAdjustmentLayerView {
  return {
    id: layer.id,
    kind: 'adjustment',
    visible: true,
    opacity: layer.opacity,
    fillOpacity: 1,
    blendMode: layer.blendMode,
    transform: IDENTITY_TRANSFORM,
    adjustment: layer.adjustment,
    children: [],
    ...(mask ? { mask } : {}),
  }
}

/**
 * Maps one non-group leaf layer (raster/text/shape/adjustment). `undefined`
 * when the layer has nothing to render at all.
 */
function mapLeafLayer(
  layer: Layer,
  doc: HappyDocument,
  assets: RenderAssetLookup,
  floodMasks: ChromaFloodMaskLookup | undefined,
  parentTransform: RenderLayerTransform,
): RenderLayerView | undefined {
  const mask = resolveMask(layer.mask, layer.maskEnabled, assets)
  const fillOpacity = layer.fillOpacity ?? 1
  // Pass-through groups own no buffer, so their transform must reach the
  // children directly — otherwise moving a group would not move its contents.
  const transform = composeLayerTransforms(parentTransform, layer.transform)

  if (layer.type === 'adjustment') {
    // A hidden adjustment simply disappears: its backdrop then renders as-is.
    return layer.visible ? mapAdjustmentLayer(layer, mask) : undefined
  }

  if (layer.type === 'text') {
    return {
      id: layer.id,
      kind: 'text',
      visible: layer.visible,
      opacity: layer.opacity,
      fillOpacity,
      blendMode: layer.blendMode,
      transform,
      content: layer.content,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      italic: layer.italic,
      underline: layer.underline,
      color: layer.color,
      // Normalized: gaps between runs become default-styled runs, so the
      // renderer can draw the run list verbatim and never drop a character
      // that no run happens to cover.
      runs: normalizedTextRuns(layer).map((run) => ({
        start: run.start,
        end: run.end,
        fontFamily: run.fontFamily,
        fontSize: run.fontSize,
        fontWeight: run.fontWeight,
        italic: run.italic,
        color: run.color,
        ...(run.underline !== undefined ? { underline: run.underline } : {}),
        ...(run.tracking !== undefined ? { tracking: run.tracking } : {}),
        ...(run.baselineShift !== undefined ? { baselineShift: run.baselineShift } : {}),
      })),
      tracking: layer.tracking,
      leading: layer.leading,
      baselineShift: layer.baselineShift ?? 0,
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
      transform,
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
    transform,
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
 * Does this group need to be composited through its own offscreen buffer?
 *
 * Photoshop auto-promotes a pass-through group the moment it owns something the
 * backdrop cannot express, because pass-through means "these children composite
 * straight into the backdrop" — which leaves nowhere to hang group-level
 * opacity, a group mask, group effects, or a group blend mode. We implement the
 * same rule explicitly:
 *
 * - `isolated: true` (the explicit UI toggle), or
 * - `blendMode !== 'pass-through'` — `'pass-through'` is the group's way of
 *   spelling "no buffer"; every real blend equation needs one, or
 * - an enabled mask, or `opacity < 1`, or `fillOpacity < 1`, or
 * - at least one enabled effect.
 *
 * Everything else stays pass-through and is inlined into the parent's paint
 * order — but its `transform` is still composed onto its children (a group's
 * transform is never a no-op, see `composeLayerTransforms`).
 */
export function groupNeedsOwnBuffer(
  layer: GroupLayer,
  hasMask: boolean,
): boolean {
  if (layer.isolated) return true
  if (layer.blendMode !== 'pass-through') return true
  if (hasMask) return true
  if (layer.opacity < 1) return true
  if ((layer.fillOpacity ?? 1) < 1) return true
  return layer.effects.some((effect) => effect.enabled)
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
  parentTransform: RenderLayerTransform,
  mask: RenderLayerMask | undefined,
): RenderGroupLayerView {
  return {
    id: layer.id,
    kind: 'group',
    visible: layer.visible,
    opacity: layer.opacity,
    fillOpacity: layer.fillOpacity ?? 1,
    blendMode: layer.blendMode,
    // The group buffer carries its own transform; children render into it
    // untransformed by the group (identity parent) and in document space.
    transform: composeLayerTransforms(parentTransform, layer.transform),
    effects: mapEffects(layer.effects),
    // The buffer is a scope boundary: adjustments inside it stop at the group.
    children: resolveAdjustmentScopes(
      mapChildren(layer.children, doc, assets, floodMasks, IDENTITY_TRANSFORM),
    ),
    ...maskViewProps(layer, mask),
  }
}

/**
 * Photoshop adjustment-layer scoping, applied at every buffer boundary.
 *
 * An adjustment layer modifies the composite of everything beneath it *within
 * its scope*. We express that structurally: the views beneath the placeholder
 * become its `children`, so the compositor can flatten them once and run the
 * adjustment over that texture. Stacked adjustments nest, which is exactly the
 * Photoshop reading order (the upper one sees the lower one's result).
 *
 * An adjustment with nothing beneath it in its scope is dropped — there is no
 * backdrop to modify.
 *
 * Callers are the nodes that *own a buffer*: the document root, a buffered
 * group, and a clipping group. A pass-through group deliberately does **not**
 * call this: its placeholders travel up to the enclosing scope, matching
 * Photoshop, where an adjustment inside a pass-through group also affects
 * layers below the group.
 */
export function resolveAdjustmentScopes(
  views: readonly RenderLayerView[],
): RenderLayerView[] {
  let below: RenderLayerView[] = []
  for (const view of views) {
    if (view.kind !== 'adjustment') {
      below.push(view)
      continue
    }
    if (below.length === 0) continue
    // Reassigning (not mutating) keeps the array handed to `children` frozen.
    below = [{ ...view, children: below }]
  }
  return below
}

/** One document sibling after mapping: a pass-through group expands to many views. */
export type MappedSibling = {
  views: RenderLayerView[]
  /** `Layer.clipping` — clips to the alpha of the nearest non-clipping sibling below. */
  clipping: boolean
}

/**
 * Strips the properties hoisted onto a clipping group's wrapper, so the base's
 * opacity / blend / fill / mask / effects are applied once — to the clipped
 * group as a whole — instead of twice.
 */
function neutralizeClipBase(view: RenderLayerView): RenderLayerView {
  return {
    ...view,
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'normal',
    effects: [],
    mask: undefined,
    maskHidesEffects: undefined,
  }
}

/**
 * Photoshop clipping groups. A run of consecutive `clipping: true` siblings
 * clips to the alpha of the nearest non-clipping sibling below it (the "base"),
 * and the base's blend mode / opacity / fill / mask / effects apply to the
 * whole clipped result — so the run + base become one buffered group whose
 * first `clipBaseCount` children define the clip alpha.
 *
 * A `clipping` flag with no base below it is ignored (the bottom layer of a
 * stack has nothing to clip to), matching `toggleClippingMask`.
 */
export function resolveClippingRuns(siblings: readonly MappedSibling[]): RenderLayerView[] {
  const out: RenderLayerView[] = []
  let index = 0
  while (index < siblings.length) {
    const base = siblings[index]!
    let end = index + 1
    while (end < siblings.length && siblings[end]!.clipping) end += 1

    const clipped = siblings.slice(index + 1, end).flatMap((s) => s.views)
    // No clipped run, a base that mapped to nothing to clip against, or a base
    // that *is* an adjustment — an adjustment has no alpha of its own (it
    // inherits the backdrop's), so there is nothing meaningful to clip to and
    // the run renders unclipped rather than vanishing.
    if (
      clipped.length === 0 ||
      base.views.length === 0 ||
      base.views.some((view) => view.kind === 'adjustment')
    ) {
      out.push(...base.views, ...clipped)
      index = end
      continue
    }

    const single = base.views.length === 1 ? base.views[0]! : undefined
    // A clipping run is its own scope: a clipped adjustment adjusts the base
    // (plus any clipped siblings below it), never the document behind them.
    const children = resolveAdjustmentScopes([
      ...(single ? [neutralizeClipBase(single)] : base.views),
      ...clipped,
    ])
    out.push({
      id: `${base.views[0]!.id}::clip`,
      kind: 'group',
      visible: single?.visible ?? true,
      // Hoisted from the base: they apply to the clipped group as a whole.
      opacity: single?.opacity ?? 1,
      fillOpacity: single?.fillOpacity ?? 1,
      blendMode: single?.blendMode ?? 'normal',
      transform: identityTransform(),
      effects: single?.effects ?? [],
      ...(single?.mask ? { mask: single.mask } : {}),
      ...(single?.mask && single.maskHidesEffects ? { maskHidesEffects: true } : {}),
      // Clamped: an adjustment directly above the base absorbs it into a single
      // node, so the base region can be shorter than the raw base view count.
      clipBaseCount: Math.min(base.views.length, children.length),
      children,
    })
    index = end
  }
  return out
}

/**
 * Bottom -> top mapping of one child list. A hidden group (`visible: false`)
 * drops its whole subtree. A group that needs its own buffer
 * (see {@link groupNeedsOwnBuffer}) becomes one nested `RenderGroupLayerView`;
 * a pass-through group inlines its mapped children into this list, with the
 * group's `transform` composed onto each of them. Clipping runs are resolved
 * per sibling list (Photoshop clips within a container).
 */
function mapChildren(
  ids: readonly LayerId[],
  doc: HappyDocument,
  assets: RenderAssetLookup,
  floodMasks: ChromaFloodMaskLookup | undefined,
  parentTransform: RenderLayerTransform,
): RenderLayerView[] {
  const siblings: MappedSibling[] = []
  for (const id of ids) {
    const layer = doc.layers[id]
    if (!layer) continue
    const clipping = layer.clipping === true

    if (layer.type === 'group') {
      if (!layer.visible) continue
      const mask = resolveMask(layer.mask, layer.maskEnabled, assets)
      if (groupNeedsOwnBuffer(layer, mask !== undefined)) {
        siblings.push({
          views: [mapIsolatedGroup(layer, doc, assets, floodMasks, parentTransform, mask)],
          clipping,
        })
      } else {
        siblings.push({
          views: mapChildren(
            layer.children,
            doc,
            assets,
            floodMasks,
            composeLayerTransforms(parentTransform, layer.transform),
          ),
          clipping,
        })
      }
      continue
    }

    const mapped = mapLeafLayer(layer, doc, assets, floodMasks, parentTransform)
    if (mapped) siblings.push({ views: [mapped], clipping })
  }
  return resolveClippingRuns(siblings)
}

/**
 * `HappyDocument` (+ resolved assets) → `RenderDocumentView` (SPEC §6:
 * DocumentStore metadata → RenderCoordinator → Pixi RenderBackend).
 *
 * Raster + text + shape layers are always represented. Groups are inlined
 * (pass-through) unless they need their own buffer — see
 * {@link groupNeedsOwnBuffer} and `SPECS/GROUP-LAYER-FX.md`. Clipping runs
 * become buffered groups with `clipBaseCount`. Adjustment layers swallow the
 * backdrop they modify — see {@link resolveAdjustmentScopes}.
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
    layers: resolveAdjustmentScopes(
      mapChildren(doc.rootChildren, doc, assets, floodMasks, IDENTITY_TRANSFORM),
    ),
  }
}
