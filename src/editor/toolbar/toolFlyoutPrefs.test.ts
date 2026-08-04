import { describe, expect, test } from 'bun:test'
import { TOOLS } from './tools'
import { cycleToolGroup, visibleTools } from './toolFlyoutPrefs'

describe('tool flyout selection', () => {
  test('persists the selected variant in the visible strip model', () => {
    const tools = visibleTools(TOOLS, { paint: 'pencil', healing: 'healingBrush', blur: 'sharpen' })
    expect(tools.map((tool) => tool.id)).toContain('pencil')
    expect(tools.map((tool) => tool.id)).not.toContain('brush')
    expect(tools.map((tool) => tool.id)).toContain('healingBrush')
    expect(tools.map((tool) => tool.id)).toContain('sharpen')
    expect(tools.map((tool) => tool.id)).not.toContain('blur')
    expect(tools.map((tool) => tool.id)).not.toContain('smudge')
  })

  test('cycles tool-group variants in either direction', () => {
    expect(cycleToolGroup(TOOLS, {}, 'paint', 'brush', 1)).toBe('pencil')
    expect(cycleToolGroup(TOOLS, {}, 'paint', 'brush', -1)).toBe('pencil')
    expect(cycleToolGroup(TOOLS, {}, 'healing', 'spotHealing', 1)).toBe('healingBrush')
    expect(cycleToolGroup(TOOLS, {}, 'blur', 'smudge', -1)).toBe('sharpen')
    expect(cycleToolGroup(TOOLS, {}, 'blur', 'blur', 1)).toBe('sharpen')
    expect(cycleToolGroup(TOOLS, {}, 'blur', 'sharpen', 1)).toBe('smudge')
  })

  test('shows the preferred fill-group variant', () => {
    const tools = visibleTools(TOOLS, { fill: 'gradient' })
    expect(tools.map((tool) => tool.id)).toContain('gradient')
    expect(tools.map((tool) => tool.id)).not.toContain('paintBucket')
    expect(cycleToolGroup(TOOLS, {}, 'fill', 'paintBucket', 1)).toBe('gradient')
    expect(cycleToolGroup(TOOLS, {}, 'fill', 'gradient', 1)).toBe('paintBucket')
  })

  test('uses distinct healing-group icons', () => {
    const spot = TOOLS.find((tool) => tool.id === 'spotHealing')
    const healing = TOOLS.find((tool) => tool.id === 'healingBrush')
    const smudge = TOOLS.find((tool) => tool.id === 'smudge')
    expect(spot?.icon).not.toBe(smudge?.icon)
    expect(spot?.icon).not.toBe(healing?.icon)
    expect(healing?.icon).not.toBe(smudge?.icon)
  })

  test('persists the selected toning variant in the visible strip model', () => {
    const tools = visibleTools(TOOLS, { toning: 'burn' })
    expect(tools.map((tool) => tool.id)).toContain('burn')
    expect(tools.map((tool) => tool.id)).not.toContain('dodge')
    expect(tools.map((tool) => tool.id)).not.toContain('sponge')
  })

  test('cycles Dodge / Burn / Sponge in either direction', () => {
    expect(cycleToolGroup(TOOLS, {}, 'toning', 'dodge', 1)).toBe('burn')
    expect(cycleToolGroup(TOOLS, {}, 'toning', 'burn', 1)).toBe('sponge')
    expect(cycleToolGroup(TOOLS, {}, 'toning', 'sponge', 1)).toBe('dodge')
    expect(cycleToolGroup(TOOLS, {}, 'toning', 'dodge', -1)).toBe('sponge')
  })

  test('persists the selected stamp variant in the visible strip model', () => {
    const tools = visibleTools(TOOLS, { stamp: 'historyBrush' })
    expect(tools.map((tool) => tool.id)).toContain('historyBrush')
    expect(tools.map((tool) => tool.id)).not.toContain('cloneStamp')
    expect(tools.map((tool) => tool.id)).not.toContain('patternStamp')
  })

  test('cycles Clone / History / Pattern Stamp in either direction', () => {
    expect(cycleToolGroup(TOOLS, {}, 'stamp', 'cloneStamp', 1)).toBe('historyBrush')
    expect(cycleToolGroup(TOOLS, {}, 'stamp', 'historyBrush', 1)).toBe('patternStamp')
    expect(cycleToolGroup(TOOLS, {}, 'stamp', 'patternStamp', 1)).toBe('cloneStamp')
    expect(cycleToolGroup(TOOLS, {}, 'stamp', 'cloneStamp', -1)).toBe('patternStamp')
  })

  test('uses distinct stamp-group icons', () => {
    const clone = TOOLS.find((tool) => tool.id === 'cloneStamp')
    const history = TOOLS.find((tool) => tool.id === 'historyBrush')
    const pattern = TOOLS.find((tool) => tool.id === 'patternStamp')
    expect(history?.icon).not.toBe(clone?.icon)
    expect(pattern?.icon).not.toBe(history?.icon)
  })

  test('uses distinct Dodge / Burn / Sponge icons', () => {
    const dodge = TOOLS.find((tool) => tool.id === 'dodge')
    const burn = TOOLS.find((tool) => tool.id === 'burn')
    const sponge = TOOLS.find((tool) => tool.id === 'sponge')
    expect(dodge?.icon).not.toBe(burn?.icon)
    expect(dodge?.icon).not.toBe(sponge?.icon)
    expect(burn?.icon).not.toBe(sponge?.icon)
  })

  test('cycles the five-variant Pen flyout in either direction', () => {
    // The P flyout carries Pen, Freeform Pen and the anchor editors (PEN_TOOL_CYCLE).
    expect(cycleToolGroup(TOOLS, {}, 'pen', 'pen', 1)).toBe('freeformPen')
    expect(cycleToolGroup(TOOLS, {}, 'pen', 'freeformPen', 1)).toBe('addAnchor')
    expect(cycleToolGroup(TOOLS, {}, 'pen', 'addAnchor', 1)).toBe('deleteAnchor')
    expect(cycleToolGroup(TOOLS, {}, 'pen', 'deleteAnchor', 1)).toBe('convertPoint')
    expect(cycleToolGroup(TOOLS, {}, 'pen', 'convertPoint', 1)).toBe('pen')
    expect(cycleToolGroup(TOOLS, {}, 'pen', 'pen', -1)).toBe('convertPoint')
  })

  test('uses distinct pen-group icons', () => {
    const pen = TOOLS.find((tool) => tool.id === 'pen')
    const freeform = TOOLS.find((tool) => tool.id === 'freeformPen')
    expect(pen?.icon).not.toBe(freeform?.icon)
  })
})
