import { getLayer } from '../../core/document'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import {
  getLayerLocalBounds,
  isTransformableLayer,
} from '../tools/move/layerLocalBounds'
import {
  hitTestHandle,
  type HandleId,
  type TransformBox,
} from '../tools/move/transformMath'
import {
  shouldShowTransformHandles,
  useTransformStore,
} from '../tools/move/transformStore'
import { transformableSelection } from '../tools/move/transformCommit'
import { useSelectionTransformStore } from '../tools/selection/selectionTransform'

function handleRadiusDoc(zoom: number): number {
  return 6 / Math.max(zoom, 0.02)
}

function rotateOffsetDoc(zoom: number): number {
  return 22 / Math.max(zoom, 0.02)
}

function primaryBox(): { box: TransformBox; rotationDeg: number } | null {
  const session = useTransformStore.getState().session
  const ids = session?.layerIds ?? transformableSelection()
  if (ids.length === 0) return null
  const doc = useEditorSessionStore.getState().document
  const layerId = ids[ids.length - 1]!
  const layer = getLayer(doc, layerId)
  if (!layer || !isTransformableLayer(layer)) return null
  const bounds = getLayerLocalBounds(layer, doc)
  if (!bounds) return null
  return {
    box: { bounds, transform: { ...layer.transform } },
    rotationDeg: layer.transform.rotationDeg,
  }
}

export type HoverHandleHit = {
  handle: Exclude<HandleId, 'body'>
  rotationDeg: number
}

/** Cursor-only hover hit-test (mirrors MoveToolController radii). */
export function hitTestHoverHandle(
  docX: number,
  docY: number,
  zoom: number,
): HoverHandleHit | null {
  const selectionSession = useSelectionTransformStore.getState().session
  if (selectionSession) {
    const hit = hitTestHandle(
      { x: docX, y: docY },
      {
        bounds: {
          x: selectionSession.bounds.x,
          y: selectionSession.bounds.y,
          w: selectionSession.bounds.width,
          h: selectionSession.bounds.height,
        },
        transform: selectionSession.transform,
      },
      handleRadiusDoc(zoom),
      rotateOffsetDoc(zoom),
    )
    if (!hit || hit === 'body') return null
    return { handle: hit, rotationDeg: selectionSession.transform.rotationDeg }
  }
  const tool = useEditorSessionStore.getState().activeToolId
  const store = useTransformStore.getState()
  if (!shouldShowTransformHandles(tool, store)) return null
  const primary = primaryBox()
  if (!primary) return null
  const hit = hitTestHandle(
    { x: docX, y: docY },
    primary.box,
    handleRadiusDoc(zoom),
    rotateOffsetDoc(zoom),
  )
  if (!hit || hit === 'body') return null
  return { handle: hit, rotationDeg: primary.rotationDeg }
}
