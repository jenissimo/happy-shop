import { ColorSwatchButton } from '../../ui/base/ColorPicker'
import { useColorStore } from './colorStore'
import styles from './ColorSwatches.module.css'

/** Photoshop-style FG/BG chips under the tools strip (D default / X swap). */
export function ColorSwatches() {
  const foreground = useColorStore((s) => s.foreground)
  const background = useColorStore((s) => s.background)
  const setForeground = useColorStore((s) => s.setForeground)
  const setBackground = useColorStore((s) => s.setBackground)
  const swap = useColorStore((s) => s.swap)
  const resetDefaults = useColorStore((s) => s.resetDefaults)

  return (
    <div className={styles.wrap} aria-label="Foreground and background colors">
      <button
        type="button"
        className={styles.swap}
        title="Swap colors (X)"
        aria-label="Swap foreground and background"
        onClick={swap}
      />
      <button
        type="button"
        className={styles.defaults}
        title="Default colors (D)"
        aria-label="Reset to default colors"
        onClick={resetDefaults}
      />
      <div className={styles.bg} title="Background color">
        <ColorSwatchButton
          value={background}
          onChange={setBackground}
          size="chip"
          ariaLabel="Background color"
          pickerTitle="Background Color"
          className={styles.chipBtn}
        />
      </div>
      <div className={styles.fg} title="Foreground color">
        <ColorSwatchButton
          value={foreground}
          onChange={setForeground}
          size="chip"
          ariaLabel="Foreground color"
          pickerTitle="Foreground Color"
          className={styles.chipBtn}
        />
      </div>
    </div>
  )
}
