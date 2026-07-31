import { describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import {
  WORKSPACE_LAYOUTS,
  WORKSPACE_PRESET_ORDER,
} from './defaultLayout'
import {
  listBuiltinWorkspaceItems,
  listCustomWorkspaceItems,
  resolveActiveWorkspaceLabel,
  workspaceCommandIdForCustom,
  workspaceCommandIdForPreset,
} from './workspaceDropdownModel'

describe('listBuiltinWorkspaceItems', () => {
  test('lists every preset in WORKSPACE_PRESET_ORDER', () => {
    const items = listBuiltinWorkspaceItems()
    expect(items.map((item) => item.id)).toEqual([...WORKSPACE_PRESET_ORDER])
    expect(items.map((item) => item.title)).toEqual(
      WORKSPACE_PRESET_ORDER.map((id) => WORKSPACE_LAYOUTS[id].title),
    )
  })

  test('includes Pixel Art when preset is registered', () => {
    const pixelArt = listBuiltinWorkspaceItems().find((item) => item.id === 'pixelArt')
    expect(pixelArt?.title).toBe('Pixel Art')
    expect(pixelArt?.commandId).toBe('workspace.pixelArt')
  })
})

describe('listCustomWorkspaceItems', () => {
  test('maps saved workspaces to command ids', () => {
    const items = listCustomWorkspaceItems([
      { name: 'My Layout' },
      { name: 'Compact' },
    ])
    expect(items).toEqual([
      {
        index: 0,
        name: 'My Layout',
        commandId: workspaceCommandIdForCustom(0),
      },
      {
        index: 1,
        name: 'Compact',
        commandId: workspaceCommandIdForCustom(1),
      },
    ])
  })
})

describe('resolveActiveWorkspaceLabel', () => {
  test('prefers active preset command title', () => {
    const builtins = listBuiltinWorkspaceItems()
    const customs = listCustomWorkspaceItems([])
    const commands = new CommandRegistry()
    commands.register({
      id: workspaceCommandIdForPreset('painting'),
      title: 'Painting',
      enabled: () => true,
      run: () => {},
    })

    expect(
      resolveActiveWorkspaceLabel(
        workspaceCommandIdForPreset('painting'),
        builtins,
        customs,
        commands,
      ),
    ).toBe('Painting')
  })

  test('shows custom workspace name when active', () => {
    const builtins = listBuiltinWorkspaceItems()
    const customs = listCustomWorkspaceItems([{ name: 'Side by side' }])
    const commands = new CommandRegistry()

    expect(
      resolveActiveWorkspaceLabel(
        workspaceCommandIdForCustom(0),
        builtins,
        customs,
        commands,
      ),
    ).toBe('Side by side')
  })

  test('falls back to Essentials when nothing matches', () => {
    const builtins = listBuiltinWorkspaceItems()
    const customs = listCustomWorkspaceItems([])
    const commands = new CommandRegistry()

    expect(
      resolveActiveWorkspaceLabel(null, builtins, customs, commands, 'essentials'),
    ).toBe('Essentials')
  })
})
