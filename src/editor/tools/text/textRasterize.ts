import type { TextLayer } from '../../../core/document'
import type { LayerId } from '../../../core/document'
import { getCachedGoogleFont } from './googleFonts/fontCache'
import { registerCommittedGoogleFont } from './googleFonts/googleFontDownload'
import { normalizedTextRuns, resolveRunTracking, resolveRunUnderline } from './textRuns'

export type MeasuredText = {
  width: number
  height: number
  /** Local offset of the drawn glyphs relative to layer transform origin. */
  offsetX: number
  offsetY: number
}

function cssFont(layer: TextLayer): string {
  const style = layer.italic ? 'italic' : 'normal'
  const weight = Math.round(layer.fontWeight)
  return `${style} ${weight} ${layer.fontSize}px ${layer.fontFamily}`
}

function cssRunFont(run: TextLayer['runs'][number]): string {
  return `${run.italic ? 'italic' : 'normal'} ${Math.round(run.fontWeight)} ${run.fontSize}px ${run.fontFamily}`
}

export type FontResolution =
  | { ok: true }
  | {
    ok: false
    reason: 'offline-and-uncached' | 'cache-evicted' | 'network-error'
    catalogId: string
    family: string
    detail?: string
  }

export function googleFontUnavailableMessage(
  resolution: Extract<FontResolution, { ok: false }>,
): string {
  const family = resolution.family.split(',')[0]?.trim() || resolution.family
  if (resolution.reason === 'network-error') {
    return `"${family}" could not be fetched (${resolution.detail ?? 'network error'}). Check your connection and retry, or choose a different font for this layer.`
  }
  if (resolution.reason === 'cache-evicted') {
    return `"${family}" is no longer in the local Google Fonts cache. Connect to the internet to fetch it again, or choose a different font for this layer.`
  }
  return `"${family}" isn't available offline. Connect to the internet to fetch it, or choose a different font for this layer.`
}

export class GoogleFontUnavailableError extends Error {
  readonly resolution: Extract<FontResolution, { ok: false }>
  readonly layerId?: LayerId

  constructor(resolution: Extract<FontResolution, { ok: false }>, layerId?: LayerId) {
    super(googleFontUnavailableMessage(resolution))
    this.name = 'GoogleFontUnavailableError'
    this.resolution = resolution
    this.layerId = layerId
  }
}

/** Wait for the exact canvas face so fallback glyphs can never be baked. */
export async function ensureTextFontLoaded(layer: TextLayer): Promise<FontResolution> {
  if (layer.fontSource?.kind === 'google-fonts') {
    const source = layer.fontSource
    const cached = await getCachedGoogleFont({
      id: source.catalogId,
      weight: source.weight,
      style: source.style,
      version: source.version,
      variationPin: source.variationPin,
    })
    if (!cached) {
      return {
        ok: false,
        reason: typeof navigator !== 'undefined' && navigator.onLine ? 'cache-evicted' : 'offline-and-uncached',
        catalogId: source.catalogId,
        family: layer.fontFamily,
      }
    }
    await registerCommittedGoogleFont(cached)
    return { ok: true }
  }
  if (typeof document === 'undefined' || !document.fonts) return { ok: true }
  const font = cssFont(layer)
  await document.fonts.load(font)
  await document.fonts.ready
  for (const run of normalizedTextRuns(layer)) {
    if (cssRunFont(run) !== font) await document.fonts.load(cssRunFont(run))
  }
  return { ok: true }
}

async function requireBakeSafeFont(layer: TextLayer): Promise<void> {
  const resolution = await ensureTextFontLoaded(layer)
  if (!resolution.ok) throw new GoogleFontUnavailableError(resolution)
}

function runAtIndex(runs: TextLayer['runs'], index: number): TextLayer['runs'][number] | undefined {
  return runs.find((candidate) => index >= candidate.start && index < candidate.end)
}

function trackingBetween(
  runs: TextLayer['runs'],
  layer: TextLayer,
  leftIndex: number,
): number {
  const left = runAtIndex(runs, leftIndex)
  return left ? resolveRunTracking(left, layer) : layer.tracking
}

function lineHeight(layer: TextLayer): number {
  return layer.leading > 0 ? layer.leading : layer.fontSize * 1.2
}

function strokeUnderline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color: string,
  fontSize: number,
): void {
  const underlineY = y + fontSize + 1
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, fontSize / 16)
  ctx.beginPath()
  ctx.moveTo(x, underlineY)
  ctx.lineTo(x + width, underlineY)
  ctx.stroke()
}

/** Point-text transform is its insertion anchor, rather than its left edge. */
export function pointTextAlignOffset(
  align: TextLayer['align'],
  width: number,
): number {
  if (align === 'center') return -width / 2
  if (align === 'right') return -width
  return 0
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0) return text.split('\n')
  const paragraphs = text.split('\n')
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('')
      continue
    }
    const words = paragraph.split(/(\s+)/)
    let current = ''
    for (const word of words) {
      const next = current + word
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current)
        current = word.trimStart()
      } else {
        current = next
      }
    }
    lines.push(current)
  }
  return lines.length ? lines : ['']
}

function measureTextBoundsSync(layer: TextLayer): MeasuredText {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { width: 1, height: 1, offsetX: 0, offsetY: 0 }
  }
  ctx.font = cssFont(layer)
  const lh = lineHeight(layer)
  const content = layer.content.length > 0 ? layer.content : ' '

  if (layer.textMode === 'box' && layer.bounds.w > 0) {
    const lines = wrapLines(ctx, content, layer.bounds.w)
    const width = Math.max(1, Math.ceil(layer.bounds.w))
    const height = Math.max(
      1,
      Math.ceil(layer.bounds.h > 0 ? layer.bounds.h : lines.length * lh),
    )
    return { width, height, offsetX: 0, offsetY: 0 }
  }

  const lines = content.split('\n')
  let maxW = 0
  let absolute = 0
  const runs = normalizedTextRuns(layer)
  for (const line of lines) {
    let width = 0
    for (let i = 0; i < Math.max(1, line.length); i++) {
      const run = runAtIndex(runs, absolute + i)
      if (run) ctx.font = cssRunFont(run)
      width += ctx.measureText(line[i] ?? ' ').width
      if (i < line.length - 1) width += trackingBetween(runs, layer, absolute + i)
    }
    maxW = Math.max(maxW, width)
    absolute += line.length + 1
  }
  const width = Math.max(1, Math.ceil(maxW))
  const height = Math.max(1, Math.ceil(lines.length * lh))
  return {
    width,
    height,
    offsetX: pointTextAlignOffset(layer.align, width),
    offsetY: 0,
  }
}

export async function measureTextBounds(layer: TextLayer): Promise<MeasuredText> {
  await requireBakeSafeFont(layer)
  return measureTextBoundsSync(layer)
}

export async function rasterizeTextLayerToBitmap(
  layer: TextLayer,
  measured?: MeasuredText,
): Promise<ImageBitmap> {
  await requireBakeSafeFont(layer)
  const resolvedMeasured = measured ?? measureTextBoundsSync(layer)
  const canvas = document.createElement('canvas')
  canvas.width = resolvedMeasured.width
  canvas.height = resolvedMeasured.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2d context unavailable for text rasterize')
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = cssFont(layer)
  ctx.fillStyle = layer.color
  ctx.textBaseline = 'top'
  const lh = lineHeight(layer)
  const content = layer.content.length > 0 ? layer.content : ''
  const maxWidth =
    layer.textMode === 'box' && layer.bounds.w > 0 ? layer.bounds.w : 0
  const lines = maxWidth > 0 ? wrapLines(ctx, content, maxWidth) : content.split('\n')

  let absolute = 0
  const runs = normalizedTextRuns(layer)
  const hasRichRuns = layer.runs !== undefined
  lines.forEach((line, i) => {
    let x = 0
    if (!hasRichRuns) {
      const metrics = ctx.measureText(line)
      if (layer.align === 'center') x = (resolvedMeasured.width - metrics.width) / 2
      if (layer.align === 'right') x = resolvedMeasured.width - metrics.width
      ctx.fillText(line, x, i * lh)
      if (layer.underline && line.length) {
        const y = i * lh + layer.fontSize + 1
        ctx.strokeStyle = layer.color
        ctx.lineWidth = Math.max(1, layer.fontSize / 16)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + metrics.width, y)
        ctx.stroke()
      }
      absolute += line.length + 1
      return
    }
    let width = 0
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const run = runAtIndex(runs, absolute + charIndex)
      if (run) ctx.font = cssRunFont(run)
      width += ctx.measureText(line[charIndex]!).width
      if (charIndex < line.length - 1) {
        width += trackingBetween(runs, layer, absolute + charIndex)
      }
    }
    if (layer.align === 'center') x = (resolvedMeasured.width - width) / 2
    if (layer.align === 'right') x = resolvedMeasured.width - width
    let cursor = x
    let underlineStart: number | null = null
    let underlineWidth = 0
    let underlineColor = layer.color
    let underlineSize = layer.fontSize
    const flushUnderline = () => {
      if (underlineStart == null) return
      strokeUnderline(ctx, underlineStart, i * lh, underlineWidth, underlineColor, underlineSize)
      underlineStart = null
      underlineWidth = 0
    }
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const run = runAtIndex(runs, absolute + charIndex)
      if (run) {
        ctx.font = cssRunFont(run)
        ctx.fillStyle = run.color
      }
      const char = line[charIndex]!
      const underlined = run ? resolveRunUnderline(run, layer) : layer.underline
      const charWidth = ctx.measureText(char).width
      if (underlined) {
        if (underlineStart == null) {
          underlineStart = cursor
          underlineColor = run?.color ?? layer.color
          underlineSize = run?.fontSize ?? layer.fontSize
        }
        underlineWidth += charWidth
      } else {
        flushUnderline()
      }
      ctx.fillText(char, cursor, i * lh)
      cursor += charWidth
      if (charIndex < line.length - 1) {
        const gap = trackingBetween(runs, layer, absolute + charIndex)
        if (underlined && underlineStart != null) underlineWidth += gap
        cursor += gap
      }
    }
    flushUnderline()
    absolute += line.length + 1
  })

  return createImageBitmap(canvas)
}
