import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EXTRAS_OVERLAYS, useViewPreferencesStore } from './viewPreferencesStore'

const initial = useViewPreferencesStore.getState()

afterEach(() => {
  useViewPreferencesStore.setState({
    showGrid: initial.showGrid,
    showPixelGrid: initial.showPixelGrid,
    extrasVisible: true,
  })
})

describe('View → Extras master switch', () => {
  test('starts visible and toggles', () => {
    expect(useViewPreferencesStore.getState().extrasVisible).toBe(true)
    useViewPreferencesStore.getState().toggleExtras()
    expect(useViewPreferencesStore.getState().extrasVisible).toBe(false)
    useViewPreferencesStore.getState().toggleExtras()
    expect(useViewPreferencesStore.getState().extrasVisible).toBe(true)
  })

  test('hiding extras never clobbers the individual overlay toggles', () => {
    const store = useViewPreferencesStore.getState()
    store.setShowGrid(true)
    store.setShowPixelGrid(false)

    store.toggleExtras()

    // The per-overlay prefs are untouched — Extras only gates rendering.
    expect(useViewPreferencesStore.getState().showGrid).toBe(true)
    expect(useViewPreferencesStore.getState().showPixelGrid).toBe(false)

    // …and an individual toggle flipped while Extras is off is remembered.
    useViewPreferencesStore.getState().setShowPixelGrid(true)
    useViewPreferencesStore.getState().toggleExtras()

    expect(useViewPreferencesStore.getState().extrasVisible).toBe(true)
    expect(useViewPreferencesStore.getState().showGrid).toBe(true)
    expect(useViewPreferencesStore.getState().showPixelGrid).toBe(true)
  })

  test('setExtrasVisible is idempotent and independent of grid state', () => {
    useViewPreferencesStore.getState().setShowGrid(false)
    useViewPreferencesStore.getState().setExtrasVisible(false)
    useViewPreferencesStore.getState().setExtrasVisible(false)
    expect(useViewPreferencesStore.getState().extrasVisible).toBe(false)
    expect(useViewPreferencesStore.getState().showGrid).toBe(false)
  })

  test('documents the governed overlay set (rulers excluded, as in Photoshop)', () => {
    expect([...EXTRAS_OVERLAYS]).toEqual([
      'guides',
      'grid',
      'pixelGrid',
      'selectionEdges',
      'targetPaths',
      'transformHandles',
    ])
    expect(EXTRAS_OVERLAYS).not.toContain('rulers' as never)
  })
})

/**
 * The overlays themselves are drawn through Pixi/WebGL, which cannot be
 * exercised in this unit-test environment — there is no GL context here. These
 * source-level assertions are the honest substitute: they pin that the render
 * paths read the gate rather than pretending to verify pixels.
 */
describe('Extras gating is wired into the render paths', () => {
  test('OverlayPass short-circuits its whole sync on extrasVisible', () => {
    const src = readFileSync(
      join(import.meta.dirname, '../../rendering/pixi/OverlayPass.ts'),
      'utf8',
    )
    expect(src).toContain('useViewPreferencesStore.getState().extrasVisible')
    expect(src).toContain('this.hideAll()')
    // Gating must not write the individual preferences.
    expect(src).not.toContain('setShowGrid')
    expect(src).not.toContain('setShowPixelGrid')
  })

  test('ViewportHost gates guides but not rulers', () => {
    const src = readFileSync(join(import.meta.dirname, 'ViewportHost.tsx'), 'utf8')
    expect(src).toContain('state.extrasVisible')
    expect(src).toContain('(extrasVisible ? guides : [])')
    expect(src).toContain('{showRulers ? (')
  })
})
