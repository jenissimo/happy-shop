import { IconButton } from '../../ui/base/IconButton'
import { CaretRight } from '@phosphor-icons/react'
import { Fragment, useEffect, useRef, useState } from 'react'
import {
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
          } else if (tool.id === 'pen' || tool.id === 'freeformPen') {
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
                        {TOOLS.filter((candidate) => candidate.group === tool.group).map((variant) => {
                          const Icon = variant.icon
                          return <button key={variant.id} type="button" role="menuitem" aria-label={variant.title} title={`${variant.title} (${variant.letter})`} onClick={() => {
                            persistToolFlyoutSelection(tool.group!, variant.id)
                            setPrefs({ ...prefs, [tool.group!]: variant.id })
                            setActiveToolId(variant.id)
                            setOpenGroup(null)
                          }}><Icon size={16} /></button>
                        })}
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
                          (['rect', 'ellipse'] as const).map((shape) => {
                            const Icon = marqueeIcon(shape)
                            return <button key={shape} type="button" role="menuitem" aria-label={marqueeTitle(shape)} title={marqueeTitle(shape)} onClick={() => {
                              useSelectionToolStore.getState().setMarqueeShape(shape)
                              setActiveToolId('marquee')
                              setOpenGroup(null)
                            }}><Icon size={16} /></button>
                          })
                        ) : (
                          (['freehand', 'polygonal', 'magnetic'] as const).map((mode) => {
                            const Icon = lassoIcon(mode)
                            return <button key={mode} type="button" role="menuitem" aria-label={lassoTitle(mode)} title={lassoTitle(mode)} onClick={() => {
                              useSelectionToolStore.getState().setLassoMode(mode)
                              setActiveToolId('lasso')
                              setOpenGroup(null)
                            }}><Icon size={16} /></button>
                          })
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
