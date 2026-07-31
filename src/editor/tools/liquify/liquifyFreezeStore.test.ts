import { describe, expect, test } from 'bun:test'
import { useLiquifyFreezeStore } from './liquifyFreezeStore'

describe('liquifyFreezeStore', () => {
  test('ensureMask allocates and reuses layer-local A8 buffer', () => {
    useLiquifyFreezeStore.setState({ masks: {}, version: 0 })
    const first = useLiquifyFreezeStore.getState().ensureMask('layer-a', 16, 16)
    const second = useLiquifyFreezeStore.getState().ensureMask('layer-a', 16, 16)
    expect(first).toBe(second)
    expect(first.length).toBe(256)
    expect(first.every((v) => v === 0)).toBe(true)
  })

  test('ensureMask reallocates when layer dimensions change', () => {
    useLiquifyFreezeStore.setState({ masks: {}, version: 0 })
    const small = useLiquifyFreezeStore.getState().ensureMask('layer-a', 8, 8)
    const large = useLiquifyFreezeStore.getState().ensureMask('layer-a', 16, 16)
    expect(small).not.toBe(large)
    expect(large.length).toBe(256)
  })

  test('clearMask removes the layer entry and bumps version', () => {
    useLiquifyFreezeStore.setState({ masks: {}, version: 0 })
    useLiquifyFreezeStore.getState().ensureMask('layer-a', 4, 4)
    useLiquifyFreezeStore.getState().clearMask('layer-a')
    expect(useLiquifyFreezeStore.getState().getMask('layer-a')).toBeUndefined()
    expect(useLiquifyFreezeStore.getState().version).toBe(1)
  })
})
