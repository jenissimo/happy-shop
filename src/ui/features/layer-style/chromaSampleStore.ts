/**
 * Dialog-scoped chroma eyedropper / flood-seed sample mode.
 * Viewport router checks this before normal tool routing.
 */

type SampleKind = 'key-color' | 'flood-origin' | null

type ChromaSampleState = {
  kind: SampleKind
  layerId: string | null
  /** Called with CSS #RRGGBB when a key-color sample succeeds. */
  onKeyColor: ((hex: string) => void) | null
  /** Called with layer-local pixel when a flood seed is placed. */
  onFloodOrigin: ((pt: { x: number; y: number }, additive: boolean) => void) | null
}

let state: ChromaSampleState = {
  kind: null,
  layerId: null,
  onKeyColor: null,
  onFloodOrigin: null,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeChromaSample(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getChromaSampleState(): Readonly<ChromaSampleState> {
  return state
}

export function beginChromaKeySample(options: {
  layerId: string
  onKeyColor: (hex: string) => void
}): void {
  state = {
    kind: 'key-color',
    layerId: options.layerId,
    onKeyColor: options.onKeyColor,
    onFloodOrigin: null,
  }
  emit()
}

export function beginChromaFloodSample(options: {
  layerId: string
  onFloodOrigin: (pt: { x: number; y: number }, additive: boolean) => void
}): void {
  state = {
    kind: 'flood-origin',
    layerId: options.layerId,
    onKeyColor: null,
    onFloodOrigin: options.onFloodOrigin,
  }
  emit()
}

export function endChromaSample(): void {
  state = {
    kind: null,
    layerId: null,
    onKeyColor: null,
    onFloodOrigin: null,
  }
  emit()
}

export function isChromaSampling(): boolean {
  return state.kind !== null
}
