import { beforeEach, describe, expect, test } from 'bun:test'
import {
  parseGuides,
  snapBoundsTranslation,
  snapPointToGuides,
  useGuidesStore,
} from './guides'

describe('guides', () => {
  beforeEach(() => useGuidesStore.setState({ guides: [] }))

  test('validates persisted guides', () => {
    expect(parseGuides([
      { id: 'vertical', axis: 'x', pos: 64 },
      { id: 'bad-axis', axis: 'z', pos: 10 },
      { id: 'bad-position', axis: 'y', pos: Number.NaN },
    ])).toEqual([{ id: 'vertical', axis: 'x', pos: 64 }])
  })

  test('creates, moves, and removes guides', () => {
    const id = useGuidesStore.getState().addGuide('y', 40)
    useGuidesStore.getState().moveGuide(id, 60)
    expect(useGuidesStore.getState().guides).toEqual([{ id, axis: 'y', pos: 60 }])
    useGuidesStore.getState().removeGuide(id)
    expect(useGuidesStore.getState().guides).toEqual([])
  })

  test('snaps geometry pointers to guides and document edges', () => {
    useGuidesStore.getState().setGuides([{ id: 'x', axis: 'x', pos: 40 }])
    expect(snapPointToGuides(
      { x: 43, y: 98 },
      { enabled: true, threshold: 5, width: 200, height: 100 },
    )).toEqual({ x: 40, y: 100 })
    expect(snapPointToGuides(
      { x: 43, y: 98 },
      { enabled: false, threshold: 5, width: 200, height: 100 },
    )).toEqual({ x: 43, y: 98 })
  })

  test('snaps a transform bounds edge to a guide', () => {
    useGuidesStore.getState().setGuides([{ id: 'edge', axis: 'x', pos: 120 }])
    expect(snapBoundsTranslation(
      { left: 78, top: 12, right: 118, bottom: 52 },
      { enabled: true, threshold: 4, width: 200, height: 100 },
    )).toEqual({ x: 2, y: 0 })
  })
})
