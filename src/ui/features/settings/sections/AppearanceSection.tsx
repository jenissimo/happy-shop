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
          const { preview: p } = t
          return (
            <button
              key={t.id}
              type="button"
              className={`${styles.card}${selected ? ` ${styles.cardSelected}` : ''}${p.glass ? ` ${styles.cardGlass}` : ''}`}
              role="radio"
              aria-checked={selected}
              title={t.description}
              onClick={() => setTheme(t.id)}
            >
              <span
                className={styles.mock}
                style={{ background: p.bg }}
                aria-hidden
              >
                <span
                  className={styles.mockTitle}
                  style={{
                    background: p.raised,
                    borderBottomColor: p.accent,
                  }}
                />
                <span className={styles.mockBody}>
                  <span
                    className={styles.mockTools}
                    style={{
                      background: p.raised,
                      borderRightColor: p.accent,
                    }}
                  />
                  <span className={styles.mockViewport}>
                    <span
                      className={styles.mockDoc}
                      style={{
                        backgroundImage: `linear-gradient(45deg, ${p.checkerA} 25%, ${p.checkerB} 25%, ${p.checkerB} 50%, ${p.checkerA} 50%, ${p.checkerA} 75%, ${p.checkerB} 75%)`,
                        backgroundSize: '8px 8px',
                      }}
                    />
                  </span>
                  <span
                    className={styles.mockPanel}
                    style={{ background: p.panel }}
                  >
                    <span
                      className={styles.mockAccent}
                      style={{ background: p.accent }}
                    />
                  </span>
                </span>
                {p.glass ? <span className={styles.glassBadge}>Glass</span> : null}
              </span>
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
