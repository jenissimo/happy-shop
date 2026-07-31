import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../core/document'
import { useColorStore } from '../color/colorStore'
import { useBrushSettingsStore } from '../tools/brush/brushSettingsStore'
import { useGuidesStore } from '../viewport/guides'
import { useDocumentTabManager } from './DocumentTabManager'
import { useEditorSessionStore } from './EditorSessionStore'
import {
  captureSessionSnapshot,
  installSessionHmrHandoff,
  parseSessionSnapshot,
  restoreSessionSnapshot,
} from './sessionPersistence'

describe('session persistence', () => {
  beforeEach(() => {
    useDocumentTabManager.setState({ tabs: [], activeTabId: null })
    useEditorSessionStore.setState({
      document: createEmptyDocument({ name: 'In progress' }),
      selectedLayerIds: [],
      dirty: false,
      cameraPrefs: { fitOnLoad: true },
      project: { projectPath: null, revision: null },
      historyVersion: 0,
      rasterEpoch: 0,
      activeToolId: 'move',
    })
    useColorStore.setState({ foreground: '#000000', background: '#ffffff' })
    useGuidesStore.setState({ guides: [] })
    useBrushSettingsStore.getState().setPrefs({
      tipId: 'proc.round-soft',
      size: 20,
      hardness: 0.35,
      opacity: 1,
      flow: 1,
      color: '#000000',
      spacing: 0.25,
      angle: 0,
      roundness: 1,
      recentTipIds: [],
    })
  })

  test('Vite dispose hands brush preferences to the replacement module', () => {
    let dispose: ((data: Record<string, unknown>) => void) | undefined
    const hot = {
      data: {} as Record<string, unknown>,
      dispose(callback: (data: Record<string, unknown>) => void) {
        dispose = callback
      },
      accept() {},
    }
    useBrushSettingsStore.getState().setPrefs({ size: 137, flow: 0.42 })
    installSessionHmrHandoff(hot)
    dispose!(hot.data)

    const snapshot = parseSessionSnapshot(hot.data.editorSession)
    expect(snapshot?.brush.size).toBe(137)
    expect(snapshot?.brush.flow).toBe(0.42)
  })

  test('a valid unsaved session marker suppresses demo replacement', async () => {
    useEditorSessionStore.setState({ dirty: true, activeToolId: 'brush' })
    const result = await restoreSessionSnapshot(captureSessionSnapshot())

    expect(result.restoredDurableTab).toBe(false)
    expect(useEditorSessionStore.getState().document.name).toBe('In progress')
    expect(useEditorSessionStore.getState().activeToolId).toBe('brush')
    expect(useDocumentTabManager.getState().tabs).toHaveLength(1)
  })

  test('captures guides with the session', async () => {
    useGuidesStore.getState().setGuides([{ id: 'horizon', axis: 'y', pos: 48 }])
    const snapshot = captureSessionSnapshot()
    useGuidesStore.setState({ guides: [] })
    await restoreSessionSnapshot(snapshot)
    expect(useGuidesStore.getState().guides).toEqual([
      { id: 'horizon', axis: 'y', pos: 48 },
    ])
  })

  test('rejects malformed or old snapshots safely', () => {
    expect(parseSessionSnapshot({ version: 0, tabs: [] })).toBeNull()
    expect(parseSessionSnapshot({ version: 1, tabs: 'not-tabs' })).toBeNull()
  })
})
