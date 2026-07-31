import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { AngleField } from '../../../ui/base/AngleField'
import { PickerSurface } from '../../../ui/base/PickerSurface'
import { SliderField } from '../../../ui/base/SliderField'
import {
  getTip,
  listTips,
  loadTipAlpha,
  loadTipRegistry,
  registerTipDescriptors,
  type TipAlpha,
} from '../../../imaging/brushes/tipRegistry'
import { renderTipPreview } from '../../../imaging/brushes/renderTipPreview'
import type { BrushTipDescriptor } from '../../../imaging/brushes/tipDescriptor'
import {
  convertAbrToUserTips,
  type AbrDocument,
} from '../../../imaging/brushes/abrImport'
import { saveUserTips } from '../../../imaging/brushes/userTipStore'
import { useBrushSettingsStore } from './brushSettingsStore'
import styles from './BrushTipPicker.module.css'

type Props = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
}

function PreviewCanvas({
  tip,
  size,
  hardness,
  opacity,
  flow,
  spacing,
  angle,
  roundness,
  color,
  mode = 'paint',
  className,
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
  mode?: 'paint' | 'erase'
  className?: string
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
      mode,
      width: 296,
      height: 64,
      dpr: 1,
      alpha,
    })
    canvas.width = preview.width
    canvas.height = preview.height
    canvas.getContext('2d')?.putImageData(preview, 0, 0)
  }, [tip, size, hardness, opacity, flow, spacing, angle, roundness, color, mode, alpha])
  return <canvas ref={canvasRef} className={className} aria-label="Sample brush stroke" />
}

export function TipThumbnail({
  tip,
  className,
}: {
  tip: BrushTipDescriptor
  className?: string
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
    const image = renderTipPreview({
      tip,
      size: 26,
      hardness: tip.hardness,
      opacity: 1,
      flow: 1,
      spacing: tip.spacing,
      angle: tip.angle,
      roundness: tip.roundness,
      color: '#d0d0d0',
      mode: 'paint',
      width: 26,
      height: 26,
      dpr: 1,
      sample: 'dab',
      alpha,
    })
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')?.putImageData(image, 0, 0)
  }, [tip, alpha])
  return <canvas ref={canvasRef} className={className} aria-hidden />
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
      title={`${tip.name} · ${tip.license.pack} · ${tip.license.spdx}`}
      onClick={onSelect}
    >
      <TipThumbnail tip={tip} />
    </button>
  )
}

export function BrushTipPicker({ open, anchorRef, onClose }: Props) {
  const prefs = useBrushSettingsStore()
  const [tips, setTips] = useState(() => listTips())
  const [pack, setPack] = useState('all')
  const [query, setQuery] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const gridScrollRef = useRef(0)
  const gridRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (grid) grid.scrollTop = gridScrollRef.current
  })

  useEffect(() => {
    if (!open) return
    void loadTipRegistry().then(() => setTips(listTips()))
  }, [open])
  const current = getTip(prefs.tipId) ?? getTip('proc.round-soft')!
  const visible = useMemo(
    () =>
      tips.filter(
        (tip) =>
          (pack === 'all' || tip.pack === pack) &&
          tip.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [tips, pack, query],
  )
  const packs = [...new Set(tips.map((tip) => tip.pack))]
  const importAbr = async (file: File) => {
    setImportStatus(`Importing ${file.name}…`)
    try {
      // ag-psd stays outside the initial editor bundle and only loads for a
      // user-selected ABR file.
      const { readAbr } = await import('ag-psd')
      const abr = readAbr(new Uint8Array(await file.arrayBuffer())) as AbrDocument
      const imported = convertAbrToUserTips(abr)
      if (imported.length === 0) throw new Error('No supported brush tips found')
      await saveUserTips(imported)
      registerTipDescriptors(imported.map(({ descriptor }) => descriptor))
      setTips(listTips())
      setPack('user')
      setQuery('')
      setImportStatus(`Imported ${imported.length} user tip${imported.length === 1 ? '' : 's'}`)
    } catch (error) {
      setImportStatus(error instanceof Error ? `Import failed: ${error.message}` : 'Import failed')
    }
  }
  const selectTip = (tip: BrushTipDescriptor) => {
    prefs.setPrefs({
      tipId: tip.id,
      hardness: tip.hardness,
      spacing: tip.spacing,
      roundness: tip.roundness,
      angle: 0,
      ...(tip.defaults.size ? { size: tip.defaults.size } : {}),
      ...(tip.defaults.opacity ? { opacity: tip.defaults.opacity } : {}),
      ...(tip.defaults.flow ? { flow: tip.defaults.flow } : {}),
    })
  }
  const shownScale = Math.min(100, Math.round((64 / Math.max(1, prefs.size)) * 100))

  return (
    <PickerSurface open={open} anchorRef={anchorRef} onClose={onClose} title="Brush" width={320} ariaLabel="Brush tip picker">
      <div className={styles.picker}>
        <header className={styles.header}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search brush tips"
          />
        </header>
        <PreviewCanvas
          className={styles.preview}
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
        {prefs.size > 64 && <div className={styles.caption}>Shown at {shownScale}%</div>}
        <SliderField label="Size" value={prefs.size} min={1} max={500} step={1} unit="px" defaultValue={20} onChange={(size) => prefs.setPrefs({ size })} />
        <SliderField label="Hard" value={Math.round(prefs.hardness * 100)} min={0} max={100} step={1} unit="%" defaultValue={35} onChange={(hardness) => prefs.setPrefs({ hardness: hardness / 100 })} />
        <div className={styles.triplet}>
          <SliderField label="Opac" value={Math.round(prefs.opacity * 100)} min={0} max={100} step={1} unit="%" defaultValue={100} onChange={(opacity) => prefs.setPrefs({ opacity: opacity / 100 })} />
          <SliderField label="Flow" value={Math.round(prefs.flow * 100)} min={1} max={100} step={1} unit="%" defaultValue={100} onChange={(flow) => prefs.setPrefs({ flow: flow / 100 })} />
          <SliderField label="Spac" value={Math.round(prefs.spacing * 100)} min={5} max={100} step={1} unit="%" defaultValue={25} onChange={(spacing) => prefs.setPrefs({ spacing: spacing / 100 })} />
        </div>
        <div className={styles.pair}>
          <AngleField label="Angle" value={prefs.angle} defaultValue={0} onChange={(angle) => prefs.setPrefs({ angle })} />
          <SliderField label="Round" value={Math.round(prefs.roundness * 100)} min={5} max={100} step={1} unit="%" defaultValue={100} onChange={(roundness) => prefs.setPrefs({ roundness: roundness / 100 })} />
        </div>
        <div className={styles.packRow}>
          <label>Packs:</label>
          <select value={pack} onChange={(event) => setPack(event.target.value)} aria-label="Brush pack">
            <option value="all">All</option>
            {packs.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div className={styles.importRow}>
          <label className={styles.importButton}>
            Import ABR…
            <input
              type="file"
              accept=".abr,application/octet-stream"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void importAbr(file)
              }}
            />
          </label>
          <span className={styles.disclaimer}>
            Imported brushes stay on this device. You are responsible for their license.
          </span>
        </div>
        {importStatus && <div className={styles.importStatus} role="status">{importStatus}</div>}
        <div
          ref={gridRef}
          className={styles.grid}
          role="radiogroup"
          aria-label="Brush tips"
          onScroll={(event) => { gridScrollRef.current = event.currentTarget.scrollTop }}
        >
          {visible.map((tip) => <TipChip key={tip.id} tip={tip} selected={tip.id === prefs.tipId} onSelect={() => selectTip(tip)} />)}
        </div>
        <footer className={styles.footer}>
          <div className={styles.recents} aria-label="Recent brush tips">
            <span>Recent:</span>
            {prefs.recentTipIds.map((id) => {
              const tip = getTip(id)
              return tip && <TipChip key={id} tip={tip} selected={id === prefs.tipId} onSelect={() => selectTip(tip)} />
            })}
          </div>
          <button type="button" onClick={() => prefs.setPrefs({ tipId: 'proc.round-soft', hardness: 0.35, spacing: 0.25, roundness: 1, angle: 0 })}>Reset tip</button>
        </footer>
      </div>
    </PickerSurface>
  )
}
