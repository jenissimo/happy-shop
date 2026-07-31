import { useRef, useState } from 'react'
import {
  ContextMenu,
  ContextMenuLayer,
  ctxItem,
  ctxSep,
  type ContextMenuItem,
} from '../../ui/shell/ContextMenu'
import {
  useDocumentTabManager,
  type DocumentTabId,
} from '../session/DocumentTabManager'
import {
  requestCloseAllTabs,
  requestCloseOtherTabs,
  requestCloseSavedTabs,
  requestCloseTab,
} from '../session/tabClose'
import styles from './DocumentTabStrip.module.css'

type MenuState = { x: number; y: number; tabId: DocumentTabId } | null

/**
 * Document tab strip (SPECS/MULTI-DOC-AND-TOOLBAR.md M2.5).
 * RMB: Close / Close Others / Close Saved / Close All + Rename (WS-CANVAS-TAB).
 * Drag tabs to reorder (GAP-UX-TAB-REORDER → `DocumentTabManager.reorderTab`).
 */
export function DocumentTabStrip() {
  const tabs = useDocumentTabManager((s) => s.tabs)
  const activeTabId = useDocumentTabManager((s) => s.activeTabId)
  const activateTab = useDocumentTabManager((s) => s.activateTab)
  const renameTab = useDocumentTabManager((s) => s.renameTab)
  const reorderTab = useDocumentTabManager((s) => s.reorderTab)
  const [menu, setMenu] = useState<MenuState>(null)
  const draggedIdRef = useRef<DocumentTabId | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const onDragStart = (e: React.DragEvent, tabId: DocumentTabId) => {
    if ((e.target as HTMLElement).closest(`.${styles.close}`)) {
      e.preventDefault()
      return
    }
    draggedIdRef.current = tabId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
  }

  const onDragOver = (e: React.DragEvent, index: number) => {
    if (!draggedIdRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    const draggedId =
      draggedIdRef.current ?? (e.dataTransfer.getData('text/plain') as DocumentTabId)
    draggedIdRef.current = null
    setDragOverIndex(null)
    if (!draggedId) return
    reorderTab(draggedId, index)
  }

  const onDragEnd = () => {
    draggedIdRef.current = null
    setDragOverIndex(null)
  }

  const menuItems = (tabId: DocumentTabId): ContextMenuItem[] => {
    const tab = tabs.find((t) => t.id === tabId)
    const others = tabs.length > 1
    const hasSaved = tabs.some((t) => !t.dirty)
    return [
      ctxItem({
        id: 'tab.close',
        label: 'Close',
        run: () => requestCloseTab(tabId),
      }),
      ctxItem({
        id: 'tab.closeOthers',
        label: 'Close Others',
        disabled: !others,
        run: () => requestCloseOtherTabs(tabId),
      }),
      ctxItem({
        id: 'tab.closeSaved',
        label: 'Close Saved',
        disabled: !hasSaved,
        run: () => requestCloseSavedTabs(),
      }),
      ctxItem({
        id: 'tab.closeAll',
        label: 'Close All',
        run: () => requestCloseAllTabs(),
      }),
      ctxSep(),
      ctxItem({
        id: 'tab.rename',
        label: 'Rename…',
        run: () => {
          const current = tab?.document.name ?? 'Untitled'
          const next = window.prompt('Rename document', current)
          if (next == null) return
          renameTab(tabId, next)
        },
      }),
    ]
  }

  return (
    <ContextMenuLayer>
      <div className={styles.strip} role="tablist" aria-label="Documents">
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              draggable
              className={`${styles.tab} ${active ? styles.active : ''}${
                dragOverIndex === index ? ` ${styles.dragOver}` : ''
              }`}
              title={tab.document.name}
              onClick={() => activateTab(tab.id)}
              onDragStart={(e) => onDragStart(e, tab.id)}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => onDrop(e, index)}
              onDragEnd={onDragEnd}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                activateTab(tab.id)
                setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id })
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  requestCloseTab(tab.id)
                }
              }}
            >
              <span className={styles.label}>{tab.document.name}</span>
              <span className={styles.dirty} aria-hidden>
                {tab.dirty ? '●' : ''}
              </span>
              <span
                className={styles.close}
                role="presentation"
                onClick={(e) => {
                  e.stopPropagation()
                  requestCloseTab(tab.id)
                }}
              >
                ×
              </span>
            </button>
          )
        })}
      </div>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.tabId)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </ContextMenuLayer>
  )
}
