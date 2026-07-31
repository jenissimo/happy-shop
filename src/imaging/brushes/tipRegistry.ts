import { publicUrl } from '../../lib/publicUrl'
import { PROCEDURAL_TIPS } from './presets/proc'
import {
  BrushTipDescriptorSchema,
  type BrushTipDescriptor,
} from './tipDescriptor'
import { listUserTipDescriptors, loadUserTipAlpha } from './userTipStore'

export type TipAlpha = {
  data: Uint8ClampedArray
  width: number
  height: number
}

const CACHE_LIMIT = 32
const CACHE_BYTES_LIMIT = 32 * 1024 * 1024

const tips = new Map<string, BrushTipDescriptor>(
  PROCEDURAL_TIPS.map((tip) => [tip.id, tip]),
)
const alphaCache = new Map<string, TipAlpha>()
let alphaBytes = 0
let manifestLoad: Promise<void> | null = null

function touchAlpha(id: string, alpha: TipAlpha): TipAlpha {
  const old = alphaCache.get(id)
  if (old) {
    alphaCache.delete(id)
    alphaBytes -= old.data.byteLength
  }
  alphaCache.set(id, alpha)
  alphaBytes += alpha.data.byteLength
  while (
    alphaCache.size > CACHE_LIMIT ||
    (alphaBytes > CACHE_BYTES_LIMIT && alphaCache.size > 1)
  ) {
    const oldest = alphaCache.entries().next().value
    if (!oldest) break
    alphaCache.delete(oldest[0])
    alphaBytes -= oldest[1].data.byteLength
  }
  return alpha
}

function addManifest(entries: unknown): void {
  const parsed = BrushTipDescriptorSchema.array().safeParse(entries)
  if (!parsed.success) {
    console.warn('Ignoring invalid brush tip manifest', parsed.error)
    return
  }
  for (const tip of parsed.data) tips.set(tip.id, tip)
}

/** Load optional public packs once; a missing index keeps built-ins available. */
export async function loadTipRegistry(): Promise<void> {
  if (manifestLoad) return manifestLoad
  manifestLoad = (async () => {
    try {
      const indexResponse = await fetch(publicUrl('/brushes/index.json'))
      if (indexResponse.ok) {
        const packs: unknown = await indexResponse.json()
        const entries = Array.isArray(packs)
          ? packs
          : typeof packs === 'object' && packs !== null && 'packs' in packs
            ? (packs as { packs: unknown }).packs
            : []
        if (Array.isArray(entries)) {
          await Promise.all(
            entries
              .filter((pack): pack is string => typeof pack === 'string' && pack.length > 0)
              .map(async (pack) => {
                try {
                  const response = await fetch(publicUrl(`/brushes/${pack}/manifest.json`))
                  if (response.ok) addManifest(await response.json())
                } catch {
                  // Third-party packs are optional and must never break brush use.
                }
              }),
          )
        }
      }
    } catch {
      // Public packs are optional in offline shells.
    }
    try {
      addManifest(await listUserTipDescriptors())
    } catch {
      // IndexedDB may be disabled in a private browsing session.
    }
  })()
  return manifestLoad
}

export function listTips(): BrushTipDescriptor[] {
  return [...tips.values()]
}

export function getTip(id: string): BrushTipDescriptor | undefined {
  return tips.get(id)
}

/** Decode and cache the alpha channel of a stamp tip, LRU bounded by count/bytes. */
export async function loadTipAlpha(id: string): Promise<TipAlpha> {
  const cached = alphaCache.get(id)
  if (cached) return touchAlpha(id, cached)
  const tip = tips.get(id)
  if (!tip?.texture) throw new Error(`Brush tip "${id}" has no texture`)
  if (tip.pack === 'user') {
    const alpha = await loadUserTipAlpha(id)
    if (!alpha) throw new Error(`Imported brush tip "${id}" is unavailable`)
    return touchAlpha(id, alpha)
  }
  const response = await fetch(publicUrl(tip.texture.src))
  if (!response.ok) throw new Error(`Could not load brush tip "${id}"`)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('2d canvas unavailable')
    context.drawImage(bitmap, 0, 0)
    const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const data = new Uint8ClampedArray(bitmap.width * bitmap.height)
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) data[j] = rgba[i + 3]!
    return touchAlpha(id, { data, width: bitmap.width, height: bitmap.height })
  } finally {
    bitmap.close()
  }
}

/** Test/support hook for pack installation flows. */
export function registerTipDescriptors(descriptors: unknown): void {
  addManifest(descriptors)
}
