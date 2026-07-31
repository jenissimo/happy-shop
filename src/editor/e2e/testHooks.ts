/**
 * Dev/E2E hooks for Playwright (Wave F). Installed from EditorShell; not a
 * public API. Clipboard paste can be mocked without OS clipboard permissions.
 */

import type { CommandRegistry } from '../../core/commands/registry'
import { documentHistory } from '../session/documentHistory'
import {
  setHappyClipboard,
  type HappyClipboardPayload,
} from '../session/editClipboard'
import { fillSelection } from '../session/editSelectionCommands'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { useSelectionStore } from '../session/selectionStore'

export type HappyShopE2EHooks = {
  setHappyClipboard: (payload: HappyClipboardPayload | null) => void
  hasSelection: () => boolean
  selectionSize: () => { width: number; height: number } | null
  activeToolId: () => string
  canUndo: () => boolean
  undoLabel: () => string | null
  dirty: () => boolean
  layerNames: () => string[]
  selectedLayerNames: () => string[]
  runCommand: (id: string) => boolean
  /** Awaits fill under selection (command `run` is fire-and-forget). */
  fillSelection: () => Promise<boolean>
}

declare global {
  interface Window {
    __happyShopE2E?: HappyShopE2EHooks
  }
}

export function installE2EHooks(commands: CommandRegistry): void {
  if (typeof window === 'undefined') return
  window.__happyShopE2E = {
    setHappyClipboard,
    hasSelection: () => useSelectionStore.getState().hasSelection(),
    selectionSize: () => {
      const m = useSelectionStore.getState().marquee
      if (!m || m.width < 1 || m.height < 1) return null
      return { width: Math.round(m.width), height: Math.round(m.height) }
    },
    activeToolId: () => useEditorSessionStore.getState().activeToolId,
    canUndo: () => documentHistory.canUndo,
    undoLabel: () => documentHistory.undoLabel,
    dirty: () => useEditorSessionStore.getState().dirty,
    layerNames: () => {
      const doc = useEditorSessionStore.getState().document
      return Object.values(doc.layers).map((l) => l.name)
    },
    selectedLayerNames: () => {
      const { document: doc, selectedLayerIds } =
        useEditorSessionStore.getState()
      return selectedLayerIds.map((id) => doc.layers[id]?.name).filter(Boolean) as string[]
    },
    runCommand: (id) => commands.run(id),
    fillSelection: () => fillSelection(),
  }
}
