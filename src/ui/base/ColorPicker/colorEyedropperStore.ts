/**
 * App-scoped color eyedropper — viewport samples the active raster layer.
 * Used by ColorPicker; parallel to chromaSampleStore but not dialog-scoped.
 */

type ColorEyedropperState = {
  active: boolean
  /** Called with CSS #rrggbb when a sample succeeds. */
  onSample: ((hex: string) => void) | null
}

let state: ColorEyedropperState = {
  active: false,
  onSample: null,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeColorEyedropper(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getColorEyedropperState(): Readonly<ColorEyedropperState> {
  return state
}

export function beginColorEyedropper(onSample: (hex: string) => void): void {
  state = { active: true, onSample }
  emit()
}

export function endColorEyedropper(): void {
  state = { active: false, onSample: null }
  emit()
}

export function isColorEyedropperActive(): boolean {
  return state.active
}
