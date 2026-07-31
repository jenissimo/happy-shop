import { describe, expect, test } from 'bun:test'
import { useColorStore } from '../../color/colorStore'
import { hexToCssColor } from '../../../imaging/palettes'

describe('SwatchesPanel foreground wiring', () => {
  test('swatch hex sets foreground via color store', () => {
    useColorStore.getState().resetDefaults()
    const sample = hexToCssColor('db1621')
    useColorStore.getState().setForeground(sample)
    expect(useColorStore.getState().foreground).toBe(sample)
  })
})
