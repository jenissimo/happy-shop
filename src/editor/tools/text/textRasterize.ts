import type { TextLayer } from '../../../core/document'
import type { LayerId } from '../../../core/document'
import { getCachedGoogleFont } from './googleFonts/fontCache'
import { registerCommittedGoogleFont } from './googleFonts/googleFontDownload'
import { normalizedTextRuns, resolveRunUnderline } from './textRuns'
import {
  justifyGapExtra,
  layoutCssFont,
  layoutCssRunFont,
  layoutTextLines,
  lineHeightPx,
  lineRunSegments,
  measureTextBoundsSync,
  pointTextAlignOffset,
  resolveRunBaselineShift,
  underlineMetrics,
  type MeasuredText,
} from './textLayout'

export type { MeasuredText }
export { measureTextBoundsSync, pointTextAlignOffset }

function cssFont(layer: TextLayer): string {
  return layoutCssFont(layer)
}

function cssRunFont(run: TextLayer['runs'][number]): string {
  return layoutCssRunFont(run)
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

function strokeUnderline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color: string,
  fontSize: number,
): void {
  const { offsetY, thickness } = underlineMetrics(fontSize)
  ctx.strokeStyle = color
  ctx.lineWidth = thickness
  ctx.beginPath()
  ctx.moveTo(x, y + offsetY)
  ctx.lineTo(x + width, y + offsetY)
  ctx.stroke()
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
  const lh = lineHeightPx(layer)
  const lines = layoutTextLines(ctx, layer)
  const runs = normalizedTextRuns(layer)
  const frameW = resolvedMeasured.width
  const hasStyledRuns = layer.runs !== undefined && layer.runs.length > 0
  const hasBaselineShift = (layer.baselineShift ?? 0) !== 0
    || (hasStyledRuns && layer.runs.some((run) => (run.baselineShift ?? 0) !== 0))

  lines.forEach((line, i) => {
    const y = i * lh
    const gapExtra =
      layer.align === 'justify' && layer.textMode === 'box'
        ? justifyGapExtra(line.text, line.width, frameW, line.paragraphEnd)
        : 0

    // Fast path: one fillText per line when styles are uniform.
    if (!hasStyledRuns && !hasBaselineShift && gapExtra === 0) {
      ctx.font = cssFont(layer)
      ctx.fillStyle = layer.color
      const metrics = ctx.measureText(line.text)
      let x = 0
      if (layer.align === 'center') x = (frameW - metrics.width) / 2
      if (layer.align === 'right') x = frameW - metrics.width
      ctx.fillText(line.text, x, y)
      if (layer.underline && line.text.length) {
        strokeUnderline(ctx, x, y, metrics.width, layer.color, layer.fontSize)
      }
      return
    }

    let x = 0
    if (layer.align === 'center') x = (frameW - line.width) / 2
    else if (layer.align === 'right') x = frameW - line.width

    let cursor = x
    let underlineStart: number | null = null
    let underlineWidth = 0
    let underlineColor = layer.color
    let underlineSize = layer.fontSize
    const flushUnderline = () => {
      if (underlineStart == null) return
      strokeUnderline(ctx, underlineStart, y, underlineWidth, underlineColor, underlineSize)
      underlineStart = null
      underlineWidth = 0
    }

    // Same segmentation the measure uses: whole same-style pieces keep their
    // kerning, and only tracking / justify gaps force per-glyph placement.
    const segments = lineRunSegments(runs, layer, line.text, line.start)
    segments.forEach((segment, segmentIndex) => {
      const run = segment.run
      ctx.font = run ? cssRunFont(run) : cssFont(layer)
      ctx.fillStyle = run?.color ?? layer.color
      const shift = run ? resolveRunBaselineShift(run, layer) : (layer.baselineShift ?? 0)
      const underlined = run ? resolveRunUnderline(run, layer) : layer.underline
      const isLastSegment = segmentIndex === segments.length - 1

      const beginUnderline = () => {
        if (underlineStart != null) return
        underlineStart = cursor
        underlineColor = run?.color ?? layer.color
        underlineSize = run?.fontSize ?? layer.fontSize
      }

      const perGlyph = segment.trackingPx !== 0 || gapExtra > 0
      if (!perGlyph) {
        const width = ctx.measureText(segment.text).width
        if (underlined) {
          beginUnderline()
          underlineWidth += width
        } else {
          flushUnderline()
        }
        ctx.fillText(segment.text, cursor, y - shift)
        cursor += width
        return
      }

      for (let index = 0; index < segment.text.length; index++) {
        const char = segment.text[index]!
        const charWidth = ctx.measureText(char).width
        if (underlined) {
          beginUnderline()
          underlineWidth += charWidth
        } else {
          flushUnderline()
        }
        ctx.fillText(char, cursor, y - shift)
        cursor += charWidth
        const isLineEnd = isLastSegment && index === segment.text.length - 1
        if (isLineEnd) continue
        let gap = segment.trackingPx
        if (gapExtra > 0 && char === ' ') gap += gapExtra
        if (underlined && underlineStart != null) underlineWidth += gap
        cursor += gap
      }
    })
    flushUnderline()
  })

  return createImageBitmap(canvas)
}
