import { describe, expect, test } from 'bun:test'
import { parseDocument } from '../../../core/document'
import { createDocumentFromDialog } from './createDocumentFromDialog'
import { createDefaultFormState } from './validation'

describe('createDocumentFromDialog', () => {
  test('produces a schema-valid empty document from the default form', () => {
    const doc = createDocumentFromDialog(createDefaultFormState())
    expect(parseDocument(doc).ok).toBe(true)
    expect(doc.name).toBe('Untitled')
    expect(doc.canvas.width).toBe(1024)
    expect(doc.canvas.height).toBe(768)
    expect(doc.canvas.background).toBe('transparent')
    expect(doc.rootChildren).toHaveLength(1)
    expect(Object.keys(doc.layers)).toHaveLength(1)
    expect(doc.layers[doc.rootChildren[0]!]?.type).toBe('raster')
  })

  test('trims the name and falls back to Untitled when blank', () => {
    const doc = createDocumentFromDialog({ ...createDefaultFormState(), name: '   ' })
    expect(doc.name).toBe('Untitled')
  })

  test('clamps out-of-range dimensions', () => {
    const doc = createDocumentFromDialog({
      ...createDefaultFormState(),
      width: 999999,
      height: -5,
    })
    expect(doc.canvas.width).toBe(8192)
    expect(doc.canvas.height).toBe(1)
  })

  test('resolves the chosen background', () => {
    const doc = createDocumentFromDialog({
      ...createDefaultFormState(),
      background: 'custom',
      customColor: '#123456',
    })
    expect(doc.canvas.background).toEqual({ color: '#123456' })
  })
})
