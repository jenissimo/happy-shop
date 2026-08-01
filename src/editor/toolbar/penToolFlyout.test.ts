import { beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { registerPenCommands } from '../tools/pen/penCommands'
import { registerToolCommands } from './registerToolCommands'
import { PEN_TOOL_CYCLE } from './tools'

describe('pen tool flyout', () => {
  beforeEach(() => {
    useEditorSessionStore.setState({ activeToolId: 'move' })
  })

  test('cycles Pen tools forwards and backwards', () => {
    const registry = new CommandRegistry()
    registerPenCommands(registry)

    const forward = registry.get('tool.pen')
    const backward = registry.get('tool.pen.cycleReverse')
    expect(forward?.shortcut).toBe('P')
    expect(backward?.shortcut).toBe('Shift+P')

    forward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('pen')
    forward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('freeformPen')
    forward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('addAnchor')
    forward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('deleteAnchor')
    forward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('convertPoint')
    forward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('pen')
    backward?.run()
    expect(useEditorSessionStore.getState().activeToolId).toBe('convertPoint')
    expect(PEN_TOOL_CYCLE).toHaveLength(5)
  })

  test('registerToolCommands skips pen group variants', () => {
    const registry = new CommandRegistry()
    registerToolCommands(registry)
    expect(registry.get('tool.pen')).toBeUndefined()
    expect(registry.get('tool.freeformPen')?.shortcut).toBeUndefined()
  })
})
