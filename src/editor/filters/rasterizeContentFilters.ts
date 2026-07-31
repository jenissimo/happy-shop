import {
  effectPhase,
  getLayer,
  isLayerImageLocked,
  setLayerEffects,
  type HappyDocument,
  type LayerEffect,
} from '../../core/document'
import { createCombinedEntry } from '../../core/history/combinedEntry'
import { createMetadataEntry } from '../../core/history/metadataEntry'
import { createRasterEntry } from '../../core/history/rasterEntry'
import {
  ensureEditableSurface,
  syncEditableSurfaceToBitmap,
} from '../../imaging/surfaces/EditableSurfaceStore'
import {
  TILE_SIZE,
  type RasterPatch,
  type TiledRasterSurface,
} from '../../imaging/surfaces/TiledRasterSurface'
import { applyEffectStack } from '../../rendering/effects/applyEffectStack'
import type { RenderLayerEffect } from '../../rendering/contracts/RenderDocumentView'
import { documentHistory } from '../session/documentHistory'
import { useEditorSessionStore } from '../session/EditorSessionStore'

const BAKE_HISTORY_LABEL = 'Rasterize Filters'

function applyDocument(doc: HappyDocument): void {
  useEditorSessionStore.setState({
    document: doc,
    dirty: true,
    historyVersion: documentHistory.version,
  })
}

/** Enabled key + content nodes mapped for CPU bake (no style-phase). */
function mapEffectsForBake(effects: LayerEffect[]): RenderLayerEffect[] {
  return effects
    .filter(
      (effect) =>
        effect.enabled &&
        (effectPhase(effect.type) === 'key' || effectPhase(effect.type) === 'content'),
    )
    .map((effect): RenderLayerEffect => {
      switch (effect.type) {
        case 'chroma-key':
          return {
            id: effect.id,
            type: 'chroma-key',
            enabled: effect.enabled,
            keyColor: effect.keyColor,
            mode: effect.mode,
            floodOrigins: effect.floodOrigins,
            tolerance: effect.tolerance,
            softness: effect.softness,
            despill: effect.despill,
            choke: effect.choke,
            edgeBlur: effect.edgeBlur,
          }
        case 'gaussian-blur':
          return {
            id: effect.id,
            type: 'gaussian-blur',
            enabled: effect.enabled,
            radius: effect.radius,
          }
        case 'sharpen':
          return {
            id: effect.id,
            type: 'sharpen',
            enabled: effect.enabled,
            amount: effect.amount,
            radius: effect.radius,
          }
        case 'adjustment':
          return {
            id: effect.id,
            type: 'adjustment',
            enabled: effect.enabled,
            adjustment: effect.adjustment,
          }
        case 'noise':
          return {
            id: effect.id,
            type: 'noise',
            enabled: effect.enabled,
            amount: effect.amount,
            distribution: effect.distribution,
            monochromatic: effect.monochromatic,
          }
        default:
          throw new Error(`unexpected bake effect type: ${(effect as LayerEffect).type}`)
      }
    })
}

function writeFullSurfacePatch(
  surface: TiledRasterSurface,
  rgba: Uint8ClampedArray,
): RasterPatch {
  const region = { x: 0, y: 0, width: surface.width, height: surface.height }
  const touched = surface.readTiles(region)
  const beforeSnapshots = touched.map((tile) => ({
    tileX: tile.tileX,
    tileY: tile.tileY,
    width: tile.width,
    height: tile.height,
    before: tile.data.slice(),
  }))
  surface.writeRegion(region, rgba)
  return {
    surfaceId: surface.id,
    tiles: beforeSnapshots.map((snap) => {
      const tile = surface.readTiles({
        x: snap.tileX * TILE_SIZE,
        y: snap.tileY * TILE_SIZE,
        width: 1,
        height: 1,
      })[0]!
      return {
        ...snap,
        after: tile.data.slice(),
      }
    }),
  }
}

export function layerHasContentFilters(effects: LayerEffect[] | undefined): boolean {
  return (effects ?? []).some((effect) => effectPhase(effect.type) === 'content')
}

export function canRasterizeContentFilters(): boolean {
  const state = useEditorSessionStore.getState()
  const id = state.selectedLayerIds[0]
  const layer = id && getLayer(state.document, id)
  if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false
  return layerHasContentFilters(layer.effects)
}

/**
 * Bake enabled key + content FX into raster pixels, then remove content-phase nodes.
 * Style-phase Layer Styles stay live. One combined history transaction.
 */
export async function rasterizeContentFilters(): Promise<boolean> {
  if (!canRasterizeContentFilters()) return false

  const state = useEditorSessionStore.getState()
  const layerId = state.selectedLayerIds[0]!
  const beforeDoc = state.document
  const layer = getLayer(beforeDoc, layerId)
  if (!layer || layer.type !== 'raster') return false

  const bakeEffects = mapEffectsForBake(layer.effects)
  if (!bakeEffects.some((effect) => effectPhase(effect.type) === 'content')) {
    return false
  }

  const surfaceId = String(layer.pixels)
  const surface = await ensureEditableSurface(surfaceId, beforeDoc.canvas)
  if (!surface) return false

  const { data, width, height } = surface.toRgbaBuffer()
  const baked = applyEffectStack(data.slice(), width, height, bakeEffects)
  const patch = writeFullSurfacePatch(surface, baked)
  if (!patch.tiles.length) return false

  await syncEditableSurfaceToBitmap(surfaceId)

  const remainingEffects = layer.effects.filter(
    (effect) => effectPhase(effect.type) !== 'content',
  )
  const afterDoc = setLayerEffects(beforeDoc, layerId, remainingEffects)
  if (afterDoc === beforeDoc) return false

  const invalidate = () => useEditorSessionStore.getState().bumpRasterEpoch()
  documentHistory.push(
    createCombinedEntry(BAKE_HISTORY_LABEL, [
      createRasterEntry({
        label: BAKE_HISTORY_LABEL,
        patch,
        onInvalidated: invalidate,
      }),
      createMetadataEntry({
        label: BAKE_HISTORY_LABEL,
        before: beforeDoc,
        after: afterDoc,
        apply: applyDocument,
      }),
    ]),
  )

  applyDocument(afterDoc)
  invalidate()
  return true
}
