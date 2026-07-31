import type { TextLayer } from '../../../core/document'
import {
  applyTextOptionsToSelected,
  cancelTextEditSession,
  finishTextEditSession,
} from './textCommands'

type TextShortcutEvent = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
> & {
  preventDefault(): void
  stopPropagation(): void
}

function consume(event: TextShortcutEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Handles text-edit-only shortcuts before they reach document shortcuts.
 * Character styles (including underline) honor a non-collapsed DOM selection.
 */
export function handleTextEditShortcut(
  event: TextShortcutEvent,
  layer: TextLayer,
): boolean {
  const mod = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()
  if (event.key === 'Escape') {
    consume(event)
    cancelTextEditSession()
    return true
  }
  if (mod && !event.altKey) {
    const patch =
      key === 'b'
        ? { fontWeight: layer.fontWeight >= 700 ? 400 : 700 }
        : key === 'i'
          ? { italic: !layer.italic }
          : key === 'u'
            ? { underline: !layer.underline }
            : null
    if (patch) {
      consume(event)
      applyTextOptionsToSelected(patch)
      return true
    }
    if (event.shiftKey && (event.key === '<' || event.key === '>')) {
      consume(event)
      applyTextOptionsToSelected({
        fontSize: Math.max(
          1,
          Math.min(1024, layer.fontSize + (event.key === '>' ? 2 : -2)),
        ),
      })
      return true
    }
    if (event.shiftKey && ['l', 'c', 'r'].includes(key)) {
      consume(event)
      applyTextOptionsToSelected({
        align: key === 'l' ? 'left' : key === 'c' ? 'center' : 'right',
      })
      return true
    }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    if (layer.textMode === 'point' || mod) {
      consume(event)
      finishTextEditSession()
      return true
    }
  }
  return false
}
