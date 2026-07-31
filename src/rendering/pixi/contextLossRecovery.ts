/**
 * WebGL context-loss recovery helpers (WS-HARDEN).
 * Pixi already preventDefaults + restores GL; we surface UI state and rebuild
 * owned GPU resources so the canvas does not stay silently black.
 */

export type GpuContextPhase = 'ok' | 'lost' | 'recovering' | 'failed'

export type ContextLossUiState = {
  phase: GpuContextPhase
  /** Short user-facing message; null when phase is ok. */
  message: string | null
}

export type ContextLossAction =
  | { type: 'lost' }
  | { type: 'recovering' }
  | { type: 'restored' }
  | { type: 'failed'; error?: string }
  | { type: 'dismiss' }

export const CONTEXT_LOSS_MESSAGES = {
  lost: 'Graphics context lost — waiting to restore…',
  recovering: 'Restoring graphics…',
  failed: 'Could not restore graphics. Reload the viewport to continue.',
} as const

export const initialContextLossUiState: ContextLossUiState = {
  phase: 'ok',
  message: null,
}

export function reduceContextLossUi(
  state: ContextLossUiState,
  action: ContextLossAction,
): ContextLossUiState {
  switch (action.type) {
    case 'lost':
      return { phase: 'lost', message: CONTEXT_LOSS_MESSAGES.lost }
    case 'recovering':
      return { phase: 'recovering', message: CONTEXT_LOSS_MESSAGES.recovering }
    case 'restored':
      return { phase: 'ok', message: null }
    case 'failed':
      return {
        phase: 'failed',
        message: action.error?.trim() || CONTEXT_LOSS_MESSAGES.failed,
      }
    case 'dismiss':
      return initialContextLossUiState
    default:
      return state
  }
}

export type WebGlContextLossHandlers = {
  onLost: (event: Event) => void
  onRestored: (event: Event) => void
}

/**
 * Listen for canvas WebGL context loss/restore. Always preventDefault on lost
 * so the browser may restore the context.
 */
export function attachWebGlContextLossListeners(
  canvas: HTMLCanvasElement,
  handlers: WebGlContextLossHandlers,
): () => void {
  const onLost = (event: Event) => {
    event.preventDefault()
    handlers.onLost(event)
  }
  const onRestored = (event: Event) => {
    handlers.onRestored(event)
  }
  canvas.addEventListener('webglcontextlost', onLost, false)
  canvas.addEventListener('webglcontextrestored', onRestored, false)
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost, false)
    canvas.removeEventListener('webglcontextrestored', onRestored, false)
  }
}

/** Dispatch synthetic loss/restore for tests and E2E hooks. */
export function dispatchSyntheticContextLoss(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(
    new Event('webglcontextlost', { cancelable: true, bubbles: true }),
  )
}

export function dispatchSyntheticContextRestored(
  canvas: HTMLCanvasElement,
): void {
  canvas.dispatchEvent(
    new Event('webglcontextrestored', { cancelable: true, bubbles: true }),
  )
}
