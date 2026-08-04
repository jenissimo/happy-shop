import { describe, expect, test } from 'bun:test'
import type { Filter } from 'pixi.js'
import { documentIsolationFilters } from './documentIsolation'

describe('documentIsolationFilters', () => {
  test('always returns a filter so the content layer gets its own render target', () => {
    // A non-empty chain is the whole contract: Pixi only switches render target
    // for a filtered container, and that is what keeps layer blending from
    // sampling the checkerboard sitting beneath the document.
    const fake = { label: 'fake' } as unknown as Filter
    expect(documentIsolationFilters(() => fake)).toEqual([fake])
  })
})
