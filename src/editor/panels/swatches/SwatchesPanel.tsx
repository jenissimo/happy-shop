import { useEffect, useState } from 'react'
import {
  hexToCssColor,
  loadLospecPalette,
  loadLospecPaletteIndex,
  type LospecPalette,
  type LospecPaletteIndexEntry,
} from '../../../imaging/palettes'
import { useColorStore } from '../../color/colorStore'
import { usePaletteStore } from '../../color/paletteStore'
import styles from './SwatchesPanel.module.css'

export function SwatchesPanel() {
  const foreground = useColorStore((s) => s.foreground)
  const setForeground = useColorStore((s) => s.setForeground)
  const activePaletteId = usePaletteStore((s) => s.activePaletteId)
  const setActivePaletteId = usePaletteStore((s) => s.setActivePaletteId)
  const snapToPalette = usePaletteStore((s) => s.snapToPalette)
  const setSnapToPalette = usePaletteStore((s) => s.setSnapToPalette)

  const [index, setIndex] = useState<LospecPaletteIndexEntry[] | null>(null)
  const [palette, setPalette] = useState<LospecPalette | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void loadLospecPaletteIndex()
      .then((entries) => {
        if (cancelled) return
        setIndex(entries)
        if (!usePaletteStore.getState().activePaletteId && entries[0]) {
          setActivePaletteId(entries[0].id)
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Palette catalog unavailable')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [setActivePaletteId])

  useEffect(() => {
    if (!activePaletteId) {
      setPalette(null)
      return
    }
    let cancelled = false
    setError(null)
    void loadLospecPalette(activePaletteId)
      .then((loaded) => {
        if (!cancelled) {
          setPalette(loaded)
          usePaletteStore.getState().setActivePaletteColors(loaded.colors)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPalette(null)
          setError(cause instanceof Error ? cause.message : 'Palette unavailable')
        }
      })
    return () => {
      cancelled = true
    }
  }, [activePaletteId])

  const onSelectPalette = (id: string) => {
    setActivePaletteId(id)
  }

  const onToggleSnap = (enabled: boolean) => {
    setSnapToPalette(enabled)
    useColorStore.getState().setForeground(useColorStore.getState().foreground)
  }

  const onPickSwatch = (hex: string) => {
    setForeground(hexToCssColor(hex))
  }

  if (loading && !index) {
    return <div className={styles.root}><div className={styles.loading}>Loading palettes…</div></div>
  }

  if (error && !index) {
    return <div className={styles.root}><div className={styles.error}>{error}</div></div>
  }

  if (!index || index.length === 0) {
    return <div className={styles.root}><div className={styles.empty}>No palettes in catalog.</div></div>
  }

  const fgNormalized = foreground.toLowerCase()

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <select
          className={styles.select}
          value={activePaletteId ?? index[0]!.id}
          aria-label="Palette set"
          onChange={(event) => onSelectPalette(event.target.value)}
        >
          {index.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} ({entry.colorCount})
            </option>
          ))}
        </select>
        <label className={styles.snapToggle} title="Snap brush and pencil foreground to nearest palette color">
          <input
            type="checkbox"
            checked={snapToPalette}
            onChange={(event) => onToggleSnap(event.target.checked)}
          />
          Snap
        </label>
      </div>

      <div className={styles.body}>
        {palette ? (
          <div className={styles.grid} role="list" aria-label={`${palette.name} swatches`}>
            {palette.colors.map((hex) => {
              const css = hexToCssColor(hex)
              const isActive = css === fgNormalized
              return (
                <button
                  key={hex}
                  type="button"
                  role="listitem"
                  className={`${styles.swatch}${isActive ? ` ${styles.swatchActive}` : ''}`}
                  style={{ backgroundColor: css }}
                  title={hex}
                  aria-label={`Set foreground to ${hex}`}
                  aria-pressed={isActive}
                  onClick={() => onPickSwatch(hex)}
                />
              )
            })}
          </div>
        ) : (
          <div className={styles.loading}>Loading swatches…</div>
        )}
      </div>

      {palette ? (
        <footer className={styles.footer}>
          <div>{palette.author} · {palette.license}</div>
          <div>
            <a href={palette.sourceUrl} target="_blank" rel="noopener noreferrer">
              View on Lospec
            </a>
          </div>
        </footer>
      ) : null}
    </div>
  )
}
