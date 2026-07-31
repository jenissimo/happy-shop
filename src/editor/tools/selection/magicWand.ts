import type { LayerId, Transform } from '../../../core/document'
import { floodSelectMask } from '../../../imaging/worker/floodSelect'
import {
  ensureEditableSurface,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import { SelectionMask } from '../../session/SelectionMask'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { useSelectionToolStore } from '../../session/selectionToolStore'
import {
  documentToLayerLocal,
  layerLocalToDocument,
} from '../brush/layerCoords'

/**
 * Project a layer-local A8 mask into document space, taking max coverage
 * per document pixel when multiple layer samples map to the same cell.
 */
export function projectLayerMaskToDocument(
  localMask: Uint8Array,
  layerWidth: number,
  layerHeight: number,
  canvas: { width: number; height: number },
  transform: Transform,
): { data: Uint8Array; any: boolean } {
  const docData = new Uint8Array(canvas.width * canvas.height)
  let any = false
  for (let ly = 0; ly < layerHeight; ly++) {
    for (let lx = 0; lx < layerWidth; lx++) {
      const coverage = localMask[ly * layerWidth + lx]!
      if (coverage === 0) continue
      const doc = layerLocalToDocument(
        { x: lx + 0.5, y: ly + 0.5 },
        transform,
      )
      const dx = Math.floor(doc.x)
      const dy = Math.floor(doc.y)
      if (dx < 0 || dy < 0 || dx >= canvas.width || dy >= canvas.height) {
        continue
      }
      const index = dy * canvas.width + dx
      if (coverage > docData[index]!) {
        docData[index] = coverage
      }
      any = true
    }
  }
  return { data: docData, any }
}

/**
 * Magic wand: flood active raster layer → document-space selection mask.
 */
export async function applyMagicWandAt(
  docX: number,
  docY: number,
): Promise<boolean> {
  const session = useEditorSessionStore.getState()
  const layerId = session.selectedLayerIds[0] as LayerId | undefined
  if (!layerId) return false
  const layer = session.document.layers[layerId]
  if (!layer || layer.type !== 'raster') return false

  const surface = await ensureEditableSurface(layer.pixels)
  if (!surface) return false

  const local = documentToLayerLocal({ x: docX, y: docY }, layer.transform)
  const seedX = Math.floor(local.x)
  const seedY = Math.floor(local.y)
  if (
    seedX < 0 ||
    seedY < 0 ||
    seedX >= surface.width ||
    seedY >= surface.height
  ) {
    return false
  }

  const { antiAlias, featherRadius, wandTolerance } =
    useSelectionToolStore.getState()
  const { data, width, height } = surface.toRgbaBuffer()
  const localMask = floodSelectMask(data, {
    width,
    height,
    seedX,
    seedY,
    tolerance: wandTolerance,
    antiAlias,
  })

  const canvas = session.document.canvas
  const projected = projectLayerMaskToDocument(
    localMask,
    width,
    height,
    canvas,
    layer.transform,
  )
  if (!projected.any) return false

  let incoming = SelectionMask.fromData(canvas.width, canvas.height, projected.data)
  if (featherRadius > 0) {
    incoming = incoming.feather(featherRadius)
  }
  useSelectionStore.getState().applyMask(incoming)
  return true
}
