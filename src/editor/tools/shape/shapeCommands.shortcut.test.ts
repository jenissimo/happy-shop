import { describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../../core/commands/registry'
import { registerToolCommands } from '../../toolbar/registerToolCommands'
import { registerShapeCommands } from './shapeCommands'

describe('registerShapeCommands shortcut merge', () => {
  test('preserves U from registerToolCommands', () => {
    const reg = new CommandRegistry()
    registerToolCommands(reg)
    expect(reg.get('tool.shape')?.shortcut).toBe('U')
    registerShapeCommands(reg)
    expect(reg.get('tool.shape')?.shortcut).toBe('U')
  })
})
