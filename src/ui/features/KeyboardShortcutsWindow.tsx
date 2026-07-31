import { FloatingWindow } from '../base/FloatingWindow'
import { MODIFIER_GRAMMAR } from '../../editor/tools/modifierGrammar'
import styles from './KeyboardShortcutsWindow.module.css'

type ShortcutRow = { keys: string; action: string }

type ShortcutSection = { title: string; rows: ShortcutRow[] }

const SECTIONS: ShortcutSection[] = [
  {
    title: 'File',
    rows: [
      { keys: 'Mod+N', action: 'New…' },
      { keys: 'Mod+Shift+N', action: 'New from Clipboard' },
      { keys: 'Mod+O', action: 'Open…' },
      { keys: 'Mod+S', action: 'Save' },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { keys: 'Mod+Z', action: 'Undo' },
      { keys: 'Mod+Shift+Z', action: 'Redo' },
      { keys: 'Mod+Y', action: 'Redo (Win)' },
      { keys: 'Mod+X / C / V', action: 'Cut / Copy / Paste' },
      { keys: 'Mod+Shift+C', action: 'Copy Merged' },
      { keys: 'Mod+Shift+V', action: 'Paste in Place' },
      { keys: 'Alt+Backspace', action: 'Fill' },
      { keys: 'Delete', action: 'Clear' },
      { keys: 'Mod+T', action: 'Free Transform' },
      { keys: 'Mod+,', action: 'Settings' },
    ],
  },
  {
    title: 'Select',
    rows: [
      { keys: 'Mod+A', action: 'Select All' },
      { keys: 'Mod+D', action: 'Deselect' },
      { keys: 'Shift+D', action: 'Reselect' },
      { keys: 'Shift+I', action: 'Inverse' },
    ],
  },
  {
    title: 'Tools',
    rows: [
      { keys: 'V', action: 'Move' },
      { keys: 'M / Shift+M', action: 'Cycle Marquee variants forward / backward' },
      { keys: 'L / Shift+L', action: 'Cycle Lasso variants forward / backward' },
      { keys: 'W', action: 'Magic Wand' },
      { keys: 'C', action: 'Crop' },
      { keys: 'B / Shift+B', action: 'Cycle Brush / Pencil forward / backward' },
      { keys: 'J / Shift+J', action: 'Cycle Spot Healing / Healing Brush forward / backward' },
      { keys: 'R / Shift+R', action: 'Cycle Smudge / Blur / Sharpen forward / backward' },
      { keys: 'E / S', action: 'Eraser / Clone Stamp' },
      { keys: 'T', action: 'Type' },
      { keys: 'U', action: 'Shape' },
      { keys: 'H / Z', action: 'Hand / Zoom' },
      { keys: '[ ]', action: 'Active Brush / Eraser / retouch size' },
      { keys: 'Shift+[ ]', action: 'Brush / Eraser hardness' },
      { keys: 'D / X', action: 'Default / swap FG↔BG' },
      { keys: 'Space (hold)', action: 'Temporary Hand' },
    ],
  },
  {
    title: 'Modifiers',
    rows: MODIFIER_GRAMMAR.map((row) => ({
      keys: row.tool,
      action: `Shift: ${row.shift} · Alt: ${row.alt}`,
    })),
  },
  {
    title: 'Layer',
    rows: [
      { keys: 'Mod+G', action: 'Group Layers' },
      { keys: 'Mod+Shift+G', action: 'Ungroup Layers' },
    ],
  },
  {
    title: 'View',
    rows: [
      { keys: 'Mod+= / −', action: 'Zoom In / Out' },
      { keys: 'Mod+0', action: 'Fit on Screen' },
      { keys: 'Mod+1', action: 'Actual Pixels' },
      { keys: "Mod+'", action: 'Toggle Grid' },
      { keys: 'Mod+R', action: 'Toggle Rulers' },
      { keys: 'Mod+K', action: 'Command Palette' },
    ],
  },
  {
    title: 'Documents',
    rows: [
      { keys: 'Ctrl+PageUp / PageDown', action: 'Previous / next tab' },
    ],
  },
]

type Props = {
  open: boolean
  onClose: () => void
}

export function KeyboardShortcutsWindow({ open, onClose }: Props) {
  return (
    <FloatingWindow
      open={open}
      title="Keyboard Shortcuts"
      onClose={onClose}
      width={520}
      height={520}
      bare
    >
      <div className={styles.content}>
        <p className={styles.note}>
          Mod is Ctrl on Windows/Linux and ⌘ on macOS. Browser-reserved
          shortcuts (Mod+W / F / P, F5) are intentionally unbound.
        </p>
        <div className={styles.sections}>
          {SECTIONS.map((section) => (
            <section key={section.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <ul className={styles.rows}>
                {section.rows.map((row) => (
                  <li key={`${section.title}:${row.keys}`} className={styles.row}>
                    <kbd className={styles.keys}>{row.keys}</kbd>
                    <span className={styles.action}>{row.action}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </FloatingWindow>
  )
}
