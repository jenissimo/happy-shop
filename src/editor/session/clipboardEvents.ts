import { isEditableEventTarget } from '../../lib/editableTarget'
import {
  copySelection,
  cutSelection,
  getHappyClipboard,
  pasteClipboard,
  pasteClipboardInPlace,
  setHappyClipboard,
} from './editClipboard'

/**
 * Native `copy`/`cut`/`paste` bridge.
 *
 * The command registry already owns Mod+C/X/V for the menus, but driving the
 * keyboard through it alone has two problems:
 *
 *  - Paste has to go through `navigator.clipboard.read()`, which is
 *    permission-gated and silently returns nothing when the user declines.
 *    A real `ClipboardEvent` carries the data directly, no permission needed.
 *  - A shortcut handler cannot tell "the user wants to paste into the canvas"
 *    from "the user wants to paste into a text field"; the browser can, and it
 *    targets the ClipboardEvent at whatever is focused.
 *
 * So: while focus is inside a text field we do nothing at all and the browser
 * performs its normal edit. Otherwise the canvas claims the event.
 */

const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif|bmp)$/i

function imageBlobFromClipboardEvent(event: ClipboardEvent): Blob | null {
  const data = event.clipboardData
  if (!data) return null

  for (const file of Array.from(data.files ?? [])) {
    if (IMAGE_MIME.test(file.type)) return file
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && IMAGE_MIME.test(item.type)) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

async function decodeSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close?.()
    return size
  } catch {
    return null
  }
}

/**
 * Decides between the payload we copied ourselves (which knows its document
 * origin, so Paste in Place works) and an image that arrived from another
 * application. Same-size images are treated as our own round-trip through the
 * OS clipboard; anything else replaces it.
 */
async function pasteFromEvent(event: ClipboardEvent): Promise<boolean> {
  const external = imageBlobFromClipboardEvent(event)
  const internal = getHappyClipboard()

  if (!external) {
    return pasteClipboard()
  }

  const size = await decodeSize(external)
  if (!size) return pasteClipboard()

  if (internal && internal.width === size.width && internal.height === size.height) {
    return pasteClipboardInPlace()
  }

  setHappyClipboard({
    blob: external,
    width: size.width,
    height: size.height,
    mimeType: external.type || 'image/png',
    originX: 0,
    originY: 0,
  })
  return pasteClipboard()
}

/** Installs the listeners; returns a disposer. */
export function installClipboardEventBridge(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onCopy = (event: ClipboardEvent) => {
    if (event.defaultPrevented || isEditableEventTarget(event)) return
    event.preventDefault()
    void copySelection()
  }

  const onCut = (event: ClipboardEvent) => {
    if (event.defaultPrevented || isEditableEventTarget(event)) return
    event.preventDefault()
    void cutSelection()
  }

  const onPaste = (event: ClipboardEvent) => {
    if (event.defaultPrevented || isEditableEventTarget(event)) return
    event.preventDefault()
    void pasteFromEvent(event)
  }

  target.addEventListener('copy', onCopy as EventListener)
  target.addEventListener('cut', onCut as EventListener)
  target.addEventListener('paste', onPaste as EventListener)
  return () => {
    target.removeEventListener('copy', onCopy as EventListener)
    target.removeEventListener('cut', onCut as EventListener)
    target.removeEventListener('paste', onPaste as EventListener)
  }
}

/**
 * True for the keystrokes the browser will turn into a ClipboardEvent, so the
 * shortcut dispatcher can stand aside and let `installClipboardEventBridge`
 * handle them (menus still go through the commands).
 */
export function isNativeClipboardShortcut(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey
  if (!mod || e.altKey) return false
  const key = e.key.toLowerCase()
  // Mod+Shift+C / Mod+Shift+V are Copy Merged / Paste in Place — ours, not the
  // browser's; the OS only emits ClipboardEvents for the unshifted forms.
  if (e.shiftKey) return false
  return key === 'c' || key === 'x' || key === 'v'
}
