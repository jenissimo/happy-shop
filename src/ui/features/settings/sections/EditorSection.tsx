import {
  SettingsHeading,
  SettingsRow,
  SettingsSection,
} from '../SettingsRow'
import styles from './PlaceholderSection.module.css'

/** Placeholder — extend with font size, tab width, etc. */
export function EditorSection() {
  return (
    <SettingsSection>
      <SettingsHeading>Editor</SettingsHeading>
      <SettingsRow
        title="Coming soon"
        hint="Editor preferences (fonts, indentation, autosave) will land here."
      >
        <span className={styles.badge}>Placeholder</span>
      </SettingsRow>
    </SettingsSection>
  )
}
