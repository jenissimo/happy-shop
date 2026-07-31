import { beforeEach, describe, expect, test } from 'bun:test'
import { useSelectionToolStore } from './selectionToolStore'

describe('selection tool variants', () => {
  beforeEach(() => {
    useSelectionToolStore.setState({
      marqueeShape: 'rect',
      lassoMode: 'freehand',
    })
  })

  test('cycles rectangular and elliptical marquee variants', () => {
    expect(useSelectionToolStore.getState().cycleMarqueeShape()).toBe('ellipse')
    expect(useSelectionToolStore.getState().marqueeShape).toBe('ellipse')
    expect(useSelectionToolStore.getState().cycleMarqueeShape()).toBe('rect')
  })

  test('cycles freehand, polygonal, and magnetic lasso variants', () => {
    expect(useSelectionToolStore.getState().cycleLassoMode()).toBe('polygonal')
    expect(useSelectionToolStore.getState().lassoMode).toBe('polygonal')
    expect(useSelectionToolStore.getState().cycleLassoMode()).toBe('magnetic')
    expect(useSelectionToolStore.getState().lassoMode).toBe('magnetic')
    expect(useSelectionToolStore.getState().cycleLassoMode()).toBe('freehand')
  })
})
