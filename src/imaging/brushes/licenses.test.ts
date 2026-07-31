import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BrushTipDescriptorSchema } from './tipDescriptor'

const BRUSH_ROOT = 'public/brushes'
const ALLOWED_SPDX = new Set(['CC0-1.0', 'Apache-2.0', 'MIT', 'CC-BY-4.0'])
const MAX_PNG_BYTES = 1.5 * 1024 * 1024

function listedPacks(): string[] {
  return JSON.parse(readFileSync(join(BRUSH_ROOT, 'index.json'), 'utf8')) as string[]
}

describe('vendored brush pack licenses', () => {
  test('every listed pack has valid provenance and a license file', () => {
    const notice = readFileSync(join(BRUSH_ROOT, 'NOTICE.md'), 'utf8')
    for (const pack of listedPacks()) {
      const packPath = join(BRUSH_ROOT, pack)
      expect(existsSync(join(packPath, 'LICENSE'))).toBe(true)
      expect(readFileSync(join(packPath, 'LICENSE'), 'utf8').trim()).not.toBe('')
      expect(notice).toContain(`| \`${pack}\` |`)

      const manifest = BrushTipDescriptorSchema.array().parse(
        JSON.parse(readFileSync(join(packPath, 'manifest.json'), 'utf8')),
      )
      expect(manifest.length).toBeGreaterThan(0)
      for (const tip of manifest) {
        expect(tip.pack).toBe(pack)
        expect(ALLOWED_SPDX.has(tip.license.spdx)).toBe(true)
        expect(() => new URL(tip.license.source)).not.toThrow()
      }
    }
  })

  test('all vendored brush PNGs remain under the byte cap', () => {
    const bytes = readdirSync(BRUSH_ROOT, { recursive: true })
      .filter((entry) => typeof entry === 'string' && entry.endsWith('.png'))
      .reduce((total, entry) => total + statSync(join(BRUSH_ROOT, entry)).size, 0)
    expect(bytes).toBeLessThan(MAX_PNG_BYTES)
  })
})
