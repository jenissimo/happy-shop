import { useEffect, useState } from 'react'
import {
  persistBrushCursorModePref,
  persistToolsStripLayoutPref,
  readBrushCursorModePref,
  readToolsStripLayoutPref,
  TOOLS_STRIP_LAYOUT_CHANGED_EVENT,
  type BrushCursorMode,
  type ToolsStripLayout,
} from '../prefs'
import {
  SettingsHeading,
  SettingsRow,
  SettingsSection,
} from '../SettingsRow'
import styles from './PlaceholderSection.module.css'

/** Tool affordances that affect canvas interaction. */
export function ToolsSection() {
  const [brushCursorMode, setBrushCursorMode] = useState(readBrushCursorModePref)
  const [stripLayout, setStripLayout] = useState(readToolsStripLayoutPref)

  useEffect(() => {
    const sync = () => setStripLayout(readToolsStripLayoutPref())
    window.addEventListener(TOOLS_STRIP_LAYOUT_CHANGED_EVENT, sync)
    return () => window.removeEventListener(TOOLS_STRIP_LAYOUT_CHANGED_EVENT, sync)
  }, [])

  const chooseMode = (mode: BrushCursorMode) => {
    setBrushCursorMode(mode)
    persistBrushCursorModePref(mode)
  }

  const chooseStripLayout = (layout: ToolsStripLayout) => {
    setStripLayout(layout)
    persistToolsStripLayoutPref(layout)
  }

  return (
    <SettingsSection>
      <SettingsHeading>Tools</SettingsHeading>
      <SettingsRow
        title="Tool strip columns"
        hint="Two columns matches classic Photoshop muscle memory. Drag or double-click the tools strip’s right edge to switch; single column saves horizontal space."
      >
        <fieldset className={styles.badge} aria-label="Tool strip columns">
          <label>
            <input
              type="radio"
              name="tools-strip-layout"
              checked={stripLayout === 'double'}
              onChange={() => chooseStripLayout('double')}
            />{' '}
            Two columns
          </label>{' '}
          <label>
            <input
              type="radio"
              name="tools-strip-layout"
              checked={stripLayout === 'single'}
              onChange={() => chooseStripLayout('single')}
            />{' '}
            Single column
          </label>
        </fieldset>
      </SettingsRow>
      <SettingsRow
        title="Brush cursor"
        hint="Normal shows the brush tip ring. Precise uses a crosshair. Caps Lock temporarily enables Precise when supported."
      >
        <fieldset className={styles.badge} aria-label="Brush cursor">
          <label>
            <input
              type="radio"
              name="brush-cursor-mode"
              checked={brushCursorMode === 'normal'}
              onChange={() => chooseMode('normal')}
            />{' '}
            Normal (ring)
          </label>{' '}
          <label>
            <input
              type="radio"
              name="brush-cursor-mode"
              checked={brushCursorMode === 'precise'}
              onChange={() => chooseMode('precise')}
            />{' '}
            Precise (crosshair)
          </label>
        </fieldset>
      </SettingsRow>
    </SettingsSection>
  )
}
