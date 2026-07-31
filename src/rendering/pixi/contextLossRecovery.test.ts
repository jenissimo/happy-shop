import { describe, expect, test } from 'bun:test'
import {
  attachWebGlContextLossListeners,
  dispatchSyntheticContextLoss,
  dispatchSyntheticContextRestored,
  initialContextLossUiState,
  reduceContextLossUi,
  CONTEXT_LOSS_MESSAGES,
} from './contextLossRecovery'

function fakeCanvas(): HTMLCanvasElement {
  const listeners = new Map<string, Set<EventListener>>()
  return {
    addEventListener(type: string, listener: EventListener) {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(listener)
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener)
    },
    dispatchEvent(event: Event) {
      const set = listeners.get(event.type)
      if (!set) return true
      for (const listener of [...set]) {
        listener.call(this as unknown as HTMLCanvasElement, event)
      }
      return !event.defaultPrevented
    },
  } as unknown as HTMLCanvasElement
}

describe('reduceContextLossUi', () => {
  test('lost → recovering → restored clears banner', () => {
    let state = initialContextLossUiState
    state = reduceContextLossUi(state, { type: 'lost' })
    expect(state.phase).toBe('lost')
    expect(state.message).toBe(CONTEXT_LOSS_MESSAGES.lost)

    state = reduceContextLossUi(state, { type: 'recovering' })
    expect(state.phase).toBe('recovering')

    state = reduceContextLossUi(state, { type: 'restored' })
    expect(state.phase).toBe('ok')
    expect(state.message).toBeNull()
  })

  test('failed keeps recovery CTA message', () => {
    const state = reduceContextLossUi(initialContextLossUiState, {
      type: 'failed',
    })
    expect(state.phase).toBe('failed')
    expect(state.message).toBe(CONTEXT_LOSS_MESSAGES.failed)
  })
})

describe('attachWebGlContextLossListeners', () => {
  test('synthetic lost preventDefaults and notifies; restored rebuilds path', () => {
    const canvas = fakeCanvas()
    const events: string[] = []
    const detach = attachWebGlContextLossListeners(canvas, {
      onLost: (event) => {
        expect(event.defaultPrevented).toBe(true)
        events.push('lost')
      },
      onRestored: () => {
        events.push('restored')
      },
    })

    dispatchSyntheticContextLoss(canvas)
    dispatchSyntheticContextRestored(canvas)
    expect(events).toEqual(['lost', 'restored'])

    detach()
    dispatchSyntheticContextLoss(canvas)
    expect(events).toEqual(['lost', 'restored'])
  })
})
