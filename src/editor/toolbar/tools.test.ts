import { describe, expect, test } from 'bun:test'
import { TOOLS } from './tools'

describe('tool strip order', () => {
  test('places Shape above Hand/Zoom (PS drawing-tool grouping)', () => {
    const ids = TOOLS.map((tool) => tool.id)
    expect(ids.indexOf('pen')).toBeLessThan(ids.indexOf('hand'))
    expect(ids.indexOf('shape')).toBeLessThan(ids.indexOf('hand'))
    expect(ids.indexOf('shape')).toBeLessThan(ids.indexOf('zoom'))
  })

  test('keeps the Hand/Zoom separator on Hand only', () => {
    expect(TOOLS.find((tool) => tool.id === 'shape')?.separatorBefore).toBeUndefined()
    expect(TOOLS.find((tool) => tool.id === 'hand')?.separatorBefore).toBe(true)
    expect(TOOLS.find((tool) => tool.id === 'zoom')?.separatorBefore).toBeUndefined()
  })
})
