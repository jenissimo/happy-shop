import {
  asRasterAssetRef,
  createAssetId,
  createEmptyDocument,
  createRasterLayer,
  MAX_CANVAS_SIDE,
  SOFT_MEGAPIXEL_LIMIT,
  type HappyDocument,
} from '../../../core/document'
import {
  getImagingClient,
  probeClipboardImageSize,
  registerRasterSurface,
  type RasterSurfaceEntry,
} from '../../../imaging'

const SUPPORTED_IMAGE_MIME = 'image/png,image/jpeg,image/webp'

export type NewDocumentResult = {
  document: HappyDocument
  /** Newly decoded raster assets the integrator should register with its
   * own renderer-facing surface store (e.g. `editor/session/RasterSurfaceStore`)
   * before/while displaying `document` — see module docstring below. */
  assets: RasterSurfaceEntry[]
}

/**
 * Opens a native file picker restricted to PNG/JPEG/WebP, decodes the
 * selection off the main thread (`ImagingClient` -> imaging worker), and
 * builds a single-layer `HappyDocument` sized to the decoded image (SPEC
 * §14 "Import: PNG, JPEG, WebP через createImageBitmap в worker").
 *
 * Resolves to `null` if the user cancels the picker.
 *
 * Wiring note: this only returns data — it does not touch any session
 * store. Callers (see `commands.ts`) are expected to hand the result to
 * their document/session store and to register `assets` with the render
 * layer's raster surface store.
 */
export async function openImageFile(): Promise<NewDocumentResult | null> {
  const file = await pickImageFile()
  if (!file) return null
  return createDocumentFromImageBlob(file, stripExtension(file.name))
}

/**
 * Skips the New Document dialog entirely and builds a document straight
 * from the current clipboard image, per UX-PHOTOSHOP.md ("New from
 * Clipboard skips dialog when image present"). Resolves to `null` when the
 * clipboard has no supported image (caller should fall back to opening the
 * regular dialog).
 */
export async function createDocumentFromClipboard(): Promise<NewDocumentResult | null> {
  const probe = await probeClipboardImageSize()
  if (probe.status !== 'found') return null
  return createDocumentFromImageBlob(probe.probe.blob, 'Clipboard Image')
}

async function createDocumentFromImageBlob(
  blob: Blob,
  suggestedName: string,
): Promise<NewDocumentResult> {
  const client = getImagingClient()
  const decoded = await client.decode(blob, {
    maxSide: MAX_CANVAS_SIDE,
    softMegapixelLimit: SOFT_MEGAPIXEL_LIMIT,
  })

  const assetId = createAssetId()
  const entry: RasterSurfaceEntry = {
    assetId,
    width: decoded.width,
    height: decoded.height,
    bitmap: decoded.bitmap,
    sourceBlob: blob,
  }
  registerRasterSurface(entry)

  const name = suggestedName.trim() || 'Untitled'
  const blank = createEmptyDocument({
    name,
    width: decoded.width,
    height: decoded.height,
    background: 'transparent',
  })
  const layer = createRasterLayer({ name, pixels: asRasterAssetRef(assetId) })
  const doc = {
    ...blank,
    rootChildren: [layer.id],
    layers: { [layer.id]: layer },
  }

  return { document: doc, assets: [entry] }
}

function stripExtension(fileName: string): string {
  const withoutPath = fileName.split(/[/\\]/).pop() ?? fileName
  const dot = withoutPath.lastIndexOf('.')
  return dot > 0 ? withoutPath.slice(0, dot) : withoutPath
}

/** Resolves with the chosen file, or `null` if the user dismissed the picker. */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = SUPPORTED_IMAGE_MIME
    input.style.position = 'fixed'
    input.style.top = '-1000px'
    input.style.left = '-1000px'

    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
      resolve(file)
    }

    input.addEventListener('change', () => {
      finish(input.files?.[0] ?? null)
    })

    // There is no standard "file picker cancelled" event, so fall back to
    // the well-known focus-return heuristic: the browser refocuses the page
    // once the native dialog closes, and `change` fires first when a file
    // was actually chosen.
    function onWindowFocus() {
      window.setTimeout(() => finish(null), 300)
    }
    window.addEventListener('focus', onWindowFocus)

    document.body.appendChild(input)
    input.click()
  })
}
