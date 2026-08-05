/**
 * Marks the controls that drive a live text edit — options bar, Character /
 * Paragraph panels, the font picker. Clicking one blurs the contenteditable,
 * and blurring is what commits the session, so without this marker every trip
 * to the toolbar ends the edit (Photoshop keeps typing).
 */
export const TEXT_EDIT_CHROME_ATTR = 'data-text-edit-chrome'

export const textEditChromeProps = { [TEXT_EDIT_CHROME_ATTR]: '' } as const

export function isTextEditingChrome(element: Element | null | undefined): boolean {
  if (!element || typeof element.closest !== 'function') return false
  return element.closest(`[${TEXT_EDIT_CHROME_ATTR}]`) !== null
}
