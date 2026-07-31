import { useEffect, useRef } from 'react'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { BrushOptionsControls } from './BrushOptionsControls'
import styles from './BrushContextMenu.module.css'

type Props = {
  x: number
  y: number
  onClose: () => void
}

/** Photoshop-habit right-click brush/eraser settings on the canvas. */
export function BrushContextMenu({ x, y, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const activeToolId = useEditorSessionStore((s) => s.activeToolId)
  const isPencil = activeToolId === 'pencil'

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [x, y])

  return (
    <div
      ref={rootRef}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="dialog"
      aria-label={isPencil ? 'Pencil settings' : 'Brush settings'}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className={styles.title}>{isPencil ? 'Pencil settings' : 'Brush settings'}</div>
      <BrushOptionsControls
        layout="menu"
        variant={isPencil ? 'pencil' : 'brush'}
      />
    </div>
  )
}
