/**
 * HTML <-> `TextLayer` bridging for the contenteditable text editor. The markup
 * mirrors the rich-text spans `PixiRenderBackend` feeds to HTMLText, so what the
 * caret sits on is what the committed layer draws.
 */

import type { TextLayer } from '../../../core/document'
import { cssQuoteFontFamily } from './cssQuoteFontFamily'
import {
  resolveRunBaselineShift,
  trackingToLetterSpacingPx,
  underlineMetrics,
} from './textLayout'
import {
  normalizedTextRuns,
  resolveRunTracking,
  resolveRunUnderline,
} from './textRuns'

/** Minimal shape of the editable host, so tests need no live DOM. */
export type EditorElement = {
  innerText: string
  querySelectorAll(selectors: string): ArrayLike<EditorSpan>
}

export type EditorSpan = {
  innerText: string
  dataset: Record<string, string | undefined>
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

export function runsMarkup(layer: TextLayer): string {
  return normalizedTextRuns(layer).map((run) => {
    const underline = resolveRunUnderline(run, layer)
    const tracking = resolveRunTracking(run, layer)
    const baselineShift = resolveRunBaselineShift(run, layer)
    const letterSpacing = trackingToLetterSpacingPx(tracking, run.fontSize)
    const metrics = underlineMetrics(run.fontSize)
    const underlineCss = underline
      ? `text-decoration:underline;text-underline-offset:${metrics.offsetY - run.fontSize}px;text-decoration-thickness:${metrics.thickness}px`
      : ''
    const style = [
      `font-family:${cssQuoteFontFamily(run.fontFamily)}`,
      `font-size:${run.fontSize}px`,
      `font-weight:${run.fontWeight}`,
      `font-style:${run.italic ? 'italic' : 'normal'}`,
      `color:${run.color}`,
      underlineCss,
      letterSpacing ? `letter-spacing:${letterSpacing}px` : '',
      baselineShift ? `position:relative;top:${-baselineShift}px` : '',
    ].filter(Boolean).join(';')
    return `<span data-font-family="${escapeHtml(run.fontFamily)}" data-font-size="${run.fontSize}" data-font-weight="${run.fontWeight}" data-italic="${run.italic}" data-color="${run.color}" data-underline="${underline}" data-tracking="${tracking}" data-baseline-shift="${baselineShift}" style="${escapeHtml(style)}">${escapeHtml(layer.content.slice(run.start, run.end)).replace(/\n/g, '<br>')}</span>`
  }).join('')
}

export function parseEditorRuns(
  element: EditorElement,
  layer: TextLayer,
): { content: string; runs: TextLayer['runs'] } {
  const content = element.innerText.replace(/\r/g, '')
  const runs: TextLayer['runs'] = []
  let offset = 0
  for (const span of Array.from(element.querySelectorAll('span[data-font-family]'))) {
    const text = span.innerText.replace(/\r/g, '')
    if (!text) continue
    const underline = span.dataset.underline === 'true'
    const tracking = Number(span.dataset.tracking) || 0
    const baselineShift = Number(span.dataset.baselineShift) || 0
    runs.push({
      start: offset,
      end: offset + text.length,
      fontFamily: span.dataset.fontFamily || layer.fontFamily,
      fontSize: Number(span.dataset.fontSize) || layer.fontSize,
      fontWeight: Number(span.dataset.fontWeight) || layer.fontWeight,
      italic: span.dataset.italic === 'true',
      color: (span.dataset.color || layer.color) as TextLayer['color'],
      ...(underline !== layer.underline ? { underline } : {}),
      ...(tracking !== layer.tracking ? { tracking } : {}),
      ...(baselineShift !== (layer.baselineShift ?? 0) ? { baselineShift } : {}),
    })
    offset += text.length
  }

  if (!content.length) return { content, runs: [] }
  const covered = runs.at(-1)?.end ?? 0
  if (covered >= content.length) return { content, runs }
  // Plain typing leaves text outside every styled span (a fresh layer has no
  // spans at all). Stretch the trailing run over it: a run list that stops
  // short of the content makes renderers drop the tail glyphs.
  const trailing = runs.pop() ?? normalizedTextRuns(layer)[0] ?? {
    start: 0,
    end: 0,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    italic: layer.italic,
    color: layer.color,
  }
  runs.push({ ...trailing, end: content.length })
  return { content, runs }
}
