import type { TextLayer, TextRun } from '../../../core/document'

export type CharacterStylePatch = Partial<
  Pick<
    TextRun,
    | 'fontFamily'
    | 'fontSource'
    | 'fontSize'
    | 'fontWeight'
    | 'italic'
    | 'color'
    | 'underline'
    | 'tracking'
  >
>

export function resolveRunUnderline(run: TextRun, layer: TextLayer): boolean {
  return run.underline ?? layer.underline
}

export function resolveRunTracking(run: TextRun, layer: TextLayer): number {
  return run.tracking ?? layer.tracking
}

export function defaultTextRun(layer: TextLayer, start = 0, end = layer.content?.length ?? 0): TextRun {
  return {
    start,
    end,
    fontFamily: layer.fontFamily,
    fontSource: layer.fontSource,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    italic: layer.italic,
    color: layer.color,
  }
}

export function normalizedTextRuns(layer: TextLayer): TextRun[] {
  const content = layer.content ?? ''
  if (!content.length) return []
  const runs = layer.runs?.filter((run) => run.start < content.length && run.end > run.start) ?? []
  if (!runs.length) return [defaultTextRun(layer)]
  const normalized: TextRun[] = []
  let cursor = 0
  for (const run of runs) {
    const start = Math.max(cursor, run.start)
    const end = Math.min(layer.content.length, run.end)
    if (start > cursor) normalized.push(defaultTextRun(layer, cursor, start))
    if (end > start) normalized.push({ ...run, start, end })
    cursor = Math.max(cursor, end)
  }
  if (cursor < content.length) normalized.push(defaultTextRun(layer, cursor, content.length))
  return mergeAdjacentRuns(normalized, layer)
}

function sameStyle(a: TextRun, b: TextRun, layer: TextLayer): boolean {
  return a.fontFamily === b.fontFamily
    && a.fontSource?.catalogId === b.fontSource?.catalogId
    && a.fontSource?.weight === b.fontSource?.weight
    && a.fontSource?.style === b.fontSource?.style
    && a.fontSource?.version === b.fontSource?.version
    && a.fontSource?.variationPin === b.fontSource?.variationPin
    && a.fontSize === b.fontSize
    && a.fontWeight === b.fontWeight
    && a.italic === b.italic
    && a.color === b.color
    && resolveRunUnderline(a, layer) === resolveRunUnderline(b, layer)
    && resolveRunTracking(a, layer) === resolveRunTracking(b, layer)
}

export function mergeAdjacentRuns(runs: readonly TextRun[], layer: TextLayer): TextRun[] {
  const merged: TextRun[] = []
  for (const run of runs) {
    const previous = merged.at(-1)
    if (previous && previous.end === run.start && sameStyle(previous, run, layer)) {
      previous.end = run.end
    } else {
      merged.push({ ...run })
    }
  }
  return merged
}

export function styleTextRange(
  layer: TextLayer,
  start: number,
  end: number,
  patch: CharacterStylePatch,
): TextRun[] {
  const from = Math.max(0, Math.min(start, layer.content.length))
  const to = Math.max(from, Math.min(end, layer.content.length))
  if (from === to) return normalizedTextRuns(layer)
  const result: TextRun[] = []
  for (const run of normalizedTextRuns(layer)) {
    if (run.end <= from || run.start >= to) {
      result.push(run)
      continue
    }
    if (run.start < from) result.push({ ...run, end: from })
    result.push({
      ...run,
      ...patch,
      start: Math.max(run.start, from),
      end: Math.min(run.end, to),
    })
    if (run.end > to) result.push({ ...run, start: to })
  }
  return mergeAdjacentRuns(result, layer)
}
