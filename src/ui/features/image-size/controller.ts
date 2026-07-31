import { useSyncExternalStore } from 'react'

type Listener = () => void

let open = false
const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach((listener) => listener())
}

export function openImageSizeDialog(): void {
  if (open) return
  open = true
  notify()
}

export function closeImageSizeDialog(): void {
  if (!open) return
  open = false
  notify()
}

export function useImageSizeDialogOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open,
  )
}
