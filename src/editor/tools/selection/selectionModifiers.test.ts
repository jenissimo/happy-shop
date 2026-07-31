import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { useSelectionToolStore } from '../../session/selectionToolStore'
import { SelectionToolController } from './SelectionToolController'

beforeEach(() => {
  useEditorSessionStore.setState({
    document: createEmptyDocument({ width: 100, height: 100 }),
    activeToolId: 'marquee',
  })
  useSelectionStore.getState().deselect()
  useSelectionToolStore.setState({ combineMode: 'new', marqueeShape: 'rect' })
})

describe('marquee modifier timing', () => {
  test('Shift before pointerdown latches Add instead of square', () => {
    const ctl = new SelectionToolController()
    ctl.pointerDown(0, 0, 1, { shift: true, alt: false, ctrl: false, meta: false })
    ctl.pointerMove(20, 5, 1, { shift: true, alt: false, ctrl: false, meta: false })
    const preview = useSelectionToolStore.getState().preview
    expect(preview).toMatchObject({ kind: 'rect', rect: { width: 20, height: 5 } })
  })

  test('Shift after pointerdown constrains to a square', () => {
    const ctl = new SelectionToolController()
    ctl.pointerDown(0, 0, 1)
    ctl.pointerMove(20, 5, 1, { shift: true, alt: false, ctrl: false, meta: false })
    const preview = useSelectionToolStore.getState().preview
    expect(preview).toMatchObject({ kind: 'rect', rect: { width: 20, height: 20 } })
  })
})
