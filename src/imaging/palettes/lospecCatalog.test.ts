import { describe, expect, test } from 'bun:test'
import {
  LospecPaletteIndexEntrySchema,
  LospecPaletteSchema,
  normalizeHexColor,
} from './index'

describe('Lospec offline palette catalog', () => {
  test('ships a provenance-backed index with matching palette manifests', async () => {
    const index = LospecPaletteIndexEntrySchema.array().parse(
      JSON.parse(await Bun.file('public/palettes/lospec/index.json').text()),
    )

    expect(index.length).toBeGreaterThanOrEqual(4)
    expect(new Set(index.map((entry) => entry.id)).size).toBe(index.length)

    for (const entry of index) {
      expect(entry.sourceUrl).toMatch(/^https:\/\/lospec\.com\/palette-list\//)
      expect(entry.sourceUrl).not.toMatch(/\.(?:png|jpg|gif|webp)$/i)
    }

    const glob = new Bun.Glob('palettes/*.json')
    const manifests = []
    for await (const path of glob.scan({ cwd: 'public/palettes/lospec' })) {
      manifests.push(
        LospecPaletteSchema.parse(
          JSON.parse(await Bun.file(`public/palettes/lospec/${path}`).text()),
        ),
      )
    }

    expect(manifests).toHaveLength(index.length)
    const indexById = new Map(index.map((entry) => [entry.id, entry]))

    for (const manifest of manifests) {
      const indexEntry = indexById.get(manifest.id)
      expect(indexEntry).toBeDefined()
      expect(manifest.colorCount).toBe(manifest.colors.length)
      expect(indexEntry!.colorCount).toBe(manifest.colors.length)
      expect(indexEntry!.name).toBe(manifest.name)
      expect(manifest.licenseNote.trim()).not.toBe('')
      for (const color of manifest.colors) {
        expect(color).toMatch(/^#[0-9A-F]{6}$/)
        expect(color).toBe(normalizeHexColor(color))
      }
    }
  })
})

describe('normalizeHexColor', () => {
  test('accepts hash and bare hex', () => {
    expect(normalizeHexColor('#aabbcc')).toBe('#AABBCC')
    expect(normalizeHexColor('aabbcc')).toBe('#AABBCC')
  })

  test('rejects invalid values', () => {
    expect(() => normalizeHexColor('#abc')).toThrow(/Invalid hex color/)
  })
})
