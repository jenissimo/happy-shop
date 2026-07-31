import { useState } from 'react'
import {
  readPixelatedPreviewPref,
} from '../prefs'
import { useViewPreferencesStore } from '../../../../editor/viewport/viewPreferencesStore'
import {
  SettingsHeading,
  SettingsRow,
  SettingsSection,
} from '../SettingsRow'
import styles from './PlaceholderSection.module.css'

/**
 * Viewport defaults. `pixelatedPreview` is persisted as a stub — the host
 * reads it on mount; live toggle without remount can land later.
 */
export function ViewportSection() {
  const [pixelated, setPixelated] = useState(readPixelatedPreviewPref)

  return (
    <SettingsSection>
      <SettingsHeading>Viewport</SettingsHeading>
      <SettingsRow
        title="Pixelated preview"
        hint="Nearest-neighbor sampling (crisp pixels). Off by default for smooth preview on non-integer zoom and rotated layers. Remount the viewport to apply."
      >
        <label className={styles.badge}>
          <input
            type="checkbox"
            checked={pixelated}
            onChange={(event) => {
              const next = event.target.checked
              setPixelated(next)
              useViewPreferencesStore.getState().setPixelatedPreview(next)
            }}
          />{' '}
          {pixelated ? 'On' : 'Off'}
        </label>
      </SettingsRow>
    </SettingsSection>
  )
}
