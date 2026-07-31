import { describe, expect, test } from 'bun:test'
import { createEmptyDocument } from './factories'
import { createPathId } from './ids'
import {
  deletePath,
  nextSavedPathName,
  saveWorkPath,
  setActivePathId,
  setWorkPath,
  upsertSavedPath,
} from './pathOperations'
import type { VectorPath } from './pathSchema'

function samplePath(name: string, id = createPathId()): VectorPath {
  return {
    id,
    name,
    closed: true,
    knots: [
      { x: 0, y: 0, handleIn: null, handleOut: { x: 10, y: 0 } },
      { x: 20, y: 0, handleIn: { x: -10, y: 0 }, handleOut: null },
      { x: 20, y: 20, handleIn: null, handleOut: null },
    ],
  }
}

describe('pathOperations', () => {
  test('setWorkPath stores work path and selects it', () => {
    const doc = createEmptyDocument()
    const path = samplePath('Work Path')
    const next = setWorkPath(doc, path)
    expect(next.paths?.workPath?.id).toBe(path.id)
    expect(next.paths?.activePathId).toBe(path.id)
  })

  test('saveWorkPath duplicates into saved list with a fresh id', () => {
    const work = samplePath('Work Path')
    const doc = setWorkPath(createEmptyDocument(), work)
    const saved = saveWorkPath(doc)
    expect(saved.paths?.saved).toHaveLength(1)
    expect(saved.paths?.saved[0]?.id).not.toBe(work.id)
    expect(saved.paths?.saved[0]?.name).toBe('Path 1')
  })

  test('deletePath removes saved path and retargets active id', () => {
    const first = samplePath('Path 1')
    const second = samplePath('Path 2')
    let doc = upsertSavedPath(createEmptyDocument(), first)
    doc = upsertSavedPath(doc, second)
    doc = setActivePathId(doc, second.id)
    const next = deletePath(doc, second.id)
    expect(next.paths?.saved).toHaveLength(1)
    expect(next.paths?.activePathId).toBe(first.id)
  })

  test('nextSavedPathName skips occupied names', () => {
    expect(nextSavedPathName([samplePath('Path 1')])).toBe('Path 2')
  })
})
