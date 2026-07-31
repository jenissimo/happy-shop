import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createTextLayer,
} from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { documentHistory, resetDocumentHistory } from '../../session/documentHistory'
import { TextToolController } from './TextToolController'
import {
  beginTextEditSession,
  cancelTextEditSession,
  finishTextEditSession,
  previewTextProps,
  applyTextOptionsToSelected,
} from './textCommands'
import { setTextEditingSelection } from './textEditingSelection'
import { handleTextEditShortcut } from './textEditShortcuts'
import { useTextToolStore } from './textToolStore'

beforeEach(() => {
  resetDocumentHistory()
  useTextToolStore.getState().endEdit()
  useEditorSessionStore.setState({
    document: createEmptyDocument({ width: 400, height: 300 }),
    selectedLayerIds: [],
    dirty: false,
  })
})

describe('text edit sessions', () => {
  test('commits an existing text layer without rasterizing it', () => {
    const layer = createTextLayer({ content: 'Before' })
    const document = addLayer(
      createEmptyDocument({ width: 400, height: 300 }),
      layer,
    )
    useEditorSessionStore.setState({ document, selectedLayerIds: [layer.id] })

    expect(beginTextEditSession(layer.id)).toBe(true)
    previewTextProps(layer.id, { content: 'After' })
    finishTextEditSession()

    const committed = useEditorSessionStore.getState().document.layers[layer.id]
    expect(committed?.type).toBe('text')
    expect(committed?.type === 'text' && committed.content).toBe('After')
    expect(documentHistory.undoLabel).toBe('Edit Text')
    expect(useTextToolStore.getState().edit).toBeNull()
  })

  test('uses Mod+B during a text edit instead of document shortcuts', () => {
    const layer = createTextLayer({ content: 'Bold me', fontWeight: 400 })
    const document = addLayer(
      createEmptyDocument({ width: 400, height: 300 }),
      layer,
    )
    useEditorSessionStore.setState({ document, selectedLayerIds: [layer.id] })
    expect(beginTextEditSession(layer.id)).toBe(true)

    let prevented = false
    let stopped = false
    const handled = handleTextEditShortcut(
      {
        key: 'b',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => { prevented = true },
        stopPropagation: () => { stopped = true },
      },
      layer,
    )

    const edited = useEditorSessionStore.getState().document.layers[layer.id]
    expect(handled).toBe(true)
    expect(prevented).toBe(true)
    expect(stopped).toBe(true)
    expect(edited?.type === 'text' && edited.fontWeight).toBe(700)
  })

  test('sequential typing keeps forward Latin order with right alignment', () => {
    const layer = createTextLayer({ content: '', align: 'right', textMode: 'point' })
    const document = addLayer(
      createEmptyDocument({ width: 400, height: 300 }),
      layer,
    )
    useEditorSessionStore.setState({ document, selectedLayerIds: [layer.id] })
    expect(beginTextEditSession(layer.id)).toBe(true)

    let typed = ''
    for (const ch of 'Hello') {
      typed += ch
      previewTextProps(layer.id, { content: typed })
    }

    const edited = useEditorSessionStore.getState().document.layers[layer.id]
    expect(edited?.type === 'text' && edited.content).toBe('Hello')
    expect(edited?.type === 'text' && edited.align).toBe('right')
  })

  test('applies underline to a non-collapsed DOM selection only', () => {
    const layer = createTextLayer({
      content: 'abcd',
      underline: false,
      runs: [{
        start: 0,
        end: 4,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      }],
    })
    const document = addLayer(
      createEmptyDocument({ width: 400, height: 300 }),
      layer,
    )
    useEditorSessionStore.setState({ document, selectedLayerIds: [layer.id] })
    expect(beginTextEditSession(layer.id)).toBe(true)
    setTextEditingSelection(layer.id, 1, 3)
    applyTextOptionsToSelected({ underline: true })

    const edited = useEditorSessionStore.getState().document.layers[layer.id]
    expect(edited?.type === 'text' && edited.underline).toBe(false)
    expect(edited?.type === 'text' && edited.runs).toEqual([
      {
        start: 0,
        end: 1,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      },
      {
        start: 1,
        end: 3,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
        underline: true,
      },
      {
        start: 3,
        end: 4,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      },
    ])
  })
})

describe('Type tool point and box creation', () => {
  test('click creates point text without frame bounds; drag creates box text', () => {
    const controller = new TextToolController()

    controller.pointerDown(40, 50, 1)
    controller.pointerUp(40, 50, 1)
    const point = Object.values(
      useEditorSessionStore.getState().document.layers,
    ).find((layer) => layer.type === 'text')
    expect(point?.type).toBe('text')
    expect(point?.type === 'text' && point.textMode).toBe('point')
    expect(point?.type === 'text' && point.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 })

    cancelTextEditSession()
    controller.pointerDown(80, 90, 2)
    controller.pointerMove(180, 150, 2)
    controller.pointerUp(180, 150, 2)
    const box = Object.values(
      useEditorSessionStore.getState().document.layers,
    ).find((layer) => layer.type === 'text' && layer.textMode === 'box')
    expect(box?.type).toBe('text')
    expect(box?.type === 'text' && box.textMode).toBe('box')
    expect(box?.type === 'text' && box.bounds).toEqual({ x: 0, y: 0, w: 100, h: 60 })
  })
})
