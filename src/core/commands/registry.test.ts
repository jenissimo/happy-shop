import { describe, expect, test } from 'bun:test'
import {
  CommandRegistry,
  matchShortcut,
  registerPhotoshopMenuCommands,
} from './registry'

describe('CommandRegistry', () => {
  test('registers and runs enabled commands', () => {
    const reg = new CommandRegistry()
    let ran = false
    reg.register({
      id: 'test.run',
      title: 'Run',
      enabled: () => true,
      run: () => {
        ran = true
      },
    })
    expect(reg.run('test.run')).toBe(true)
    expect(ran).toBe(true)
  })

  test('skips disabled commands', () => {
    const reg = new CommandRegistry()
    reg.register({
      id: 'test.skip',
      title: 'Skip',
      enabled: () => false,
      run: () => {
        throw new Error('should not run')
      },
    })
    expect(reg.run('test.skip')).toBe(false)
  })
})

describe('registerPhotoshopMenuCommands', () => {
  test('registers File/Layer/View/Window command ids with safe shortcuts', () => {
    const reg = new CommandRegistry()
    registerPhotoshopMenuCommands(reg)

    expect(reg.get('file.new')?.shortcut).toBe('Mod+N')
    expect(reg.get('file.newFromClipboard')?.shortcut).toBe('Mod+Shift+N')
    expect(reg.get('file.open')?.shortcut).toBe('Mod+O')
    expect(reg.get('layer.new')).toBeDefined()
    expect(reg.get('layer.newGroup')?.title).toBe('New Group')
    expect(reg.get('layer.group')?.title).toBe('Group Layers')
    expect(reg.get('layer.group')?.shortcut).toBe('Mod+G')
    expect(reg.get('layer.ungroup')?.shortcut).toBe('Mod+Shift+G')
    expect(reg.get('layer.mask.add')?.title).toBe('Reveal All')
    expect(reg.get('layer.mask.hideAll')?.title).toBe('Hide All')
    expect(reg.get('layer.fx.dropShadow')).toBeDefined()
    expect(reg.get('view.fit')?.shortcut).toBe('Mod+0')
    expect(reg.get('panel.layers.toggle')).toBeDefined()

    // Browser-unsafe shortcuts must not be claimed by stubs.
    const shortcuts = reg
      .list()
      .map((c) => c.shortcut)
      .filter(Boolean)
    expect(shortcuts).not.toContain('Mod+W')
    expect(shortcuts).not.toContain('Mod+F')
    expect(shortcuts).not.toContain('Mod+P')
    expect(shortcuts).not.toContain('F5')
  })

  test('stubs are overwritable by real handlers', () => {
    const reg = new CommandRegistry()
    registerPhotoshopMenuCommands(reg)
    let ran = false
    reg.register({
      id: 'file.new',
      title: 'New…',
      shortcut: 'Mod+N',
      enabled: () => true,
      run: () => {
        ran = true
      },
    })
    expect(reg.run('file.new')).toBe(true)
    expect(ran).toBe(true)
  })
})

describe('matchShortcut', () => {
  function keyEvent(partial: {
    key: string
    code?: string
    ctrlKey?: boolean
    metaKey?: boolean
    altKey?: boolean
    shiftKey?: boolean
  }): KeyboardEvent {
    return {
      key: partial.key,
      code: partial.code ?? `Key${partial.key.toUpperCase()}`,
      ctrlKey: partial.ctrlKey ?? false,
      metaKey: partial.metaKey ?? false,
      altKey: partial.altKey ?? false,
      shiftKey: partial.shiftKey ?? false,
    } as KeyboardEvent
  }

  test('matches Mod+S', () => {
    expect(matchShortcut(keyEvent({ key: 's', ctrlKey: true }), 'Mod+S')).toBe(
      true,
    )
  })

  test('matches Delete', () => {
    expect(matchShortcut(keyEvent({ key: 'Delete' }), 'Delete')).toBe(true)
  })

  test('matches Shift+[ via BracketLeft code (shifted key is `{`)', () => {
    expect(
      matchShortcut(
        keyEvent({ key: '{', code: 'BracketLeft', shiftKey: true }),
        'Shift+[',
      ),
    ).toBe(true)
  })

  test("matches Mod+' via Quote code", () => {
    expect(
      matchShortcut(
        keyEvent({ key: "'", code: 'Quote', ctrlKey: true }),
        "Mod+'",
      ),
    ).toBe(true)
  })
})
