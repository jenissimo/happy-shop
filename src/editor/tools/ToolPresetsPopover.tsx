import { useRef, useState } from 'react'
import { Popover } from '../../ui/base/Popover'
import {
  applyToolPreset,
  deleteToolPreset,
  saveToolPreset,
  useToolPresetStore,
} from './toolPresets'
import styles from './ToolPresetsPopover.module.css'

type Props = {
  layout?: 'bar' | 'menu'
}

/** Save/recall named brush + retouch tool snapshots from the options bar. */
export function ToolPresetsPopover({ layout = 'bar' }: Props) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const presets = useToolPresetStore((state) => state.presets)

  const savePreset = () => {
    const saved = saveToolPreset(presetName)
    if (!saved) return
    setPresetName('')
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={layout === 'bar' ? styles.barButton : styles.menuButton}
        title="Tool presets"
        aria-label="Tool presets"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Presets ▾
      </button>
      <Popover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        placement="below-start"
        width={240}
        maxHeight={320}
        ariaLabel="Tool presets"
      >
        <div className={styles.panel}>
          <div className={styles.saveRow}>
            <input
              aria-label="Tool preset name"
              placeholder="Preset name"
              value={presetName}
              maxLength={64}
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') savePreset()
              }}
            />
            <button type="button" onClick={savePreset} disabled={!presetName.trim()}>
              Save
            </button>
          </div>
          {presets.length === 0 ? (
            <p className={styles.empty}>
              Save brush and retouch settings to reuse them later.
            </p>
          ) : (
            <ul className={styles.list}>
              {presets.map((preset) => (
                <li key={preset.id} className={styles.row}>
                  <button
                    type="button"
                    className={styles.apply}
                    title={`Apply ${preset.name}`}
                    onClick={() => {
                      applyToolPreset(preset.id)
                      setOpen(false)
                    }}
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    className={styles.delete}
                    title={`Delete ${preset.name}`}
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => deleteToolPreset(preset.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
    </>
  )
}
