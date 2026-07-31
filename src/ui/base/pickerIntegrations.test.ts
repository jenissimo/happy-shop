import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(relativePath: string): string {
  return readFileSync(join(import.meta.dirname, '..', '..', relativePath), 'utf8')
}

describe('PickerSurface integrations', () => {
  test('FontPicker uses PickerSurface for pin support', () => {
    const source = readSource('editor/tools/text/FontPicker.tsx')
    expect(source).toContain('PickerSurface')
    expect(source).not.toMatch(/from ['"].*Popover['"]/)
    expect(source).toContain('listScrollRef')
  })

  test('BrushTipPicker uses PickerSurface for pin support', () => {
    const source = readSource('editor/tools/brush/BrushTipPicker.tsx')
    expect(source).toContain('PickerSurface')
    expect(source).not.toMatch(/from ['"].*Popover['"]/)
    expect(source).toContain('gridScrollRef')
    expect(source).toContain('importAbr')
  })

  test('GradientRamp uses PickerSurface for pin support', () => {
    const source = readSource('ui/features/layer-style/GradientRamp.tsx')
    expect(source).toContain('PickerSurface')
    expect(source).not.toMatch(/from ['"].*Popover['"]/)
  })

  test('PatternGrid remains the reference PickerSurface integration', () => {
    const source = readSource('ui/features/layer-style/PatternGrid.tsx')
    expect(source).toContain('PickerSurface')
  })
})
