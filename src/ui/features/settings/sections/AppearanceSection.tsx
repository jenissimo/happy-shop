import { Check } from '@phosphor-icons/react'
import { useTheme } from '../../../../editor/theme/ThemeProvider'
import { SettingsHeading, SettingsSection } from '../SettingsRow'
import styles from './AppearanceSection.module.css'

export function AppearanceSection() {
  const { theme, setTheme, themes } = useTheme()

  return (
    <SettingsSection>
      <SettingsHeading>Theme</SettingsHeading>
      <p className={styles.intro}>
        Color palette for the editor chrome. Saved automatically
        (<code>happy-shop.theme</code>).
      </p>
      <div className={styles.palette} role="radiogroup" aria-label="Theme">
        {themes.map((t) => {
          const selected = theme === t.id
          return (
            <button
              key={t.id}
              type="button"
              className={`${styles.card}${selected ? ` ${styles.cardSelected}` : ''}`}
              role="radio"
              aria-checked={selected}
              title={t.description}
              onClick={() => setTheme(t.id)}
            >
              <span
                className={styles.swatch}
                style={{
                  background: `linear-gradient(135deg, ${t.preview.bg} 40%, ${t.preview.panel} 40%, ${t.preview.panel} 70%, ${t.preview.accent} 70%)`,
                }}
                aria-hidden
              />
              <span className={styles.cardBody}>
                <span className={styles.cardLabel}>
                  {t.label}
                  {selected ? (
                    <Check size={14} weight="bold" className={styles.check} />
                  ) : null}
                </span>
                <span className={styles.cardDesc}>{t.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}
