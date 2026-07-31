import { useSyncExternalStore } from 'react'
import type { LayerId } from '../../../core/document'
import type { StyleEffectKey } from './defaults'
import type { ContentEffectKey } from '../content-filters/defaults'

export type LayerStyleFocusEffect = StyleEffectKey | ContentEffectKey

export type LayerStyleDialogState = {
  open: boolean
  layerId: LayerId | null
  focusEffect: LayerStyleFocusEffect | null
}

let state: LayerStyleDialogState = {
  open: false,
  layerId: null,
  focusEffect: null,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function openLayerStyleDialog(
  layerId: LayerId | string,
  focusEffect?: LayerStyleFocusEffect,
): void {
  state = {
    open: true,
    layerId: layerId as LayerId,
    focusEffect: focusEffect ?? null,
  }
  emit()
}

export function closeLayerStyleDialog(): void {
  state = { open: false, layerId: null, focusEffect: null }
  emit()
}

export function getLayerStyleDialogState(): LayerStyleDialogState {
  return state
}

export function subscribeLayerStyleDialog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLayerStyleDialogState(): LayerStyleDialogState {
  return useSyncExternalStore(subscribeLayerStyleDialog, getLayerStyleDialogState)
}
