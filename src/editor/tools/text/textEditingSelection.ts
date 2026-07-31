import type { LayerId } from '../../../core/document'
import { useTextToolStore } from './textToolStore'

let activeSelection: { layerId: LayerId; start: number; end: number } | null = null

export function setTextEditingSelection(
  layerId: LayerId,
  start: number,
  end: number,
): void {
  activeSelection = { layerId, start, end }
  useTextToolStore.getState().setSelection(activeSelection)
}

export function getTextEditingSelection(layerId: LayerId) {
  return activeSelection?.layerId === layerId ? activeSelection : null
}

export function clearTextEditingSelection(layerId?: LayerId): void {
  if (!layerId || activeSelection?.layerId === layerId) {
    activeSelection = null
    useTextToolStore.getState().setSelection(null)
  }
}
