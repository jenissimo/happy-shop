import { useState } from 'react'
import {
  persistGoogleFontsModePref,
  readGoogleFontsModePref,
  type GoogleFontsMode,
} from '../prefs'
import { SettingsHeading, SettingsRow, SettingsSection } from '../SettingsRow'
import styles from './PlaceholderSection.module.css'
import {
  clearCachedGoogleFonts,
  deleteCachedGoogleFont,
  listCachedGoogleFonts,
  type CachedFontRecord,
} from '../../../../editor/tools/text/googleFonts/fontCache'

export function TextSection() {
  const [mode, setMode] = useState(readGoogleFontsModePref)
  const [cached, setCached] = useState<CachedFontRecord[]>([])
  const [cacheManaged, setCacheManaged] = useState(false)
  const choose = (next: GoogleFontsMode) => {
    setMode(next)
    persistGoogleFontsModePref(next)
  }
  const refreshCache = () => {
    setCacheManaged(true)
    void listCachedGoogleFonts().then(setCached)
  }

  return (
    <SettingsSection>
      <SettingsHeading>Text</SettingsHeading>
      <SettingsRow
        title="Google Fonts"
        hint="Off keeps this app fully offline and never contacts Google. Browse only loads the bundled catalog. Live preview fetches visible font files from fonts.gstatic.com; adding a font explicitly caches its WOFF2 bytes for deterministic export. Open the font picker from the Type options bar or Window → Character and choose the Google Fonts tab (enable Browse here first)."
      >
        <fieldset className={styles.badge} aria-label="Google Fonts">
          <label>
            <input type="radio" name="google-fonts-mode" checked={mode === 'off'} onChange={() => choose('off')} /> Off
          </label>{' '}
          <label>
            <input type="radio" name="google-fonts-mode" checked={mode === 'browse'} onChange={() => choose('browse')} /> Browse only
          </label>
          {' '}
          <label>
            <input type="radio" name="google-fonts-mode" checked={mode === 'live-preview'} onChange={() => choose('live-preview')} /> Browse with live preview
          </label>
        </fieldset>
      </SettingsRow>
      <SettingsRow
        title="Downloaded fonts"
        hint="Downloaded fonts are cached only on this device. Clearing them frees space; documents using a cleared font will be blocked from baking until re-downloaded."
      >
        <div className={styles.badge}>
          <button type="button" onClick={refreshCache}>Manage downloaded fonts</button>
          {cacheManaged && cached.length === 0 && <p>No downloaded Google Fonts.</p>}
          {cached.length > 0 && (
            <>
              <p>{cached.length} face{cached.length === 1 ? '' : 's'} · {Math.ceil(cached.reduce((total, font) => total + font.byteLength, 0) / 1024)} KB of 80 MB</p>
              <ul className={styles.cacheList} aria-label="Downloaded Google Fonts">
                {cached.map((font) => (
                  <li key={`${font.id}-${font.weight}-${font.style}-${font.version}-${font.variationPin ?? 'static'}`}>
                    <span>{font.family} · {font.weight}{font.variationPin ? ' (variable pin)' : ''} {font.style} · {Math.ceil(font.byteLength / 1024)} KB</span>
                    <button type="button" onClick={() => void deleteCachedGoogleFont(font).then(refreshCache)}>Remove</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void clearCachedGoogleFonts().then(refreshCache)}>Clear all</button>
            </>
          )}
        </div>
      </SettingsRow>
    </SettingsSection>
  )
}
