import { describe, expect, test } from 'bun:test'
import type { HappyDocument } from '../document'
import { createEmptyDocument } from '../document'
import { createMetadataEntry } from './metadataEntry'
import { TransactionalHistory } from './TransactionalHistory'

function applyTo(box: { doc: HappyDocument }) {
  return (doc: HappyDocument) => {
    box.doc = doc
  }
}

describe('TransactionalHistory', () => {
  test('undo/redo restore metadata documents', async () => {
    const box = { doc: createEmptyDocument({ name: 'A' }) }
    const history = new TransactionalHistory()
    const before = box.doc
    const after = createEmptyDocument({ name: 'B' })
    box.doc = after
    history.push(
      createMetadataEntry({
        label: 'Rename',
        before,
        after,
        apply: applyTo(box),
      }),
    )

    expect(history.canUndo).toBe(true)
    await history.undo()
    expect(box.doc.name).toBe('A')
    expect(history.canRedo).toBe(true)
    await history.redo()
    expect(box.doc.name).toBe('B')
  })

  test('push after undo clears redo and disposes', async () => {
    const box = { doc: createEmptyDocument({ name: 'A' }) }
    const history = new TransactionalHistory()
    let disposed = 0
    const make = (label: string, name: string) => {
      const before = box.doc
      const after = createEmptyDocument({ name })
      box.doc = after
      const entry = createMetadataEntry({
        label,
        before,
        after,
        apply: applyTo(box),
      })
      const orig = entry.dispose
      entry.dispose = () => {
        disposed++
        orig?.()
      }
      return entry
    }

    history.push(make('1', 'B'))
    history.push(make('2', 'C'))
    await history.undo()
    expect(box.doc.name).toBe('B')
    history.push(make('3', 'D'))
    expect(history.canRedo).toBe(false)
    expect(disposed).toBeGreaterThanOrEqual(1)
    expect(box.doc.name).toBe('D')
  })

  test('evicts oldest when over maxEntries', () => {
    const box = { doc: createEmptyDocument({ name: '0' }) }
    const history = new TransactionalHistory({ maxEntries: 2, maxBytes: 1e9 })
    for (let i = 1; i <= 3; i++) {
      const before = box.doc
      const after = createEmptyDocument({ name: String(i) })
      box.doc = after
      history.push(
        createMetadataEntry({
          label: `n${i}`,
          before,
          after,
          apply: applyTo(box),
        }),
      )
    }
    expect(history.undoCount).toBe(2)
    expect(history.listUndoLabels()).toEqual(['n2', 'n3'])
  })

  test('listRedoLabels and jumpToUndoDepth browse the stack', async () => {
    const box = { doc: createEmptyDocument({ name: '0' }) }
    const history = new TransactionalHistory()
    for (const name of ['A', 'B', 'C']) {
      const before = box.doc
      const after = createEmptyDocument({ name })
      box.doc = after
      history.push(
        createMetadataEntry({
          label: name,
          before,
          after,
          apply: applyTo(box),
        }),
      )
    }
    expect(history.listUndoLabels()).toEqual(['A', 'B', 'C'])
    expect(history.listRedoLabels()).toEqual([])

    expect(await history.jumpToUndoDepth(1)).toBe(true)
    expect(box.doc.name).toBe('A')
    expect(history.listUndoLabels()).toEqual(['A'])
    expect(history.listRedoLabels()).toEqual(['B', 'C'])

    expect(await history.jumpToUndoDepth(3)).toBe(true)
    expect(box.doc.name).toBe('C')
    expect(history.listRedoLabels()).toEqual([])

    expect(await history.jumpToUndoDepth(0)).toBe(true)
    expect(box.doc.name).toBe('0')
    expect(history.undoCount).toBe(0)
    expect(history.listRedoLabels()).toEqual(['A', 'B', 'C'])
  })

  test('mergeKey coalesces consecutive opacity edits', () => {
    const box = { doc: createEmptyDocument({ name: 'A' }) }
    const history = new TransactionalHistory()
    const firstBefore = box.doc
    const mid = createEmptyDocument({ name: 'B' })
    box.doc = mid
    history.push(
      createMetadataEntry({
        label: 'Opacity',
        before: firstBefore,
        after: mid,
        apply: applyTo(box),
        mergeKey: 'opacity:layer1',
      }),
    )
    const last = createEmptyDocument({ name: 'C' })
    box.doc = last
    history.push(
      createMetadataEntry({
        label: 'Opacity',
        before: mid,
        after: last,
        apply: applyTo(box),
        mergeKey: 'opacity:layer1',
      }),
    )
    expect(history.undoCount).toBe(1)
  })
})
