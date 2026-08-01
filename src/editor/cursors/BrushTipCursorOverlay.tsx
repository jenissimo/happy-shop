import { type RefObject } from 'react'
import type { BrushTipRing } from './brushCursor'
import styles from './BrushTipCursorOverlay.module.css'

export type BrushTipCursorOverlayProps = {
  ring: BrushTipRing
  /** Position relative to the viewport host (CSS px). */
  x: number
  y: number
  overlayRef?: RefObject<HTMLDivElement | null>
}

/** Screen-space tip diameter ring; hotspot is the ring center. */
export function BrushTipCursorOverlay({
  ring,
  x,
  y,
  overlayRef,
}: BrushTipCursorOverlayProps) {
  const size = ring.diameterPx
  const dashed = ring.mode === 'eraser'
  const inset = 0.5
  const dashArray = dashed
    ? `${Math.max(2, size * 0.08)} ${Math.max(2, size * 0.06)}`
    : undefined

  return (
    <div
      className={styles.root}
      ref={overlayRef}
      data-testid="brush-tip-cursor"
      data-mode={ring.mode}
      data-shape={ring.shape}
      style={{
        width: size,
        height: size,
        transform: `translate(${x - size / 2}px, ${y - size / 2}px)`,
      }}
    >
      <svg
        className={styles.svg}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        {ring.shape === 'square' ? (
          <rect
            className={dashed ? styles.outerDashed : styles.outer}
            x={inset}
            y={inset}
            width={Math.max(1, size - inset * 2)}
            height={Math.max(1, size - inset * 2)}
            strokeDasharray={dashArray}
          />
        ) : (
          <>
            {ring.hardnessGhostPx != null ? (
              <circle
                className={styles.ghost}
                cx={size / 2}
                cy={size / 2}
                r={ring.hardnessGhostPx / 2}
              />
            ) : null}
            <circle
              className={dashed ? styles.outerDashed : styles.outer}
              cx={size / 2}
              cy={size / 2}
              r={Math.max(0.5, size / 2 - 0.5)}
              strokeDasharray={dashArray}
            />
          </>
        )}
      </svg>
    </div>
  )
}
