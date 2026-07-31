import { describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../../core/document/factories'
import { createPathId } from '../../../core/document/ids'
import { setWorkPath } from '../../../core/document/pathOperations'
import type { VectorPath } from '../../../core/document/pathSchema'
import { pathPanelActiveId, pathPanelRows } from './pathPanelModel'

function samplePath(): VectorPath {
  return {
    id: createPathId(),
    name: 'Path 1',
    closed: true,
    knots: [
      { x: 0, y: 0, handleIn: null, handleOut: null },
      { x: 10, y: 0, handleIn: null, handleOut: null },
      { x: 10, y: 10, handleIn: null, handleOut: null },
    ],
  }
}

describe('pathPanelModel', () => {
  test('lists work path before saved paths', () => {
    const work = { ...samplePath(), name: 'Work Path' }
    const doc = setWorkPath(createEmptyDocument(), work)
    const rows = pathPanelRows(doc.paths)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('work')
    expect(rows[0]?.label).toBe('Work Path')
  })

  test('active id prefers explicit selection', () => {
    const path = samplePath()
    const doc = setWorkPath(createEmptyDocument(), path)
    expect(pathPanelActiveId(doc.paths)).toBe(path.id)
  })
})
