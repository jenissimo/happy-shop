import { PixiRenderBackend } from '../../rendering/pixi/PixiRenderBackend'
import type { RenderBackend, RenderDocumentView } from '../../rendering/contracts'
import type { HappyDocument } from '../../core/document'
import { ensureTextFontLoaded, GoogleFontUnavailableError } from '../tools/text/textRasterize'

/**
 * Sync + render + `exportRegion` for the full document bounds.
 * Shared by UI PNG download and GPU export smoke (WS-HARDEN).
 */
export async function exportFlattenedRegion(
  backend: RenderBackend,
  view: RenderDocumentView,
): Promise<ImageBitmap> {
  backend.syncDocument(view)
  backend.render({
    camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    viewportWidth: view.width,
    viewportHeight: view.height,
    devicePixelRatio: 1,
  })
  return backend.exportRegion({
    x: 0,
    y: 0,
    width: view.width,
    height: view.height,
  })
}

/**
 * Flatten the current render view to a PNG via the same Pixi content layer
 * used by the viewport (SPEC §20 M1 gate: export matches compositor).
 * Spins up a short-lived offscreen backend so export does not depend on
 * ViewportHost being mounted.
 */
export async function exportFlattenedPng(
  view: RenderDocumentView,
  fileName = `${view.id || 'export'}.png`,
  sourceDocument?: HappyDocument,
): Promise<void> {
  if (sourceDocument) {
    for (const layer of Object.values(sourceDocument.layers)) {
      if (layer.type !== 'text' || !layer.fontSource) continue
      const resolution = await ensureTextFontLoaded(layer)
      if (!resolution.ok) throw new GoogleFontUnavailableError(resolution, layer.id)
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, view.width)
  canvas.height = Math.max(1, view.height)
  canvas.style.width = `${canvas.width}px`
  canvas.style.height = `${canvas.height}px`
  canvas.style.position = 'fixed'
  canvas.style.left = '-10000px'
  canvas.style.top = '0'
  document.body.appendChild(canvas)

  const backend = new PixiRenderBackend()
  try {
    await backend.init(canvas, {
      preference: 'webgl',
      antialias: false,
      backgroundAlpha: 0,
      powerPreference: 'high-performance',
    })
    const bitmap = await exportFlattenedRegion(backend, view)
    try {
      const blob = await imageBitmapToPngBlob(bitmap)
      downloadBlob(blob, ensurePngExtension(fileName))
    } finally {
      bitmap.close()
    }
  } finally {
    backend.destroy()
    canvas.remove()
  }
}

async function imageBitmapToPngBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable for PNG encode')
  ctx.drawImage(bitmap, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('PNG encode failed')
  return blob
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function ensurePngExtension(name: string): string {
  return /\.png$/i.test(name) ? name : `${name}.png`
}
