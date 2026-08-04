import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import styles from './Popover.module.css'

export type PopoverPlacement =
  | 'below-start'
  | 'below-end'
  | 'above-start'
  | 'right-start'

export type PopoverProps = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  placement?: PopoverPlacement
  width?: number
  /** Maximum popover height in px. Defaults to 420. */
  maxHeight?: number
  ariaLabel: string
  /** Optional ref to the portaled host element (for pin-to-window handoff). */
  hostRef?: RefObject<HTMLDivElement | null>
}

const VIEWPORT_PADDING = 8

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function positionPopover(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  popover: Pick<DOMRect, 'width' | 'height'>,
  viewport: { width: number; height: number },
  placement: PopoverPlacement,
): { left: number; top: number } {
  let left = anchor.left
  let top = anchor.bottom
  if (placement === 'below-end') {
    left = anchor.right - popover.width
  } else if (placement === 'above-start') {
    top = anchor.top - popover.height
  } else if (placement === 'right-start') {
    left = anchor.right
    top = anchor.top
  }
  return {
    left: clamp(left, VIEWPORT_PADDING, viewport.width - popover.width - VIEWPORT_PADDING),
    top: clamp(top, VIEWPORT_PADDING, viewport.height - popover.height - VIEWPORT_PADDING),
  }
}

export function isPointWithinRect(
  point: Pick<PointerEvent, 'clientX' | 'clientY'>,
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
): boolean {
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  )
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden)
}

/**
 * A non-modal, anchored surface for compact pickers and menus.
 * It deliberately has no overlay: users can still see the document behind it.
 */
export function Popover({
  open,
  anchorRef,
  onClose,
  children,
  placement = 'below-start',
  width,
  maxHeight = 420,
  ariaLabel,
  hostRef: externalHostRef,
}: PopoverProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const assignHostRef = (element: HTMLDivElement | null) => {
    hostRef.current = element
    if (externalHostRef) externalHostRef.current = element
  }
  const openedRef = useRef(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  const updatePosition = () => {
    const anchor = anchorRef.current
    const host = hostRef.current
    if (!anchor || !host) return
    const anchorRect = anchor.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    setPosition(
      positionPopover(
        anchorRect,
        hostRect,
        { width: window.innerWidth, height: window.innerHeight },
        placement,
      ),
    )
  }

  useLayoutEffect(() => {
    if (!open) {
      openedRef.current = false
      setPosition(null)
      return
    }
    updatePosition()
  }, [open, placement, width, maxHeight])

  useEffect(() => {
    if (!open) return
    const host = hostRef.current
    if (!host) return
    if (!openedRef.current) {
      openedRef.current = true
      const firstFocusable = focusableElements(host)[0]
      ;(firstFocusable ?? host).focus()
    }

    const closeAndRestoreFocus = () => {
      onClose()
      anchorRef.current?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeAndRestoreFocus()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (hostRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      // Native scrollbar hit testing can report the document instead of the
      // scroll container, so also treat its painted bounds as inside.
      if (hostRef.current && isPointWithinRect(event, hostRef.current.getBoundingClientRect())) return
      closeAndRestoreFocus()
    }
    const onViewportChange = () => closeAndRestoreFocus()
    const onScroll = (event: Event) => {
      const target = event.target
      // Scroll events do not bubble, but the capture listener sees scrolls
      // from the popover's own scroll containers. Keep it open for those.
      if (target instanceof Node && hostRef.current?.contains(target)) return
      closeAndRestoreFocus()
    }

    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, anchorRef, onClose])

  if (!open || typeof document === 'undefined') return null

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const focusable = focusableElements(event.currentTarget)
    const boundary = event.shiftKey ? focusable[0] : focusable.at(-1)
    if (boundary && document.activeElement !== boundary) return
    onClose()
    anchorRef.current?.focus()
  }

  const style: CSSProperties = {
    left: position?.left ?? VIEWPORT_PADDING,
    top: position?.top ?? VIEWPORT_PADDING,
    width,
    // Never taller than the viewport: the host scrolls internally instead of
    // spilling off-screen on short windows.
    maxHeight: `min(${maxHeight}px, calc(100dvh - ${VIEWPORT_PADDING * 2}px))`,
    visibility: position ? undefined : 'hidden',
  }

  return createPortal(
    <div
      ref={assignHostRef}
      className={styles.host}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-popover="true"
    >
      {children}
    </div>,
    document.body,
  )
}
