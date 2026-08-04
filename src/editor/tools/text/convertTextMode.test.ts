import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createTextLayer,
  CURRENT_SCHEMA_VERSION,
} from '../../../core/document'
import { documentHistory, resetDocumentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { convertTextMode } from './textCommands'

const originalDocument = globalThis.document

function installCanvasMock() {
  const measure = (text: string) => ({ width: Math.max(1, text.length) * 10 })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        getContext: () => ({
          font: '',
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          textBaseline: 'top',
          measureText: measure,
          fillText: () => undefined,
          clearRect: () => undefined,
          beginPath: () => undefined,
          moveTo: () => undefined,
          lineTo: () => undefined,
          stroke: () => undefined,
        }),
        width: 0,
        height: 0,
      }),
      fonts: {
        load: async () => [],
        ready: Promise.resolve(),
      },
    },
  })
}

describe('convertTextMode', () => {
  beforeEach(() => {
    resetDocumentHistory()
    installCanvasMock()
    useEditorSessionStore.getState().setDocument(createEmptyDocument({ name: 'Convert' }))
  })

  afterEach(() => {
    resetDocumentHistory()
    // Bun shares one global per run, so a leaked `document` mock would make every
    // later test file take DOM code paths this environment cannot satisfy.
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    })
  })

  test('point → box sets measured bounds and preserves left origin', async () => {
    const layer = createTextLayer({
      content: 'Hello',
      textMode: 'point',
      align: 'left',
      transform: {
        x: 100,
        y: 50,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 15,
        skewXDeg: 0,
        skewYDeg: 0,
        pivotX: 0,
        pivotY: 0,
      },
    })
    const before = useEditorSessionStore.getState().document
    useEditorSessionStore.setState({
      document: addLayer(before, layer),
      selectedLayerIds: [layer.id],
    })

    await convertTextMode(layer.id, 'box')
    const next = useEditorSessionStore.getState().document.layers[layer.id]
    expect(next?.type).toBe('text')
    if (next?.type !== 'text') return
    expect(next.textMode).toBe('box')
    expect(next.bounds.w).toBeGreaterThan(0)
    expect(next.bounds.h).toBeGreaterThan(0)
    expect(next.transform.x).toBe(100)
    expect(next.transform.rotationDeg).toBe(15)
    expect(useEditorSessionStore.getState().document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  test('center align round-trip restores transform.x', async () => {
    const layer = createTextLayer({
      content: 'Hello',
      textMode: 'point',
      align: 'center',
      transform: {
        x: 200,
        y: 80,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        skewXDeg: 0,
        skewYDeg: 0,
        pivotX: 0,
        pivotY: 0,
      },
    })
    const before = useEditorSessionStore.getState().document
    useEditorSessionStore.setState({
      document: addLayer(before, layer),
      selectedLayerIds: [layer.id],
    })

    const originX = layer.transform.x
    await convertTextMode(layer.id, 'box')
    let next = useEditorSessionStore.getState().document.layers[layer.id]
    expect(next?.type).toBe('text')
    if (next?.type !== 'text') return
    expect(next.textMode).toBe('box')
    expect(next.transform.x).not.toBe(originX)

    await convertTextMode(layer.id, 'point')
    next = useEditorSessionStore.getState().document.layers[layer.id]
    expect(next?.type).toBe('text')
    if (next?.type !== 'text') return
    expect(next.textMode).toBe('point')
    expect(next.bounds.w).toBe(0)
    expect(next.bounds.h).toBe(0)
    expect(next.transform.x).toBe(originX)
  })
})
