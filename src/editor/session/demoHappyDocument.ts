import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
  type HappyDocument,
} from '../../core/document'
import { registerRasterSurface } from '../../imaging'

/**
 * M1 gate fixture (SPEC §20: "importированную фотографию можно ...
 * экспортировать"): a real `HappyDocument` with a couple of raster layers so
 * `ViewportHost`/Layers/Inspector all have something non-trivial to show
 * before the import pipeline (File > New / File > Open) is wired up.
 *
 * Pixels are solid-fill placeholders decoded through the same
 * `createImageBitmap` + `imaging/RasterSurfaceStore` path a real import would
 * use — never inline in the document itself (SPEC §6 rule 1).
 */
async function createPlaceholderBitmap(
  width: number,
  height: number,
  color: string,
): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  return createImageBitmap(canvas)
}

export async function createDemoHappyDocument(): Promise<HappyDocument> {
  let doc: HappyDocument = createEmptyDocument({
    name: 'Demo',
    width: 960,
    height: 540,
    background: 'transparent',
  })

  const backgroundRef = asRasterAssetRef(crypto.randomUUID())
  const backgroundBitmap = await createPlaceholderBitmap(960, 540, '#3d7eb5')
  registerRasterSurface({
    assetId: backgroundRef,
    width: 960,
    height: 540,
    bitmap: backgroundBitmap,
  })
  doc = addLayer(
    doc,
    createRasterLayer({ name: 'Background', pixels: backgroundRef }),
  )

  const panelRef = asRasterAssetRef(crypto.randomUUID())
  const panelBitmap = await createPlaceholderBitmap(420, 260, '#ffc83d')
  registerRasterSurface({
    assetId: panelRef,
    width: 420,
    height: 260,
    bitmap: panelBitmap,
  })
  doc = addLayer(
    doc,
    createRasterLayer({
      name: 'Panel',
      pixels: panelRef,
      opacity: 0.85,
      transform: { x: 160, y: 120, rotationDeg: -6 },
    }),
  )

  return doc
}
