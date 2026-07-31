import { useSyncExternalStore } from 'react'

type VoidListener = () => void

let dialogOpen = false
const openListeners = new Set<VoidListener>()

function notify(): void {
  for (const listener of openListeners) listener()
}

export function isCanvasSizeDialogOpen(): boolean {
  return dialogOpen
}

export function openCanvasSizeDialog(): void {
  if (dialogOpen) return
  dialogOpen = true
  notify()
}

export function closeCanvasSizeDialog(): void {
  if (!dialogOpen) return
  dialogOpen = false
  notify()
}

export function subscribeCanvasSizeDialogOpen(listener: VoidListener): () => void {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

export function useCanvasSizeDialogOpen(): boolean {
  return useSyncExternalStore(subscribeCanvasSizeDialogOpen, isCanvasSizeDialogOpen)
}
