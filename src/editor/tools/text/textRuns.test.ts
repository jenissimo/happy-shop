import { describe, expect, test } from 'bun:test'
import { createTextLayer } from '../../../core/document'
import {
  normalizedTextRuns,
  resolveRunTracking,
  resolveRunUnderline,
  styleTextRange,
} from './textRuns'

describe('textRuns', () => {
  test('inherits layer underline and tracking when run fields are omitted', () => {
    const layer = createTextLayer({
      content: 'Hi',
      underline: true,
      tracking: 12,
      runs: [{
        start: 0,
        end: 2,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      }],
    })
    const run = normalizedTextRuns(layer)[0]!
    expect(resolveRunUnderline(run, layer)).toBe(true)
    expect(resolveRunTracking(run, layer)).toBe(12)
  })

  test('styles underline and tracking on a selection range', () => {
    const layer = createTextLayer({
      content: 'abcd',
      underline: false,
      tracking: 0,
      runs: [{
        start: 0,
        end: 4,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      }],
    })
    const runs = styleTextRange(layer, 1, 3, { underline: true, tracking: 8 })
    expect(runs).toEqual([
      {
        start: 0,
        end: 1,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      },
      {
        start: 1,
        end: 3,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
        underline: true,
        tracking: 8,
      },
      {
        start: 3,
        end: 4,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      },
    ])
  })

  test('merges adjacent runs with the same resolved character style', () => {
    const layer = createTextLayer({
      content: 'ab',
      underline: false,
      tracking: 0,
      runs: [
        {
          start: 0,
          end: 1,
          fontFamily: 'Inter',
          fontSize: 48,
          fontWeight: 400,
          italic: false,
          color: '#000000',
          underline: true,
        },
        {
          start: 1,
          end: 2,
          fontFamily: 'Inter',
          fontSize: 48,
          fontWeight: 400,
          italic: false,
          color: '#000000',
          underline: true,
        },
      ],
    })
    expect(normalizedTextRuns(layer)).toHaveLength(1)
  })
})
