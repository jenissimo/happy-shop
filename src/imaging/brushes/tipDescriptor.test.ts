import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROCEDURAL_TIPS } from './presets/proc'
import { BrushTipDescriptorSchema } from './tipDescriptor'

describe('BrushTipDescriptorSchema', () => {
  test('parses every built-in procedural descriptor', () => {
    expect(PROCEDURAL_TIPS).toHaveLength(9)
    for (const tip of PROCEDURAL_TIPS) {
      expect(BrushTipDescriptorSchema.parse(tip)).toEqual(tip)
    }
  })

  test('rejects invalid stamp texture dimensions', () => {
    expect(
      BrushTipDescriptorSchema.safeParse({
        ...PROCEDURAL_TIPS[0],
        kind: 'stamp',
        texture: { src: '/brushes/test.png', width: 0, height: 20 },
      }).success,
    ).toBe(false)
  })

  test('parses vendored stamps and resolves their texture files', () => {
    const manifest = JSON.parse(
      readFileSync('public/brushes/oga-rd/manifest.json', 'utf8'),
    )
    const tips = BrushTipDescriptorSchema.array().parse(manifest)
    expect(tips).toHaveLength(12)
    for (const tip of tips) {
      expect(tip.kind).toBe('stamp')
      expect(tip.texture).toBeDefined()
      expect(existsSync(join('public', tip.texture!.src))).toBe(true)
    }
  })
})
