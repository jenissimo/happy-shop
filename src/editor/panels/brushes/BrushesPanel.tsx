import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listTips,
  loadTipRegistry,
  loadTipAlpha,
  type TipAlpha,
} from '../../../imaging/brushes/tipRegistry'
import { renderTipPreview } from '../../../imaging/brushes/renderTipPreview'
import type { BrushTipDescriptor } from '../../../imaging/brushes/tipDescriptor'
import { TipThumbnail } from '../../tools/brush/BrushTipPicker'
import { useBrushSettingsStore } from '../../tools/brush/brushSettingsStore'
import { resolveCurrentBrushTip, selectBrushTip } from './brushPanelUtils'
import styles from './BrushesPanel.module.css'

function StrokePreview({
  tip,
  size,
  hardness,
  opacity,
  flow,
  spacing,
  angle,
  roundness,
  color,
}: {
  tip: BrushTipDescriptor
  size: number
  hardness: number
  opacity: number
  flow: number
  spacing: number
  angle: number
  roundness: number
  color: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [alpha, setAlpha] = useState<TipAlpha | null>(null)

  useEffect(() => {
    let active = true
    setAlpha(null)
    if (tip.kind === 'stamp') {
      void loadTipAlpha(tip.id)
        .then((loaded) => active && setAlpha(loaded))
        .catch(() => active && setAlpha(null))
    }
    return () => {
      active = false
    }
  }, [tip])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const preview = renderTipPreview({
      tip,
      size,
      hardness,
      opacity,
      flow,
      spacing,
      angle,
      roundness,
      color,
      mode: 'paint',
      width: 296,
      height: 48,
      dpr: 1,
      alpha,
    })
    canvas.width = preview.width
    canvas.height = preview.height
    canvas.getContext('2d')?.putImageData(preview, 0, 0)
  }, [tip, size, hardness, opacity, flow, spacing, angle, roundness, color, alpha])

  return <canvas ref={canvasRef} className={styles.preview} aria-label="Brush stroke preview" />
}

function TipChip({
  tip,
  selected,
  onSelect,
}: {
  tip: BrushTipDescriptor
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`${styles.tipChip}${selected ? ` ${styles.selected}` : ''}`}
      role="radio"
      aria-checked={selected}
      title={tip.name}
      onClick={onSelect}
    >
      <TipThumbnail tip={tip} className={styles.thumb} />
    </button>
  )
}

/** Right-dock brush tips — grid linked to the shared tip registry. */
export function BrushesPanel() {
  const prefs = useBrushSettingsStore()
  const [tips, setTips] = useState(() => listTips())
  const current = resolveCurrentBrushTip(prefs.tipId)
  const visible = useMemo(() => tips, [tips])

  useEffect(() => {
    void loadTipRegistry().then(() => setTips(listTips()))
  }, [])

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.meta} title={current.name}>
          {current.name} · {Math.round(prefs.size)} px
        </span>
      </div>
      <div className={styles.previewWrap}>
        <StrokePreview
          tip={current}
          size={prefs.size}
          hardness={prefs.hardness}
          opacity={prefs.opacity}
          flow={prefs.flow}
          spacing={prefs.spacing}
          angle={prefs.angle}
          roundness={prefs.roundness}
          color={prefs.color}
        />
      </div>
      {visible.length === 0 ? (
        <div className={styles.empty}>Loading brush tips…</div>
      ) : (
        <div className={styles.grid} role="radiogroup" aria-label="Brush tips">
          {visible.map((tip) => (
            <TipChip
              key={tip.id}
              tip={tip}
              selected={tip.id === prefs.tipId}
              onSelect={() => selectBrushTip(tip)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
