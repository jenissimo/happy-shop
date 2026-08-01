import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import styles from './Tooltip.module.css'

export type TooltipPlacement = 'right' | 'bottom'

const SHOW_DELAY_MS = 200
/** After one tooltip shows, the next appears instantly while hovering siblings (PS/OS toolbar feel). */
const INSTANT_WINDOW_MS = 400
const GAP_PX = 6

let lastShownAt = 0

export function tooltipShowDelayMs(now = performance.now()): number {
  return now - lastShownAt < INSTANT_WINDOW_MS ? 0 : SHOW_DELAY_MS
}

export function markTooltipShown(now = performance.now()): void {
  lastShownAt = now
}

export function positionTooltip(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>,
  tip: Pick<DOMRect, 'width' | 'height'>,
  viewport: { width: number; height: number },
  placement: TooltipPlacement,
): { left: number; top: number } {
  let left: number
  let top: number
  if (placement === 'right') {
    left = anchor.right + GAP_PX
    top = anchor.top + (anchor.height - tip.height) / 2
  } else {
    left = anchor.left + (anchor.width - tip.width) / 2
    top = anchor.bottom + GAP_PX
  }
  return {
    left: Math.max(4, Math.min(left, viewport.width - tip.width - 4)),
    top: Math.max(4, Math.min(top, viewport.height - tip.height - 4)),
  }
}

type TooltipProps = {
  label: string
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  placement?: TooltipPlacement
}

/** Portaled label bubble; caller owns open/close timing. */
export function Tooltip({ label, open, anchorRef, placement = 'bottom' }: TooltipProps) {
  const tipRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const tip = tipRef.current
    if (!anchor || !tip) return
    const next = positionTooltip(
      anchor.getBoundingClientRect(),
      tip.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
      placement,
    )
    setStyle({ left: next.left, top: next.top, visibility: 'visible' })
    markTooltipShown()
  }, [open, anchorRef, placement, label])

  useEffect(() => {
    if (!open) setStyle({ visibility: 'hidden' })
  }, [open])

  if (!open) return null

  return createPortal(
    <div ref={tipRef} className={styles.tooltip} style={style} role="tooltip">
      {label}
    </div>,
    document.body,
  )
}
