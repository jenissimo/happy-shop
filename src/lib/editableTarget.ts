/**
 * Shared "is the user typing?" guard for global keyboard handling.
 *
 * Global shortcuts, arrow-key nudge and the browser-zoom interception all need
 * the same answer, and getting it from `event.target` alone is not enough:
 * a key event dispatched while focus sits in a shadow-DOM input reports the
 * host element as `target`. `composedPath()` (when available) sees through
 * that, and `document.activeElement` covers handlers that receive a synthetic
 * or retargeted event.
 */

function isEditableElement(node: EventTarget | null | undefined): boolean {
  if (!node || typeof node !== 'object') return false
  const el = node as HTMLElement
  if (typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  // Custom widgets that behave like a text field (combobox inputs, editors).
  return el.getAttribute?.('role') === 'textbox'
}

/** True when the keystroke belongs to a focused text field / editable region. */
export function isEditableEventTarget(event: Event): boolean {
  if (isEditableElement(event.target)) return true

  const path = event.composedPath?.()
  if (path) {
    for (const node of path) {
      if (isEditableElement(node)) return true
      // Stop at the document/window end of the path.
      if (node === globalThis.document?.body) break
    }
  }

  return isEditableElement(globalThis.document?.activeElement)
}
