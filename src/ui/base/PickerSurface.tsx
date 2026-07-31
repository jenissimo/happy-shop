import { PushPin } from '@phosphor-icons/react'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { FloatingWindow } from './FloatingWindow'
import { IconButton } from './IconButton'
import { Popover, type PopoverPlacement } from './Popover'
import styles from './PickerSurface.module.css'

export type PickerSurfaceProps = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  title: string
  ariaLabel: string
  children: ReactNode
  width?: number
  maxHeight?: number
  placement?: PopoverPlacement
  /** When false, hides the pin affordance (compact flyouts). Default true. */
  pinEnabled?: boolean
}

export function readPinnedWindowPosition(
  host: Pick<DOMRect, 'left' | 'top'> | null | undefined,
): { x: number; y: number } | undefined {
  if (!host) return undefined
  return { x: Math.round(host.left), y: Math.round(host.top) }
}

/**
 * Anchored picker shell that can promote to a draggable FloatingWindow.
 * Body content stays surface-agnostic; only the wrapper swaps on pin.
 */
export function PickerSurface({
  open,
  anchorRef,
  onClose,
  title,
  ariaLabel,
  children,
  width,
  maxHeight = 420,
  placement = 'below-start',
  pinEnabled = true,
}: PickerSurfaceProps) {
  const popoverHostRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(false)
  const [pinnedPosition, setPinnedPosition] = useState<{ x: number; y: number } | undefined>()

  useEffect(() => {
    if (open) return
    setPinned(false)
    setPinnedPosition(undefined)
  }, [open])

  const closeAll = () => {
    setPinned(false)
    setPinnedPosition(undefined)
    onClose()
  }

  const pinToWindow = () => {
    setPinnedPosition(readPinnedWindowPosition(popoverHostRef.current?.getBoundingClientRect()))
    setPinned(true)
  }

  if (!open) return null

  if (pinned) {
    return (
      <FloatingWindow
        open
        title={title}
        onClose={closeAll}
        width={width}
        height={maxHeight}
        defaultPosition={pinnedPosition}
        bare
        ariaLabel={ariaLabel}
      >
        <div className={styles.body}>{children}</div>
      </FloatingWindow>
    )
  }

  return (
    <Popover
      open
      anchorRef={anchorRef}
      onClose={closeAll}
      placement={placement}
      width={width}
      maxHeight={maxHeight}
      ariaLabel={ariaLabel}
      hostRef={popoverHostRef}
    >
      <div className={styles.shell}>
        {pinEnabled && (
          <header className={styles.header}>
            <span className={styles.title}>{title}</span>
            <IconButton icon={PushPin} title="Pin to window" size={14} onClick={pinToWindow} />
          </header>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </Popover>
  )
}
