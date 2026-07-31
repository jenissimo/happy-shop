import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../../core/document'
import { CommandRegistry } from '../../../core/commands/registry'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { SelectionMask } from '../../session/SelectionMask'
import { useSelectionStore } from '../../session/selectionStore'
import {
  featherActiveSelection,
  registerSelectionModifyCommands,
} from './selectionModifyCommands'

describe('Select > Modify > Feather', () => {
  beforeEach(() => {
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 32, height: 32 }),
    })
    useSelectionStore.setState({
      marquee: null,
      lastMarquee: null,
      mask: null,
      lastMask: null,
    })
  })

  test('softens the active mask without changing a missing selection', () => {
    expect(featherActiveSelection(2)).toBe(false)

    useSelectionStore.getState().setMask(
      SelectionMask.fromRect(32, 32, { x: 10, y: 10, width: 8, height: 8 }),
    )
    expect(featherActiveSelection(2)).toBe(true)
    const mask = useSelectionStore.getState().mask
    expect(mask?.sample(9, 14)).toBeGreaterThan(0)
    expect(mask?.sample(9, 14)).toBeLessThan(255)
  })

  test('rejects zero or invalid radii', () => {
    useSelectionStore.getState().setMask(
      SelectionMask.fromRect(32, 32, { x: 10, y: 10, width: 8, height: 8 }),
    )
    const before = useSelectionStore.getState().mask?.sample(14, 14)
    expect(featherActiveSelection(0)).toBe(false)
    expect(featherActiveSelection(-5)).toBe(false)
    expect(featherActiveSelection(Number.NaN)).toBe(false)
    expect(useSelectionStore.getState().mask?.sample(14, 14)).toBe(before)
  })

  test('clamps oversized radii to 250px', () => {
    useSelectionStore.getState().setMask(
      SelectionMask.fromRect(128, 128, { x: 40, y: 40, width: 48, height: 48 }),
    )
    expect(featherActiveSelection(999)).toBe(true)
    expect(useSelectionStore.getState().hasSelection()).toBe(true)
  })

  test('registers a command that is disabled without a selection', () => {
    const registry = new CommandRegistry()
    registerSelectionModifyCommands(registry)
    const cmd = registry.get('select.modify.feather')
    expect(cmd?.title).toBe('Feather…')
    expect(cmd?.enabled?.()).toBe(false)

    useSelectionStore.getState().setMask(
      SelectionMask.fromRect(32, 32, { x: 0, y: 0, width: 4, height: 4 }),
    )
    expect(cmd?.enabled?.()).toBe(true)
  })
})
