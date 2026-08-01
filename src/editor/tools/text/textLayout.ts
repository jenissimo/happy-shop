/**
 * Shared text layout helpers for measure/bake and convert.
 * Tracking is stored as Photoshop-style 1/1000 em; CSS/canvas use px.
 */

import type { TextAlign, TextLayer, TextRun } from '../../../core/document'
import { cssQuoteFontFamily } from './cssQuoteFontFamily'
import { normalizedTextRuns, resolveRunTracking } from './textRuns'

export type MeasuredText = {
  width: number
  height: number
  /** Local offset of the drawn glyphs relative to layer transform origin. */
  offsetX: number
  offsetY: number
}

export type LaidOutLine = {
  text: string
  /** Absolute content index of the first character on this line. */
  start: number
  width: number
  /** True when this line ends a hard `\n` paragraph (or is the final line). */
  paragraphEnd: boolean
}

const CONVERT_BOX_PAD_PX = 3

/** Convert stored 1/1000-em tracking to CSS/canvas letter-spacing in px. */
export function trackingToLetterSpacingPx(trackingEm: number, fontSize: number): number {
  return (trackingEm / 1000) * fontSize
}

/** Convert legacy document-px tracking to 1/1000 em. */
export function trackingPxToEm(trackingPx: number, fontSize: number): number {
  const size = Math.max(1, fontSize)
  return Math.round((trackingPx / size) * 1000)
}

export function lineHeightPx(layer: Pick<TextLayer, 'leading' | 'fontSize'>): number {
  return layer.leading > 0 ? layer.leading : layer.fontSize * 1.2
}

/** Point-text transform is its insertion anchor, rather than its left edge. */
export function pointTextAlignOffset(align: TextAlign, width: number): number {
  if (align === 'center') return -width / 2
  if (align === 'right') return -width
  // justify uses the same left origin as left for point text
  return 0
}

export function underlineMetrics(fontSize: number): { offsetY: number; thickness: number } {
  return {
    offsetY: fontSize + 1,
    thickness: Math.max(1, fontSize / 16),
  }
}

export function resolveRunBaselineShift(run: TextRun, layer: TextLayer): number {
  return run.baselineShift ?? layer.baselineShift ?? 0
}

export function layoutCssFont(layer: TextLayer): string {
  const style = layer.italic ? 'italic' : 'normal'
  const weight = Math.round(layer.fontWeight)
  return `${style} ${weight} ${layer.fontSize}px ${cssQuoteFontFamily(layer.fontFamily)}`
}

export function layoutCssRunFont(run: TextRun): string {
  return `${run.italic ? 'italic' : 'normal'} ${Math.round(run.fontWeight)} ${run.fontSize}px ${cssQuoteFontFamily(run.fontFamily)}`
}

export function layoutRunAtIndex(runs: TextRun[], index: number): TextRun | undefined {
  return runs.find((candidate) => index >= candidate.start && index < candidate.end)
}

export function layoutTrackingPxBetween(runs: TextRun[], layer: TextLayer, leftIndex: number): number {
  const left = layoutRunAtIndex(runs, leftIndex)
  if (!left) return trackingToLetterSpacingPx(layer.tracking, layer.fontSize)
  return trackingToLetterSpacingPx(resolveRunTracking(left, layer), left.fontSize)
}

function measureLineWidth(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  runs: TextRun[],
  line: string,
  absoluteStart: number,
): number {
  if (!line.length) return 0
  let width = 0
  for (let i = 0; i < line.length; i++) {
    const run = layoutRunAtIndex(runs, absoluteStart + i)
    ctx.font = run ? layoutCssRunFont(run) : layoutCssFont(layer)
    width += ctx.measureText(line[i]!).width
    if (i < line.length - 1) width += layoutTrackingPxBetween(runs, layer, absoluteStart + i)
  }
  return width
}

/**
 * Word-wrap within hard paragraphs. Soft-wrapped lines share the paragraph's
 * character stream (no synthetic newlines).
 */
export function layoutTextLines(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
): LaidOutLine[] {
  const content = layer.content.length > 0 ? layer.content : ' '
  const runs = normalizedTextRuns(layer)
  const maxWidth = layer.textMode === 'box' && layer.bounds.w > 0 ? layer.bounds.w : 0
  ctx.font = layoutCssFont(layer)

  const paragraphs = content.split('\n')
  const lines: LaidOutLine[] = []
  let absolute = 0

  for (let p = 0; p < paragraphs.length; p++) {
    const paragraph = paragraphs[p]!
    const isLastParagraph = p === paragraphs.length - 1

    if (maxWidth <= 0) {
      const width = measureLineWidth(ctx, layer, runs, paragraph.length ? paragraph : ' ', absolute)
      lines.push({
        text: paragraph,
        start: absolute,
        width,
        paragraphEnd: true,
      })
      absolute += paragraph.length + (isLastParagraph ? 0 : 1)
      continue
    }

    if (paragraph.length === 0) {
      lines.push({ text: '', start: absolute, width: 0, paragraphEnd: true })
      absolute += isLastParagraph ? 0 : 1
      continue
    }

    const words = paragraph.split(/(\s+)/)
    let current = ''
    let lineStart = absolute
    let consumed = 0
    for (const word of words) {
      const next = current + word
      if (current && measureLineWidth(ctx, layer, runs, next, lineStart) > maxWidth) {
        lines.push({
          text: current,
          start: lineStart,
          width: measureLineWidth(ctx, layer, runs, current, lineStart),
          paragraphEnd: false,
        })
        const trimmed = word.trimStart()
        const skipped = word.length - trimmed.length
        consumed += current.length + skipped
        current = trimmed
        lineStart = absolute + consumed
      } else {
        current = next
      }
    }
    lines.push({
      text: current,
      start: lineStart,
      width: measureLineWidth(ctx, layer, runs, current, lineStart),
      paragraphEnd: true,
    })
    absolute += paragraph.length + (isLastParagraph ? 0 : 1)
  }

  return lines.length ? lines : [{ text: '', start: 0, width: 0, paragraphEnd: true }]
}

/** Synchronous measure using Canvas2D (authoritative for bake/convert/handles). */
export function measureTextBoundsSync(layer: TextLayer): MeasuredText {
  if (typeof document === 'undefined') {
    return { width: 1, height: 1, offsetX: 0, offsetY: 0 }
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return { width: 1, height: 1, offsetX: 0, offsetY: 0 }

  const lh = lineHeightPx(layer)
  const lines = layoutTextLines(ctx, layer)
  const maxW = Math.max(1, ...lines.map((line) => Math.ceil(line.width)), 1)

  if (layer.textMode === 'box' && layer.bounds.w > 0) {
    const width = Math.max(1, Math.ceil(layer.bounds.w))
    const height = Math.max(
      1,
      Math.ceil(layer.bounds.h > 0 ? layer.bounds.h : lines.length * lh),
    )
    return { width, height, offsetX: 0, offsetY: 0 }
  }

  const width = Math.max(1, maxW)
  const height = Math.max(1, Math.ceil(lines.length * lh))
  return {
    width,
    height,
    offsetX: pointTextAlignOffset(layer.align, width),
    offsetY: 0,
  }
}

export function convertBoxPadPx(): number {
  return CONVERT_BOX_PAD_PX
}

/**
 * Extra space per whitespace gap for justify. Last line of a paragraph stays
 * left-aligned (Photoshop-like).
 */
export function justifyGapExtra(
  line: string,
  lineWidth: number,
  frameWidth: number,
  isLastLineOfParagraph: boolean,
): number {
  if (isLastLineOfParagraph || lineWidth >= frameWidth - 0.5) return 0
  const gaps = line.match(/ +/g)
  if (!gaps || gaps.length === 0) return 0
  return (frameWidth - lineWidth) / gaps.length
}
