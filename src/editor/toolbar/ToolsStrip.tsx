import { IconButton } from '../../ui/base/IconButton'
import { CaretRight } from '@phosphor-icons/react'
import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  persistToolsStripLayoutPref,
  readToolsStripLayoutPref,
  TOOLS_STRIP_LAYOUT_CHANGED_EVENT,
  type ToolsStripLayout,
} from '../../ui/features/settings/prefs'
import { ColorSwatches } from '../color'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { useSelectionToolStore } from '../session/selectionToolStore'
import {
  TOOLS,
  lassoIcon,
  lassoTitle,
  marqueeIcon,
  marqueeTitle,
  pathSelectIcon,
  pathSelectTitle,
  penIcon,
  penTitle,
  type EditorToolId,
} from './tools'
import { persistToolFlyoutSelection, readToolFlyoutPrefs, visibleTools } from './toolFlyoutPrefs'
import {
  toolsStripLayoutFromDragWidth,
  toolsStripWidthForLayout,
} from './toolsStripLayout'
import styles from './ToolsStrip.module.css'

function useToolsStripLayout(): ToolsStripLayout {
  const [layout, setLayout] = useState(readToolsStripLayoutPref)
  useEffect(() => {
    const sync = () => setLayout(readToolsStripLayoutPref())
    window.addEventListener(TOOLS_STRIP_LAYOUT_CHANGED_EVENT, sync)
    return () => window.removeEventListener(TOOLS_STRIP_LAYOUT_CHANGED_EVENT, sync)
  }, [])
  return layout
}

export function ToolsStrip() {
  const stripLayout = useToolsStripLayout()
  const doubleColumn = stripLayout === 'double'
  const activeToolId = useEditorSessionStore((s) => s.activeToolId)
  const setActiveToolId = useEditorSessionStore((s) => s.setActiveToolId)
  const marqueeShape = useSelectionToolStore((s) => s.marqueeShape)
  const lassoMode = useSelectionToolStore((s) => s.lassoMode)
  const [prefs, setPrefs] = useState(readToolFlyoutPrefs)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const resizeDrag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const stripLayoutRef = useRef(stripLayout)
  stripLayoutRef.current = stripLayout

  // Close flyout on outside click / Escape (menu items and disclosure toggles handle themselves).
  useEffect(() => {
    if (!openGroup) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        setOpenGroup(null)
        return
      }
      if (target.closest(`.${styles.flyout}`) || target.closest(`.${styles.disclosure}`)) return
      setOpenGroup(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openGroup])

  // Tool shortcuts (and any external tool switch) should dismiss an open flyout.
  const prevToolId = useRef(activeToolId)
  useEffect(() => {
    if (prevToolId.current !== activeToolId) {
      prevToolId.current = activeToolId
      setOpenGroup(null)
    }
  }, [activeToolId])

  const applyStripLayout = (layout: ToolsStripLayout) => {
    if (layout === stripLayoutRef.current) return
    stripLayoutRef.current = layout
    persistToolsStripLayoutPref(layout)
  }

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    resizeDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: toolsStripWidthForLayout(stripLayoutRef.current),
    }
  }

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const width = drag.startWidth + (event.clientX - drag.startX)
    applyStripLayout(toolsStripLayoutFromDragWidth(width))
  }

  const endResizeDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    resizeDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onResizeDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    applyStripLayout(stripLayoutRef.current === 'double' ? 'single' : 'double')
  }
  const activeGroup = TOOLS.find((tool) => tool.id === activeToolId)?.group
  const displayed = visibleTools(
    TOOLS,
    activeGroup ? { ...prefs, [activeGroup]: activeToolId } : prefs,
  )

  const clearLongPress = () => {
    if (longPressTimer.current === null) return
    window.clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }

  const scheduleLongPress = (group: string | undefined) => {
    if (!group) return
    clearLongPress()
    longPressTimer.current = window.setTimeout(() => {
      setOpenGroup(group)
      longPressTimer.current = null
    }, 450)
  }

  const renderSeparator = (key: string) =>
    doubleColumn ? (
      <div key={key} className={styles.sepRow} role="separator">
        <div className={styles.sep} />
      </div>
    ) : (
      <div key={key} className={styles.sep} role="separator" />
    )

  return (
    <aside
      className={`${styles.strip} ${doubleColumn ? styles.stripDouble : ''}`}
      aria-label="Tools"
    >
      <div
        className={styles.resizeHandle}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tools strip"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResizeDrag}
        onPointerCancel={endResizeDrag}
        onDoubleClick={onResizeDoubleClick}
      />
      <div className={`${styles.tools} ${doubleColumn ? styles.toolsDouble : ''}`}>
        {displayed.map((tool) => {
          const enabled = tool.enabled !== false
          const active = activeToolId === tool.id
          let icon = tool.icon
          let title = tool.title
          if (tool.id === 'marquee') {
            icon = marqueeIcon(marqueeShape)
            title = marqueeTitle(marqueeShape)
          } else if (tool.id === 'pathSelection' || tool.id === 'directSelection') {
            icon = pathSelectIcon(tool.id)
            title = pathSelectTitle(tool.id)
          } else if (tool.id === 'pen' || tool.id === 'freeformPen' || tool.id === 'addAnchor' || tool.id === 'deleteAnchor' || tool.id === 'convertPoint') {
            icon = penIcon(tool.id)
            title = penTitle(tool.id)
          } else if (tool.id === 'lasso') {
            icon = lassoIcon(lassoMode)
            title = lassoTitle(lassoMode)
          }
          return (
            <Fragment key={tool.id}>
              {tool.separatorBefore ? renderSeparator(`${tool.id}-sep`) : null}
              <div className={styles.slot}>
                <IconButton
                  icon={icon}
                  size={16}
                  className={styles.tool}
                  title={`${title} (${tool.letter})`}
                  tooltipPlacement="right"
                  active={active}
                  disabled={!enabled}
                  onPointerDown={() =>
                    scheduleLongPress(
                      tool.group ??
                        (tool.id === 'marquee' || tool.id === 'lasso' ? tool.id : undefined),
                    )
                  }
                  onPointerUp={clearLongPress}
                  onPointerCancel={clearLongPress}
                  onPointerLeave={clearLongPress}
                  onClick={() => {
                    setOpenGroup(null)
                    if (enabled) setActiveToolId(tool.id as EditorToolId)
                  }}
                />
                {tool.group ? (
                  <>
                    <button
                      type="button"
                      className={styles.disclosure}
                      aria-label={`Choose ${tool.title} variant`}
                      aria-expanded={openGroup === tool.group}
                      onClick={() => setOpenGroup(openGroup === tool.group ? null : tool.group!)}
                    ><CaretRight size={10} /></button>
                    {openGroup === tool.group ? (
                      <div className={styles.flyout} role="menu">
                        {TOOLS.filter((candidate) => candidate.group === tool.group).map((variant) => (
                          <IconButton
                            key={variant.id}
                            icon={variant.icon}
                            size={16}
                            role="menuitem"
                            title={`${variant.title} (${variant.letter})`}
                            tooltipPlacement="right"
                            active={activeToolId === variant.id}
                            onClick={() => {
                              persistToolFlyoutSelection(tool.group!, variant.id)
                              setPrefs({ ...prefs, [tool.group!]: variant.id })
                              setActiveToolId(variant.id)
                              setOpenGroup(null)
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {(tool.id === 'marquee' || tool.id === 'lasso') ? (
                  <>
                    <button
                      type="button"
                      className={styles.disclosure}
                      aria-label={`Choose ${tool.id === 'marquee' ? 'marquee' : 'lasso'} variant`}
                      aria-expanded={openGroup === tool.id}
                      onClick={() => setOpenGroup(openGroup === tool.id ? null : tool.id)}
                    ><CaretRight size={10} /></button>
                    {openGroup === tool.id ? (
                      <div className={styles.flyout} role="menu">
                        {tool.id === 'marquee' ? (
                          (['rect', 'ellipse'] as const).map((shape) => (
                            <IconButton
                              key={shape}
                              icon={marqueeIcon(shape)}
                              size={16}
                              role="menuitem"
                              title={marqueeTitle(shape)}
                              tooltipPlacement="right"
                              active={marqueeShape === shape}
                              onClick={() => {
                                useSelectionToolStore.getState().setMarqueeShape(shape)
                                setActiveToolId('marquee')
                                setOpenGroup(null)
                              }}
                            />
                          ))
                        ) : (
                          (['freehand', 'polygonal', 'magnetic'] as const).map((mode) => (
                            <IconButton
                              key={mode}
                              icon={lassoIcon(mode)}
                              size={16}
                              role="menuitem"
                              title={lassoTitle(mode)}
                              tooltipPlacement="right"
                              active={lassoMode === mode}
                              onClick={() => {
                                useSelectionToolStore.getState().setLassoMode(mode)
                                setActiveToolId('lasso')
                                setOpenGroup(null)
                              }}
                            />
                          ))
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </Fragment>
          )
        })}
      </div>
      <div className={styles.colors}>
        <div className={styles.sep} role="separator" />
        <ColorSwatches />
      </div>
    </aside>
  )
}
