import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Eyedropper } from '@phosphor-icons/react'
import { Button } from '../Button'
import { FloatingWindow } from '../FloatingWindow'
import { IconButton } from '../IconButton'
import { NumericField } from '../NumericField'
import {
  beginColorEyedropper,
  endColorEyedropper,
  getColorEyedropperState,
  subscribeColorEyedropper,
} from './colorEyedropperStore'
import {
  clampByte,
  clampHue,
  clampPercent,
  formatHex,
  hsbToRgb,
  hueCss,
  parseColor,
  rgbToHsb,
  type Hsb,
  type Rgb,
} from './colorMath'
import { loadRecentColors, pushRecentColor } from './recentColors'
import styles from './ColorPicker.module.css'

export type ColorPickerProps = {
  open: boolean
  value: string
  onChange: (value: string) => void
  onClose: () => void
  title?: string
  /** Include alpha channel (#rrggbbaa). Default false (opaque). */
  alpha?: boolean
  defaultPosition?: { x: number; y: number }
}

type Local = {
  rgb: Rgb
  hsb: Hsb
  a: number
  hexDraft: string
}

function fromValue(value: string): Local {
  const { rgb, a } = parseColor(value)
  const hsb = rgbToHsb(rgb)
  return {
    rgb,
    hsb,
    a,
    hexDraft: formatHex(rgb, a, true).slice(1),
  }
}

function emitHex(rgb: Rgb, a: number, withAlpha: boolean): string {
  return formatHex(rgb, a, withAlpha)
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

async function tryBrowserEyeDropper(): Promise<string | null> {
  const ED = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
  if (!ED) return null
  try {
    const result = await new ED().open()
    return result.sRGBHex
  } catch {
    return null
  }
}

/**
 * Photoshop-class floating color picker (SV square + hue, RGB/HSB, hex, recent).
 * No scrim; Esc cancels; Enter commits.
 */
export function ColorPicker({
  open,
  value,
  onChange,
  onClose,
  title = 'Color Picker',
  alpha = false,
  defaultPosition,
}: ColorPickerProps) {
  const initialRef = useRef(value)
  const [local, setLocal] = useState(() => fromValue(value))
  const [recent, setRecent] = useState<string[]>(() => loadRecentColors())
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const sampling = useSyncExternalStore(
    subscribeColorEyedropper,
    () => getColorEyedropperState().active,
    () => false,
  )

  // Sync from external value while open (e.g. eyedropper / recent).
  useEffect(() => {
    if (!open) return
    setLocal(fromValue(value))
  }, [value, open])

  useEffect(() => {
    if (!open) {
      endColorEyedropper()
      return
    }
    initialRef.current = value
    setLocal(fromValue(value))
    setRecent(loadRecentColors())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- snapshot only on open

  const publish = useCallback(
    (next: Local) => {
      setLocal(next)
      onChange(emitHex(next.rgb, next.a, alpha))
    },
    [alpha, onChange],
  )

  const setFromRgb = useCallback(
    (rgb: Rgb, a = local.a) => {
      const hsb = rgbToHsb(rgb)
      publish({
        rgb,
        hsb,
        a,
        hexDraft: formatHex(rgb, a, true).slice(1),
      })
    },
    [local.a, publish],
  )

  const setFromHsb = useCallback(
    (hsb: Hsb, a = local.a) => {
      const rgb = hsbToRgb(hsb)
      publish({
        rgb,
        hsb,
        a,
        hexDraft: formatHex(rgb, a, true).slice(1),
      })
    },
    [local.a, publish],
  )

  const resolveLocal = useCallback((): Local => {
    const raw = local.hexDraft.trim().replace(/^#/, '')
    if (
      /^[0-9a-fA-F]{3}$/.test(raw) ||
      /^[0-9a-fA-F]{6}$/.test(raw) ||
      /^[0-9a-fA-F]{8}$/.test(raw)
    ) {
      const parsed = parseColor(`#${raw}`)
      const rgb = parsed.rgb
      const a = alpha ? parsed.a : local.a
      return {
        rgb,
        hsb: rgbToHsb(rgb),
        a,
        hexDraft: formatHex(rgb, a, true).slice(1),
      }
    }
    return local
  }, [alpha, local])

  const commitAndClose = useCallback(() => {
    endColorEyedropper()
    const next = resolveLocal()
    const hex = emitHex(next.rgb, next.a, alpha)
    onChange(hex)
    setRecent(pushRecentColor(hex))
    onClose()
  }, [alpha, onChange, onClose, resolveLocal])

  const cancelAndClose = useCallback(() => {
    endColorEyedropper()
    if (value !== initialRef.current) {
      onChange(initialRef.current)
    }
    onClose()
  }, [onChange, onClose, value])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'TEXTAREA') return
        e.preventDefault()
        e.stopPropagation()
        commitAndClose()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelAndClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, commitAndClose, cancelAndClose])

  const pickSv = (clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    setFromHsb({
      h: local.hsb.h,
      s: x * 100,
      b: (1 - y) * 100,
    })
  }

  const pickHue = (clientY: number) => {
    const el = hueRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    setFromHsb({ ...local.hsb, h: t * 360 })
  }

  const onSvPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pickSv(e.clientX, e.clientY)
  }
  const onSvPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    pickSv(e.clientX, e.clientY)
  }

  const onHuePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pickHue(e.clientY)
  }
  const onHuePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    pickHue(e.clientY)
  }

  const onEyedropper = async () => {
    if (sampling) {
      endColorEyedropper()
      return
    }
    const browser = await tryBrowserEyeDropper()
    if (browser) {
      setFromRgb(parseColor(browser).rgb)
      return
    }
    // Canvas sample via ToolInputRouter (active raster layer).
    beginColorEyedropper((hex) => {
      setFromRgb(parseColor(hex).rgb)
      endColorEyedropper()
    })
  }

  const onHexBlurOrEnter = () => {
    const raw = local.hexDraft.trim().replace(/^#/, '')
    if (/^[0-9a-fA-F]{3}$/.test(raw) || /^[0-9a-fA-F]{6}$/.test(raw) || /^[0-9a-fA-F]{8}$/.test(raw)) {
      const parsed = parseColor(`#${raw}`)
      setFromRgb(parsed.rgb, alpha ? parsed.a : 1)
    } else {
      setLocal((s) => ({
        ...s,
        hexDraft: formatHex(s.rgb, s.a, true).slice(1),
      }))
    }
  }

  const previewCss = emitHex(local.rgb, local.a, true)
  const svX = (local.hsb.s / 100) * 100
  const svY = (1 - local.hsb.b / 100) * 100
  const hueY = (local.hsb.h / 360) * 100

  return (
    <FloatingWindow
      open={open}
      title={title}
      onClose={cancelAndClose}
      width={320}
      bare
      closeOnEscape={false}
      defaultPosition={defaultPosition}
      ariaLabel={title}
    >
      <div className={styles.root}>
        <div className={styles.stage}>
          <div
            ref={svRef}
            className={styles.sv}
            style={{ background: hueCss(local.hsb.h) }}
            onPointerDown={onSvPointerDown}
            onPointerMove={onSvPointerMove}
            role="presentation"
            aria-label="Saturation and brightness"
          >
            <div className={styles.svWhite} />
            <div className={styles.svBlack} />
            <div
              className={styles.svThumb}
              style={{ left: `${svX}%`, top: `${svY}%` }}
            />
          </div>
          <div
            ref={hueRef}
            className={styles.hue}
            onPointerDown={onHuePointerDown}
            onPointerMove={onHuePointerMove}
            role="slider"
            aria-label="Hue"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(local.hsb.h)}
          >
            <div className={styles.hueThumb} style={{ top: `${hueY}%` }} />
          </div>
          <div className={styles.side}>
            <div className={styles.previewRow}>
              <div className={styles.preview} title={previewCss}>
                <div
                  className={styles.previewFill}
                  style={{ background: previewCss }}
                />
              </div>
              <IconButton
                icon={Eyedropper}
                title={
                  sampling
                    ? 'Click canvas to sample…'
                    : 'Eyedropper (screen or canvas)'
                }
                size={16}
                active={sampling}
                className={[styles.eyedrop, sampling ? styles.eyedropActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => void onEyedropper()}
              />
            </div>
            <div className={styles.fields}>
              <NumericField
                label="H"
                value={local.hsb.h}
                min={0}
                max={360}
                onChange={(h) => setFromHsb({ ...local.hsb, h: clampHue(h) })}
              />
              <NumericField
                label="R"
                value={local.rgb.r}
                min={0}
                max={255}
                onChange={(r) =>
                  setFromRgb({ ...local.rgb, r: clampByte(r) })
                }
              />
              <NumericField
                label="S"
                value={local.hsb.s}
                min={0}
                max={100}
                onChange={(s) =>
                  setFromHsb({ ...local.hsb, s: clampPercent(s) })
                }
              />
              <NumericField
                label="G"
                value={local.rgb.g}
                min={0}
                max={255}
                onChange={(g) =>
                  setFromRgb({ ...local.rgb, g: clampByte(g) })
                }
              />
              <NumericField
                label="Br"
                value={local.hsb.b}
                min={0}
                max={100}
                onChange={(b) =>
                  setFromHsb({ ...local.hsb, b: clampPercent(b) })
                }
              />
              <NumericField
                label="B"
                value={local.rgb.b}
                min={0}
                max={255}
                onChange={(b) =>
                  setFromRgb({ ...local.rgb, b: clampByte(b) })
                }
              />
            </div>
            <div className={styles.hexRow}>
              <span className={styles.fieldLabel}>#</span>
              <input
                className={styles.fieldInput}
                type="text"
                spellCheck={false}
                value={local.hexDraft}
                aria-label="Hex color"
                onChange={(e) =>
                  setLocal((s) => ({ ...s, hexDraft: e.target.value }))
                }
                onBlur={onHexBlurOrEnter}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                    onHexBlurOrEnter()
                  }
                }}
              />
            </div>
            {alpha && (
              <div className={styles.alphaRow}>
                <span className={styles.fieldLabel}>A</span>
                <input
                  className={styles.alphaSlider}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(local.a * 100)}
                  aria-label="Opacity"
                  onChange={(e) => {
                    const a = Number(e.target.value) / 100
                    publish({
                      ...local,
                      a,
                      hexDraft: formatHex(local.rgb, a, true).slice(1),
                    })
                  }}
                />
                <input
                  className={styles.fieldInput}
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(local.a * 100)}
                  aria-label="Opacity percent"
                  onChange={(e) => {
                    const a = clampPercent(Number(e.target.value)) / 100
                    if (!Number.isFinite(a)) return
                    publish({
                      ...local,
                      a,
                      hexDraft: formatHex(local.rgb, a, true).slice(1),
                    })
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className={styles.recent}>
          <span className={styles.recentLabel}>Recent</span>
          <div className={styles.recentRow}>
            {recent.length === 0 && (
              <span className={styles.recentEmpty}>None yet</span>
            )}
            {recent.map((c) => (
              <button
                key={c}
                type="button"
                className={styles.recentChip}
                style={{ background: c }}
                title={c}
                aria-label={`Recent ${c}`}
                onClick={() => {
                  const parsed = parseColor(c)
                  setFromRgb(parsed.rgb, alpha ? parsed.a : 1)
                }}
              />
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <Button onClick={cancelAndClose}>Cancel</Button>
          <Button variant="primary" onClick={commitAndClose}>
            OK
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
