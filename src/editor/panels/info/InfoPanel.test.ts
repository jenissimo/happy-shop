import { describe, expect, test } from 'bun:test'
import { buildInfoRows } from './infoPanelModel'
import {
  formatCursorCoord,
  formatSelectionSize,
  formatZoomPercent,
} from '../../shell/statusReadouts'

describe('statusReadouts', () => {
  test('formatSelectionSize mirrors status bar rules', () => {
    expect(formatSelectionSize(null)).toBeNull()
    expect(formatSelectionSize({ x: 0, y: 0, width: 0, height: 10 })).toBeNull()
    expect(formatSelectionSize({ x: 1, y: 2, width: 30.4, height: 15.6 })).toBe(
      '30 × 16',
    )
  })

  test('formatCursorCoord handles missing values', () => {
    expect(formatCursorCoord(null)).toBe('—')
    expect(formatCursorCoord(12.6)).toBe('13')
  })

  test('formatZoomPercent rounds', () => {
    expect(formatZoomPercent(99.4)).toBe('99%')
    expect(formatZoomPercent(100.6)).toBe('101%')
  })
})

describe('buildInfoRows', () => {
  test('includes cursor, selection, zoom, and document size', () => {
    const rows = buildInfoRows({
      docCursor: { x: 10.2, y: 20.8 },
      marquee: { x: 0, y: 0, width: 40, height: 20 },
      zoomPercent: 150,
      docWidth: 800,
      docHeight: 600,
    })
    expect(rows).toEqual([
      { label: 'X', value: '10', muted: false },
      { label: 'Y', value: '21', muted: false },
      { label: 'Selection', value: '40 × 20', muted: false },
      { label: 'Zoom', value: '150%' },
      { label: 'Document', value: '800 × 600' },
    ])
  })

  test('shows muted placeholders without cursor or selection', () => {
    const rows = buildInfoRows({
      docCursor: null,
      marquee: null,
      zoomPercent: 100,
      docWidth: 640,
      docHeight: 480,
    })
    expect(rows[0]).toMatchObject({ label: 'X', value: '—', muted: true })
    expect(rows[2]).toMatchObject({ label: 'Selection', value: 'None', muted: true })
  })
})
