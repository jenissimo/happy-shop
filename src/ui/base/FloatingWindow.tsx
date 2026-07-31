import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { IconButton } from './IconButton'
import { floatingPositionFromDrag } from './floatingWindowDrag'
import styles from './FloatingWindow.module.css'

/** Rising z-index so the last focused floating window stacks on top. */
let nextFloatingZ = 1200

function claimZ(): number {
  nextFloatingZ += 1
  return nextFloatingZ
}

export type FloatingWindowProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Initial width (CSS length or number of px). */
  width?: number | string
  /** Optional fixed height. */
  height?: number | string
  /** Initial top-left; defaults to a staggered center. */
  defaultPosition?: { x: number; y: number }
  /** Close on Escape (default true). Outside click never closes. */
  closeOnEscape?: boolean
  /** Extra class on the shell. */
  className?: string
  /** When true, body has no default padding (caller layouts fully). */
  bare?: boolean
  /** Optional aria label (defaults to title). */
  ariaLabel?: string
}

/**
 * Non-modal, draggable app window (Photoshop-like floating panel).
 * No scrim — editor stays interactive; Esc closes; outside click does not.
 * Portaled to document.body so `position: fixed` is viewport-relative
 * (avoids jumps inside transformed ancestors such as dockview panels).
 */
export function FloatingWindow({
  open,
  title,
  onClose,
  children,
  width = 420,
  height,
  defaultPosition,
  closeOnEscape = true,
  className,
  bare = false,
  ariaLabel,
}: FloatingWindowProps) {
  const reactId = useId()
  const hostRef = useRef<HTMLDivElement>(null)
  const titleBarRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<{ x: number; y: number } | null>(null)
  const wasOpenRef = useRef(false)
  const [zIndex, setZIndex] = useState(() => claimZ())
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const applyPos = useCallback((next: { x: number; y: number }) => {
    posRef.current = next
    setPos(next)
  }, [])

  // Initialize position only when transitioning closed → open (not on every
  // defaultPosition identity change, which would reset mid-drag).
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      posRef.current = null
      setPos(null)
      dragRef.current = null
      setDragging(false)
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setZIndex(claimZ())
    if (defaultPosition) {
      applyPos(defaultPosition)
      return
    }
    const w = typeof width === 'number' ? width : 420
    const x = Math.max(24, Math.round(window.innerWidth / 2 - w / 2))
    const y = Math.max(48, Math.round(window.innerHeight * 0.18))
    // Slight stagger from react id hash so multiple windows don't perfectly overlap.
    let hash = 0
    for (let i = 0; i < reactId.length; i++) hash = (hash + reactId.charCodeAt(i) * (i + 1)) % 48
    applyPos({ x: x + hash, y: y + (hash % 32) })
  }, [open, defaultPosition, width, reactId, applyPos])

  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Only close the topmost floating window (highest z among open hosts).
      const hosts = document.querySelectorAll<HTMLElement>('[data-floating-window="true"]')
      let top: HTMLElement | null = null
      let topZ = -1
      hosts.forEach((el) => {
        const z = Number(el.style.zIndex || 0)
        if (z >= topZ) {
          topZ = z
          top = el
        }
      })
      if (top && top !== hostRef.current) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, closeOnEscape, onClose])

  // Safety: end drag if capture is lost (e.g. pointer cancelled by browser).
  useEffect(() => {
    if (!dragging) return
    const titleEl = titleBarRef.current
    if (!titleEl) return
    const onLost = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      dragRef.current = null
      setDragging(false)
    }
    titleEl.addEventListener('lostpointercapture', onLost)
    return () => titleEl.removeEventListener('lostpointercapture', onLost)
  }, [dragging])

  const bringToFront = useCallback(() => {
    setZIndex(claimZ())
  }, [])

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, select, textarea')) return
    const current = posRef.current
    if (!current) return
    e.preventDefault()
    e.stopPropagation()
    bringToFront()
    // Capture on the title bar — the same element that owns move/up handlers.
    // Capturing on the host (parent) retargets events away from these handlers.
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: current.x,
      origY: current.y,
    }
    setDragging(true)
  }

  const onTitlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const el = hostRef.current
    const ww = el?.offsetWidth ?? 320
    applyPos(
      floatingPositionFromDrag(
        { x: drag.origX, y: drag.origY },
        { x: drag.startX, y: drag.startY },
        { x: e.clientX, y: e.clientY },
        ww,
        window.innerWidth,
        window.innerHeight,
      ),
    )
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  if (!open || !pos) return null

  const style: CSSProperties = {
    left: pos.x,
    top: pos.y,
    width: typeof width === 'number' ? `${width}px` : width,
    height: height == null ? undefined : typeof height === 'number' ? `${height}px` : height,
    zIndex,
  }

  return createPortal(
    <div
      ref={hostRef}
      className={[styles.host, className].filter(Boolean).join(' ')}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel ?? title}
      data-floating-window="true"
      onMouseDown={bringToFront}
    >
      <div
        ref={titleBarRef}
        className={`${styles.titleBar}${dragging ? ` ${styles.titleBarDragging}` : ''}`}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <h2 className={styles.title}>{title}</h2>
        <IconButton icon={X} title="Close" size={14} onClick={onClose} />
      </div>
      <div className={`${styles.body}${bare ? ` ${styles.noPad}` : ''}`}>{children}</div>
    </div>,
    document.body,
  )
}
