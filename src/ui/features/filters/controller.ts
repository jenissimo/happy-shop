import { useSyncExternalStore } from 'react'

type Listener = () => void

let gaussianBlurOpen = false
let sharpenOpen = false
let noiseOpen = false
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function openGaussianBlurDialog(): void {
  if (gaussianBlurOpen) return
  gaussianBlurOpen = true
  notify()
}

export function closeGaussianBlurDialog(): void {
  if (!gaussianBlurOpen) return
  gaussianBlurOpen = false
  notify()
}

export function useGaussianBlurDialogOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => gaussianBlurOpen,
  )
}

export function openSharpenDialog(): void {
  if (sharpenOpen) return
  sharpenOpen = true
  notify()
}

export function closeSharpenDialog(): void {
  if (!sharpenOpen) return
  sharpenOpen = false
  notify()
}

export function useSharpenDialogOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => sharpenOpen,
  )
}

export function openNoiseDialog(): void {
  if (noiseOpen) return
  noiseOpen = true
  notify()
}

export function closeNoiseDialog(): void {
  if (!noiseOpen) return
  noiseOpen = false
  notify()
}

export function useNoiseDialogOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => noiseOpen,
  )
}
