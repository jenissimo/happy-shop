import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../../core/document/factories'
import { setWorkPath } from '../../../core/document/pathOperations'
import { createPathId } from '../../../core/document/ids'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useWorkPathStore } from './workPathStore'
import { canUndoPenDraftAnchor, undoPenDraftAnchor } from './penWorkPathUndo'

describe('pen work-path undo', () => {
  beforeEach(() => {
    useEditorSessionStore.setState({ activeToolId: 'pen' })
    useWorkPathStore.setState({
      path: null,
      draft: null,
      rubberBand: null,
      selectedAnchor: null,
      activeHandle: null,
    })
  })

  test('canUndoPenDraftAnchor when pen tool has draft anchors', () => {
    expect(canUndoPenDraftAnchor()).toBe(false)
    useWorkPathStore.setState({
      draft: { anchors: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false },
    })
    expect(canUndoPenDraftAnchor()).toBe(true)
    useEditorSessionStore.setState({ activeToolId: 'move' })
    expect(canUndoPenDraftAnchor()).toBe(false)
  })

  test('undoPenDraftAnchor pops the last draft anchor', () => {
    useWorkPathStore.setState({
      draft: {
        anchors: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 20, y: 0 },
        ],
        closed: false,
      },
      rubberBand: { x: 30, y: 0 },
    })
    expect(undoPenDraftAnchor()).toBe(true)
    expect(useWorkPathStore.getState().draft?.anchors).toHaveLength(2)
    expect(useWorkPathStore.getState().rubberBand).toBeNull()
    expect(undoPenDraftAnchor()).toBe(true)
    expect(undoPenDraftAnchor()).toBe(true)
    expect(useWorkPathStore.getState().draft).toBeNull()
    expect(undoPenDraftAnchor()).toBe(false)
  })

  test('works for freeform pen tool', () => {
    useEditorSessionStore.setState({ activeToolId: 'freeformPen' })
    useWorkPathStore.setState({
      draft: { anchors: [{ x: 1, y: 1 }, { x: 2, y: 2 }], closed: false },
    })
    expect(canUndoPenDraftAnchor()).toBe(true)
  })
})

describe('save work path', () => {
  test('saveActiveWorkPathToDocument adds saved entry with history', async () => {
    const { saveActiveWorkPathToDocument } = await import('../paths/pathDocumentSync')
    const { documentHistory, resetDocumentHistory } = await import('../../session/documentHistory')
    resetDocumentHistory()
    const work = {
      id: createPathId(),
      name: 'Work Path',
      closed: false,
      knots: [{ x: 0, y: 0, handleIn: null, handleOut: null }],
    }
    useEditorSessionStore.setState({
      document: setWorkPath(createEmptyDocument(), work),
    })
    expect(saveActiveWorkPathToDocument()).toBe(true)
    const doc = useEditorSessionStore.getState().document
    expect(doc.paths?.saved).toHaveLength(1)
    expect(doc.paths?.workPath?.id).toBe(work.id)
    expect(documentHistory.canUndo).toBe(true)
  })
})
