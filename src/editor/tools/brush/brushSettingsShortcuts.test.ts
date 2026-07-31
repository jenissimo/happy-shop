import { beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../../core/commands/registry'
import { registerColorAndBrushCommands } from '../../color/registerColorAndBrushCommands'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useRetouchSettingsStore } from '../retouch/retouchSettingsStore'
import { useBrushSettingsStore } from './brushSettingsStore'

describe('brush size / hardness shortcuts', () => {
  beforeEach(() => {
    useEditorSessionStore.setState({ activeToolId: 'brush' })
    useBrushSettingsStore.getState().setPrefs({
      size: 20,
      hardness: 0.5,
    })
    useRetouchSettingsStore.getState().setPrefs({ size: 40 })
  })

  test('[ / ] nudge size; Shift+[ / ] nudge hardness', () => {
    const reg = new CommandRegistry()
    registerColorAndBrushCommands(reg)

    expect(reg.run('brush.sizeIncrease')).toBe(true)
    expect(useBrushSettingsStore.getState().size).toBe(25)

    expect(reg.run('brush.sizeDecrease')).toBe(true)
    expect(useBrushSettingsStore.getState().size).toBe(20)

    expect(reg.run('brush.hardnessIncrease')).toBe(true)
    expect(useBrushSettingsStore.getState().hardness).toBeCloseTo(0.6, 5)

    expect(reg.run('brush.hardnessDecrease')).toBe(true)
    expect(useBrushSettingsStore.getState().hardness).toBeCloseTo(0.5, 5)

    expect(reg.get('brush.sizeDecrease')?.shortcut).toBe('[')
    expect(reg.get('brush.hardnessIncrease')?.shortcut).toBe('Shift+]')
  })

  test('brackets resize shared retouch size for the active retouch tool', () => {
    useEditorSessionStore.setState({ activeToolId: 'cloneStamp' })
    const reg = new CommandRegistry()
    registerColorAndBrushCommands(reg)

    expect(reg.run('brush.sizeIncrease')).toBe(true)
    expect(useRetouchSettingsStore.getState().size).toBe(45)
    expect(useBrushSettingsStore.getState().size).toBe(20)
    expect(reg.run('brush.hardnessIncrease')).toBe(false)
  })

  test('brackets resize shared retouch size for Dodge / Burn / Sponge', () => {
    const reg = new CommandRegistry()
    registerColorAndBrushCommands(reg)

    for (const toolId of ['dodge', 'burn', 'sponge'] as const) {
      useEditorSessionStore.setState({ activeToolId: toolId })
      useRetouchSettingsStore.getState().setPrefs({ size: 40 })

      expect(reg.run('brush.sizeIncrease')).toBe(true)
      expect(useRetouchSettingsStore.getState().size).toBe(45)
      expect(reg.run('brush.sizeDecrease')).toBe(true)
      expect(useRetouchSettingsStore.getState().size).toBe(40)
      expect(reg.run('brush.hardnessIncrease')).toBe(false)
    }
  })

  test('brackets resize shared retouch size for Liquify tools', () => {
    const reg = new CommandRegistry()
    registerColorAndBrushCommands(reg)

    for (const toolId of ['liquifyWarp', 'liquifyReconstruct', 'liquifyBloat', 'liquifyPucker', 'liquifyTwirl', 'liquifyFreeze', 'liquifyThaw'] as const) {
      useEditorSessionStore.setState({ activeToolId: toolId })
      useRetouchSettingsStore.getState().setPrefs({ size: 40 })

      expect(reg.run('brush.sizeIncrease')).toBe(true)
      expect(useRetouchSettingsStore.getState().size).toBe(45)
    }
  })
})
