import { describe, expect, test } from 'bun:test'
import { createTextLayer } from '../../../core/document'
import { parseEditorRuns, runsMarkup, type EditorElement } from './textEditorMarkup'

function editor(
  innerText: string,
  spans: Array<{ innerText: string; dataset: Record<string, string> }> = [],
): EditorElement {
  return {
    innerText,
    querySelectorAll: () => spans,
  }
}

describe('parseEditorRuns', () => {
  test('spans the whole content when the DOM carries no styled spans', () => {
    // Typing into a fresh layer leaves plain text nodes: the runs must follow
    // the new content, not the layer's previous length.
    const layer = createTextLayer({ content: 'Hello Worl' })
    const parsed = parseEditorRuns(editor('Hello World'), layer)

    expect(parsed.content).toBe('Hello World')
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0]).toMatchObject({ start: 0, end: 'Hello World'.length })
  })

  test('stretches the trailing run over text typed outside every span', () => {
    const layer = createTextLayer({ content: 'Hi', fontSize: 20 })
    const parsed = parseEditorRuns(
      editor('Hi there', [
        {
          innerText: 'Hi',
          dataset: {
            fontFamily: 'Georgia',
            fontSize: '40',
            fontWeight: '700',
            italic: 'false',
            color: '#ff0000',
          },
        },
      ]),
      layer,
    )

    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0]).toMatchObject({
      start: 0,
      end: 'Hi there'.length,
      fontFamily: 'Georgia',
      fontSize: 40,
    })
  })

  test('keeps run boundaries when the spans already cover the content', () => {
    const layer = createTextLayer({ content: 'AB' })
    const parsed = parseEditorRuns(
      editor('AB', [
        {
          innerText: 'A',
          dataset: { fontFamily: 'Georgia', fontSize: '10', fontWeight: '400', italic: 'false', color: '#000000' },
        },
        {
          innerText: 'B',
          dataset: { fontFamily: 'Georgia', fontSize: '20', fontWeight: '400', italic: 'false', color: '#000000' },
        },
      ]),
      layer,
    )

    expect(parsed.runs.map((run) => [run.start, run.end, run.fontSize])).toEqual([
      [0, 1, 10],
      [1, 2, 20],
    ])
  })

  test('an emptied editor keeps no runs at all', () => {
    const layer = createTextLayer({ content: 'gone' })
    expect(parseEditorRuns(editor(''), layer)).toEqual({ content: '', runs: [] })
  })
})

describe('runsMarkup', () => {
  test('emits document-pixel font sizes (the overlay scales via its matrix)', () => {
    const layer = createTextLayer({ content: 'Hi', fontSize: 48 })
    expect(runsMarkup(layer)).toContain('font-size:48px')
  })
})
