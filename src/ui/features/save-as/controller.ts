import { useSyncExternalStore } from 'react'

type VoidListener = () => void

let dialogOpen = false
const openListeners = new Set<VoidListener>()

function notify(): void {
  for (const listener of openListeners) listener()
}

export function isSaveAsDialogOpen(): boolean {
  return dialogOpen
}

export function openSaveAsDialog(): void {
  if (dialogOpen) return
  dialogOpen = true
  notify()
}

export function closeSaveAsDialog(): void {
  if (!dialogOpen) return
  dialogOpen = false
  notify()
}

export function subscribeSaveAsDialogOpen(listener: VoidListener): () => void {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

export function useSaveAsDialogOpen(): boolean {
  return useSyncExternalStore(subscribeSaveAsDialogOpen, isSaveAsDialogOpen)
}
