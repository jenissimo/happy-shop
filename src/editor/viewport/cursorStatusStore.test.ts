import { beforeEach, describe, expect, test } from 'bun:test'
import { useCursorStatusStore } from './cursorStatusStore'

describe('useCursorStatusStore', () => {
  beforeEach(() => {
    useCursorStatusStore.getState().setDocCursor(null)
  })

  test('tracks document cursor and clears on leave', () => {
    useCursorStatusStore.getState().setDocCursor({ x: 12.4, y: 8.6 })
    expect(useCursorStatusStore.getState().docCursor).toEqual({ x: 12.4, y: 8.6 })
    useCursorStatusStore.getState().setDocCursor(null)
    expect(useCursorStatusStore.getState().docCursor).toBeNull()
  })
})
