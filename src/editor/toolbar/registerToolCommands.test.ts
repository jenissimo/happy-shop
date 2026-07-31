import { beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { registerToolCommands } from './registerToolCommands'

describe('tool group shortcuts', () => {
  beforeEach(() => {
    useEditorSessionStore.setState({ activeToolId: 'move' })
  })

  test('cycles Brush and Pencil forwards and backwards', () => {
    const registry = new CommandRegistry()
    registerToolCommands(registry)

    const forward = registry.get('tool.brush')
    const backward = registry.get('tool.brush.cycleReverse')
    expect(forward?.shortcut).toBe('B')
    expect(backward?.shortcut).toBe('Shift+B')

    forward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('pencil')
    backward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('brush')
  })

  test('assigns reverse-cycle shortcuts to retouch tool families', () => {
    const registry = new CommandRegistry()
    registerToolCommands(registry)

    expect(registry.get('tool.spotHealing')?.shortcut).toBe('J')
    expect(registry.get('tool.spotHealing.cycleReverse')?.shortcut).toBe('Shift+J')
    expect(registry.get('tool.smudge')?.shortcut).toBe('R')
    expect(registry.get('tool.smudge.cycleReverse')?.shortcut).toBe('Shift+R')
    expect(registry.get('tool.sharpen')).toBeDefined()
    expect(registry.get('tool.dodge')?.shortcut).toBe('O')
    expect(registry.get('tool.dodge.cycleReverse')?.shortcut).toBe('Shift+O')
  })

  test('shares G with the Paint Bucket fill flyout', () => {
    const registry = new CommandRegistry()
    registerToolCommands(registry)

    expect(registry.get('tool.paintBucket')?.shortcut).toBe('G')
    expect(registry.get('tool.gradient')).toBeDefined()
    registry.get('tool.paintBucket')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('gradient')
  })

  test('cycles Clone / History / Pattern Stamp forwards and backwards', () => {
    const registry = new CommandRegistry()
    registerToolCommands(registry)

    expect(registry.get('tool.cloneStamp')?.shortcut).toBe('S')
    expect(registry.get('tool.cloneStamp.cycleReverse')?.shortcut).toBe('Shift+S')

    useEditorSessionStore.setState({ activeToolId: 'cloneStamp' })
    registry.get('tool.cloneStamp')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('historyBrush')
    registry.get('tool.cloneStamp')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('patternStamp')
    registry.get('tool.cloneStamp.cycleReverse')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('historyBrush')
  })

  test('cycles Dodge / Burn / Sponge forwards and backwards', () => {
    const registry = new CommandRegistry()
    registerToolCommands(registry)

    useEditorSessionStore.setState({ activeToolId: 'dodge' })
    registry.get('tool.dodge')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('burn')
    registry.get('tool.dodge')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('sponge')
    registry.get('tool.dodge.cycleReverse')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('burn')
  })

  test('cycles Liquify variants forwards and backwards', () => {
    const registry = new CommandRegistry()
    registerToolCommands(registry)

    expect(registry.get('tool.liquifyWarp')?.shortcut).toBe('Q')
    expect(registry.get('tool.liquifyWarp.cycleReverse')?.shortcut).toBe('Shift+Q')

    useEditorSessionStore.setState({ activeToolId: 'liquifyWarp' })
    registry.get('tool.liquifyWarp')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('liquifyReconstruct')
    registry.get('tool.liquifyWarp')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('liquifyBloat')
    registry.get('tool.liquifyWarp')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('liquifyPucker')
    registry.get('tool.liquifyWarp')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('liquifyTwirl')
    registry.get('tool.liquifyWarp')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('liquifyFreeze')
    registry.get('tool.liquifyWarp')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('liquifyThaw')
    registry.get('tool.liquifyWarp.cycleReverse')?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('liquifyFreeze')
  })
})
