/**
 * `buildLayerFilters` and `syncLayerFilters` must scale identically — a chain
 * built at one zoom is patched in place at the next, so any drift between them
 * would show up as an effect that changes size only when the filters happen to
 * be rebuilt.
 *
 * Pixi's `GlProgram` probes a canvas for float precision at construction, so a
 * DOM stub stands in for the browser; nothing here touches a GL context.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import type { Filter } from 'pixi.js'
import type { RenderLayerEffect } from '../../contracts/RenderDocumentView'

beforeAll(() => {
  // Other suites install their own `document`; only fill the gap, and use
  // defineProperty because those stubs are read-only.
  if (!(globalThis as { document?: { createElement?: unknown } }).document?.createElement) {
    Object.defineProperty(globalThis, 'document', {
      value: { createElement: () => ({ getContext: () => null }) },
      configurable: true,
      writable: true,
    })
  }
})

const effects: RenderLayerEffect[] = [
  {
    id: 'stroke-1',
    type: 'stroke',
    enabled: true,
    blendMode: 'normal',
    color: '#000000',
    opacity: 1,
    size: 15,
    position: 'outside',
  },
  {
    id: 'shadow-1',
    type: 'drop-shadow',
    enabled: true,
    blendMode: 'multiply',
    color: '#000000',
    opacity: 0.75,
    angle: 90,
    distance: 20,
    spread: 35,
    size: 10,
    contour: 'linear',
    noise: 0,
    layerKnocksOutDropShadow: true,
  },
]

/** Filters carry one named uniform group; Pixi defines it non-enumerably. */
function uniforms(filter: Filter): Record<string, unknown> {
  const resources = filter.resources as Record<string, { uniforms: Record<string, unknown> }>
  const key = Reflect.ownKeys(resources)[0] as string
  return resources[key]!.uniforms
}

describe('pass scale', () => {
  test('doubles size uniforms and padding when the pass doubles', async () => {
    const { buildLayerFilters } = await import('./buildLayerFilters')
    const one = buildLayerFilters(effects, { scale: 1 })!
    const two = buildLayerFilters(effects, { scale: 2 })!

    expect(uniforms(one[0]!).uSize).toBe(15)
    expect(uniforms(two[0]!).uSize).toBe(30)
    expect((uniforms(two[1]!).uOffset as number[])[1]).toBeCloseTo(
      (uniforms(one[1]!).uOffset as number[])[1]! * 2,
      5,
    )
    expect(uniforms(two[1]!).uBlur).toBe(20)
    // Spread is a percentage of the (scaled) blur, so it must not scale itself.
    expect(uniforms(one[1]!).uSpread).toBe(35)
    expect(uniforms(two[1]!).uSpread).toBe(35)
    expect(two[0]!.padding).toBe(one[0]!.padding * 2)
  })

  test('syncing a chain to a new scale lands on the built values', async () => {
    const { buildLayerFilters } = await import('./buildLayerFilters')
    const { syncLayerFilters } = await import('./syncLayerFilters')
    const chain = buildLayerFilters(effects, { scale: 1 })!
    expect(syncLayerFilters(chain, effects, { scale: 2.5 })).toBe(true)

    const rebuilt = buildLayerFilters(effects, { scale: 2.5 })!
    chain.forEach((filter, index) => {
      expect(uniforms(filter)).toEqual(uniforms(rebuilt[index]!))
      expect(filter.padding).toBe(rebuilt[index]!.padding)
    })
  })
})
