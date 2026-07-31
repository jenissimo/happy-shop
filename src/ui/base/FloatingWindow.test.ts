import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('FloatingWindow contract', () => {
  test('is non-modal (no scrim class / aria-modal false in source)', () => {
    const src = readFileSync(join(import.meta.dirname, 'FloatingWindow.tsx'), 'utf8')
    expect(src).toContain('aria-modal="false"')
    expect(src).not.toContain('backdrop')
    expect(src).toContain('data-floating-window')
  })

  test('portals to body and captures pointer on the title bar', () => {
    const src = readFileSync(join(import.meta.dirname, 'FloatingWindow.tsx'), 'utf8')
    expect(src).toContain('createPortal')
    expect(src).toContain('document.body')
    expect(src).toContain('e.currentTarget.setPointerCapture')
    expect(src).not.toContain('el.setPointerCapture')
  })

  test('migrated windows no longer use overlay backdrops', () => {
    const files = [
      '../features/layer-style/LayerStyleDialog.tsx',
      '../features/new-document/NewDocumentDialog.tsx',
      '../features/canvas-size/CanvasSizeDialog.tsx',
      '../features/AboutWindow.tsx',
      '../features/settings/SettingsWindow.tsx',
      '../features/KeyboardShortcutsWindow.tsx',
    ]
    for (const rel of files) {
      const src = readFileSync(join(import.meta.dirname, rel), 'utf8')
      expect(src).toContain('FloatingWindow')
      expect(src).not.toContain('styles.backdrop')
    }
  })
})
