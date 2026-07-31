/**
 * Layer → Merge Down / Merge Visible (PS Mod+E / Mod+Shift+E).
 * CPU flatten via {@link compositeRasterLayers}; one metadata history txn.
 */

import type { CommandRegistry } from '../../core/commands/registry'
import {
  asRasterAssetRef,
  createAssetId,
  createIdentityTransform,
  createRasterLayer,
  getChildrenIds,
  removeLayer,
  replaceLayer,
  type HappyDocument,
  type LayerId,
  type RasterAssetRef,
  type RasterLayer,
} from '../../core/document'
import { createMetadataEntry } from '../../core/history'
import {
  ensureEditableSurface,
  getEditableSurface,
  getRasterSurface,
  registerRasterSurface,
  TiledRasterSurface,
} from '../../imaging'
import { setEditableSurface } from '../../imaging/surfaces/EditableSurfaceStore'
import {
  compositeRasterLayers,
  layerDocAabb,
  unionDocRegions,
  visibleRasterLayers,
  type DocRegion,
} from './compositeRasters'
import { documentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'

function hasRasterData(layer: RasterLayer): boolean {
  return (
    getRasterSurface(layer.pixels) != null ||
    getEditableSurface(String(layer.pixels)) != null
  )
}

function applyDoc(doc: HappyDocument): void {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function pushMergeTxn(
  label: string,
  before: HappyDocument,
  after: HappyDocument,
  selectedLayerIds: LayerId[],
): void {
  if (before === after) return
  documentHistory.push(
    createMetadataEntry({
      label,
      before,
      after,
      apply: applyDoc,
    }),
  )
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    historyVersion: documentHistory.version,
    selectedLayerIds,
  })
  useEditorSessionStore.getState().bumpRasterEpoch()
}

async function registerMergedPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<RasterAssetRef> {
  const assetId = createAssetId()
  let bitmap: ImageBitmap
  try {
    if (
      typeof createImageBitmap === 'function' &&
      typeof ImageData !== 'undefined'
    ) {
      bitmap = await createImageBitmap(
        new ImageData(rgba as ImageDataArray, width, height),
      )
    } else {
      bitmap = { width, height, close() {} } as ImageBitmap
    }
  } catch {
    bitmap = { width, height, close() {} } as ImageBitmap
  }

  registerRasterSurface({ assetId, width, height, bitmap })
  const surface = TiledRasterSurface.fromImageData(assetId, {
    data: rgba.slice(),
    width,
    height,
  } as ImageData)
  setEditableSurface(surface)
  return asRasterAssetRef(assetId)
}

async function regionForLayers(
  layers: readonly RasterLayer[],
): Promise<DocRegion | null> {
  let region: DocRegion | null = null
  for (const layer of layers) {
    const surface = await ensureEditableSurface(String(layer.pixels))
    if (!surface) continue
    const aabb = layerDocAabb(layer.transform, surface.width, surface.height)
    region = region ? unionDocRegions(region, aabb) : aabb
  }
  return region
}

function asMergedRaster(
  target: RasterLayer,
  pixels: RasterAssetRef,
  originX: number,
  originY: number,
): RasterLayer {
  return createRasterLayer({
    id: target.id,
    name: target.name,
    parentId: target.parentId,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { ...createIdentityTransform(), x: originX, y: originY },
    effects: [],
    pixels,
  })
}

function mergeDownPair(): {
  above: RasterLayer
  below: RasterLayer
  document: HappyDocument
} | null {
  const { selectedLayerIds, document } = useEditorSessionStore.getState()
  if (selectedLayerIds.length !== 1) return null
  const aboveId = selectedLayerIds[0]!
  const above = document.layers[aboveId]
  if (
    !above ||
    above.type !== 'raster' ||
    above.locked ||
    !hasRasterData(above)
  ) return null

  const siblings = getChildrenIds(document, above.parentId)
  if (!siblings) return null
  const index = siblings.indexOf(aboveId)
  if (index <= 0) return null

  const below = document.layers[siblings[index - 1]!]
  if (
    !below ||
    below.type !== 'raster' ||
    below.locked ||
    !hasRasterData(below)
  ) return null

  return { above, below, document }
}

/** Merge active raster into the sibling below (PS Merge Down). */
export async function mergeDownSelected(): Promise<boolean> {
  const pair = mergeDownPair()
  if (!pair) return false
  const { above, below, document: before } = pair

  const region = await regionForLayers([below, above])
  if (!region) return false

  const composited = await compositeRasterLayers([below, above], region)
  if (!composited) return false

  const pixels = await registerMergedPixels(
    composited.rgba,
    composited.width,
    composited.height,
  )
  const merged = asMergedRaster(
    below,
    pixels,
    composited.originX,
    composited.originY,
  )
  let after = replaceLayer(before, merged)
  after = removeLayer(after, above.id)
  pushMergeTxn('Merge Down', before, after, [below.id])
  return true
}

function visibleMergeCandidates(doc: HappyDocument): RasterLayer[] {
  return visibleRasterLayers(doc).filter(
    (layer): layer is RasterLayer =>
      layer.type === 'raster' && !layer.locked && hasRasterData(layer),
  )
}

/** Flatten all visible unlocked rasters into the bottommost one (PS Merge Visible). */
export async function mergeVisibleLayers(): Promise<boolean> {
  const before = useEditorSessionStore.getState().document
  const candidates = visibleMergeCandidates(before)
  if (candidates.length < 2) return false

  const region = await regionForLayers(candidates)
  if (!region) return false

  const composited = await compositeRasterLayers(candidates, region)
  if (!composited) return false

  const target = candidates[0]!
  const pixels = await registerMergedPixels(
    composited.rgba,
    composited.width,
    composited.height,
  )
  const merged = asMergedRaster(
    target,
    pixels,
    composited.originX,
    composited.originY,
  )
  let after = replaceLayer(before, merged)
  for (const layer of candidates) {
    if (layer.id === target.id) continue
    after = removeLayer(after, layer.id)
  }
  pushMergeTxn('Merge Visible', before, after, [target.id])
  return true
}

export function canMergeDown(): boolean {
  return mergeDownPair() != null
}

export function canMergeVisible(): boolean {
  const doc = useEditorSessionStore.getState().document
  return visibleMergeCandidates(doc).length >= 2
}

export function registerLayerMergeCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'layer.mergeDown',
    title: 'Merge Down',
    shortcut: 'Mod+E',
    enabled: canMergeDown,
    run: () => {
      void mergeDownSelected().catch((err) => {
        console.error('[layer.mergeDown] failed', err)
      })
    },
  })

  // Photoshop Win/Mac: Ctrl/Cmd+Shift+E (not Alt+E).
  registry.register({
    id: 'layer.mergeVisible',
    title: 'Merge Visible',
    shortcut: 'Mod+Shift+E',
    enabled: canMergeVisible,
    run: () => {
      void mergeVisibleLayers().catch((err) => {
        console.error('[layer.mergeVisible] failed', err)
      })
    },
  })
}
