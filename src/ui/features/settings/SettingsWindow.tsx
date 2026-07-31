import { useEffect, useState } from 'react'
import { FloatingWindow } from '../../base/FloatingWindow'
import {
  persistSettingsSection,
  readStoredSettingsSection,
} from './prefs'
import { listSettingsSections } from './registry'
import { registerDefaultSettingsSections } from './registerDefaultSections'
import styles from './SettingsWindow.module.css'

registerDefaultSettingsSections()

type Props = {
  open: boolean
  onClose: () => void
  /** Optional section to open (overrides stored preference once). */
  initialSection?: string
}

export function SettingsWindow({ open, onClose, initialSection }: Props) {
  const sections = listSettingsSections()
  const defaultId = sections[0]?.id ?? 'appearance'

  const [sectionId, setSectionId] = useState(() =>
    readStoredSettingsSection(
      defaultId,
      sections.map((s) => s.id),
    ),
  )

  useEffect(() => {
    if (!open) return
    const ids = sections.map((s) => s.id)
    if (initialSection && ids.includes(initialSection)) {
      setSectionId(initialSection)
      return
    }
    setSectionId(readStoredSettingsSection(defaultId, ids))
  }, [open, initialSection, defaultId])

  const active = sections.find((s) => s.id === sectionId) ?? sections[0]
  const ActiveBody = active?.Component

  const selectSection = (id: string) => {
    setSectionId(id)
    persistSettingsSection(id)
  }

  return (
    <FloatingWindow
      open={open}
      title="Settings"
      onClose={onClose}
      width={880}
      height={560}
      bare
    >
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Settings sections">
          <div className={styles.brand}>Sections</div>
          {sections.map((sec) => {
            const Icon = sec.icon
            const selected = active?.id === sec.id
            return (
              <button
                key={sec.id}
                type="button"
                className={`${styles.navItem}${selected ? ` ${styles.navItemActive}` : ''}`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => selectSection(sec.id)}
              >
                <Icon size={17} className={styles.navIcon} aria-hidden />
                <span>{sec.label}</span>
              </button>
            )
          })}
        </nav>

        <div className={styles.main}>
          <header className={styles.head}>
            <h2 className={styles.title}>{active?.label ?? 'Settings'}</h2>
          </header>
          <div className={styles.body}>{ActiveBody ? <ActiveBody /> : null}</div>
        </div>
      </div>
    </FloatingWindow>
  )
}
