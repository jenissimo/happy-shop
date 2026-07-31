import { describe, expect, test } from 'bun:test'
import { createEmptyDocument, createRectNode, type EditorDocument } from './legacyDocument'
import { HistoryStack } from './history'

describe('HistoryStack', () => {
  test('undo and redo restore documents', () => {
    let doc: EditorDocument = createEmptyDocument('test')
    const history = new HistoryStack()
    const setDoc = (d: EditorDocument) => {
      doc = d
    }

    history.apply(
      () => doc,
      setDoc,
      (d) => ({
        ...d,
        nodes: [...d.nodes, createRectNode({ name: 'Hello', x: 10, y: 10 })],
      }),
      'Add rect',
    )
    expect(doc.nodes).toHaveLength(1)
    expect(history.canUndo).toBe(true)

    history.undo()
    expect(doc.nodes).toHaveLength(0)
    expect(history.canRedo).toBe(true)

    history.redo()
    expect(doc.nodes).toHaveLength(1)
    expect(doc.nodes[0]?.name).toBe('Hello')
  })
})
