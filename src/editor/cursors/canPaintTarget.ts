import { getLayer, isLayerImageLocked } from '../../core/document'
import { useEditorSessionStore } from '../session/EditorSessionStore'

/** True when brush/eraser can stroke the current selection (raster, unlocked). */
export function canPaintActiveTarget(): boolean {
  const { document, selectedLayerIds } = useEditorSessionStore.getState()
  const id = selectedLayerIds[0]
  if (!id) return false
  const layer = getLayer(document, id)
  return !!layer && layer.type === 'raster' && !isLayerImageLocked(layer)
}
