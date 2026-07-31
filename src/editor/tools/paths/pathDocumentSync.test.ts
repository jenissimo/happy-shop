import { describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../../core/document/factories'
import { setWorkPath } from '../../../core/document/pathOperations'
import { createPathId } from '../../../core/document/ids'
import type { VectorPath } from '../../../core/document/pathSchema'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useWorkPathStore } from '../pen/workPathStore'
import { vectorPathToPenPath } from './pathBridge'
import { resolvePenPathForOps } from './pathDocumentSync'

function linePath(): VectorPath {
  return {
    id: createPathId(),
    name: 'Work Path',
    closed: false,
    knots: [
      { x: 0, y: 0, handleIn: null, handleOut: null },
      { x: 100, y: 0, handleIn: null, handleOut: null },
    ],
  }
}

describe('resolvePenPathForOps', () => {
  test('prefers in-progress pen draft over document work path', () => {
    const doc = setWorkPath(createEmptyDocument(), linePath())
    useEditorSessionStore.setState({ document: doc })
    useWorkPathStore.setState({
      draft: { closed: false, anchors: [{ x: 5, y: 5 }] },
      path: null,
      rubberBand: null,
      selectedAnchor: null,
      activeHandle: null,
    })

    const resolved = resolvePenPathForOps()
    expect(resolved?.anchors).toHaveLength(1)
    expect(resolved?.anchors[0]?.x).toBe(5)
  })

  test('falls back to document active path', () => {
    const path = linePath()
    const doc = setWorkPath(createEmptyDocument(), path)
    useEditorSessionStore.setState({ document: doc })
    useWorkPathStore.setState({
      draft: null,
      path: null,
      rubberBand: null,
      selectedAnchor: null,
      activeHandle: null,
    })

    const resolved = resolvePenPathForOps()
    expect(resolved).toEqual(vectorPathToPenPath(path))
  })
})
