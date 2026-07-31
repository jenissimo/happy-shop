import { describe, expect, test } from 'bun:test'
import {
  buildDefaultCage,
  buildGridTriangles,
  cageBoundaryFeatherWeight,
  canRemoveCagePoint,
  distanceToRestCageBoundary,
  hitTestCageEdge,
  hitTestCagePoint,
  insertCageCol,
  insertCageRow,
  removeCagePoint,
  warpCageRegion,
  type WarpPoint,
} from './cageWarp'

describe('cageWarp', () => {
  test('buildDefaultCage places corners on bounds', () => {
    const cage = buildDefaultCage({ x: 10, y: 20, width: 30, height: 40 })
    expect(cage).toHaveLength(9)
    expect(cage[0]).toEqual({ x: 10, y: 20 })
    expect(cage[2]).toEqual({ x: 40, y: 20 })
    expect(cage[6]).toEqual({ x: 10, y: 60 })
    expect(cage[8]).toEqual({ x: 40, y: 60 })
  })

  test('grid triangulation covers 3×3 cells', () => {
    expect(buildGridTriangles(3, 3)).toHaveLength(8)
  })

  test('warp shifts a solid block when a corner moves', () => {
    const bounds = { x: 0, y: 0, width: 20, height: 20 }
    const source = new Uint8ClampedArray(20 * 20 * 4)
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        const i = (y * 20 + x) * 4
        source[i] = 200
        source[i + 1] = 40
        source[i + 2] = 10
        source[i + 3] = 255
      }
    }
    const rest = buildDefaultCage(bounds)
    const deformed = rest.map((p) => ({ ...p })) as WarpPoint[]
    deformed[8] = { x: 45, y: 45 }
    const { data, bounds: outBounds } = warpCageRegion({
      source,
      srcBounds: bounds,
      restCage: rest,
      deformedCage: deformed,
      cols: 3,
      rows: 3,
    })
    expect(outBounds.width).toBeGreaterThanOrEqual(20)
    let hit = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 0) hit++
    }
    expect(hit).toBeGreaterThan(0)
  })

  test('hitTestCagePoint finds nearest control within radius', () => {
    const cage = buildDefaultCage({ x: 0, y: 0, width: 100, height: 100 })
    expect(hitTestCagePoint({ x: 2, y: 2 }, cage, 5)).toBe(0)
    expect(hitTestCagePoint({ x: 500, y: 500 }, cage, 5)).toBe(-1)
  })

  test('buildDefaultCage supports 2×2 density', () => {
    const cage = buildDefaultCage({ x: 0, y: 0, width: 20, height: 30 }, 2, 2)
    expect(cage).toHaveLength(4)
    expect(cage[0]).toEqual({ x: 0, y: 0 })
    expect(cage[3]).toEqual({ x: 20, y: 30 })
  })

  test('hitTestCageEdge finds row-splitting edge', () => {
    const cage = buildDefaultCage({ x: 0, y: 0, width: 100, height: 100 })
    const hit = hitTestCageEdge({ x: 0, y: 25 }, cage, 3, 3, 8)
    expect(hit).toEqual({ kind: 'h', afterRow: 0 })
  })

  test('insertCageRow subdivides a 2×2 grid to 2×3', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rest = buildDefaultCage(bounds, 2, 2)
    const cage = rest.map((p) => ({ ...p }))
    const next = insertCageRow(rest, cage, 2, 2, 0)
    expect(next?.rows).toBe(3)
    expect(next?.cols).toBe(2)
    expect(next?.cage).toHaveLength(6)
  })

  test('insertCageCol subdivides a 2×2 grid to 3×2', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rest = buildDefaultCage(bounds, 2, 2)
    const cage = rest.map((p) => ({ ...p }))
    const next = insertCageCol(rest, cage, 2, 2, 0)
    expect(next?.cols).toBe(3)
    expect(next?.rows).toBe(2)
    expect(next?.cage).toHaveLength(6)
  })

  test('removeCagePoint drops an internal row', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rest = buildDefaultCage(bounds, 3, 3)
    const cage = rest.map((p) => ({ ...p }))
    expect(canRemoveCagePoint(3, 3, 4)).toBe(true)
    const next = removeCagePoint(rest, cage, 3, 3, 4)
    expect(next?.rows).toBe(2)
    expect(next?.cols).toBe(3)
    expect(next?.cage).toHaveLength(6)
  })

  test('removeCagePoint refuses border corners', () => {
    expect(canRemoveCagePoint(3, 3, 0)).toBe(false)
    expect(removeCagePoint(buildDefaultCage({ x: 0, y: 0, width: 10, height: 10 }), [], 3, 3, 0)).toBeNull()
  })

  test('distanceToRestCageBoundary is zero on the perimeter', () => {
    const rest = buildDefaultCage({ x: 0, y: 0, width: 100, height: 100 })
    expect(distanceToRestCageBoundary({ x: 0, y: 50 }, rest, 3, 3)).toBe(0)
    expect(distanceToRestCageBoundary({ x: 50, y: 50 }, rest, 3, 3)).toBe(50)
  })

  test('cageBoundaryFeatherWeight ramps from 0 at the edge to 1 inside', () => {
    expect(cageBoundaryFeatherWeight(0, 8)).toBe(0)
    expect(cageBoundaryFeatherWeight(8, 8)).toBe(1)
    expect(cageBoundaryFeatherWeight(4, 8)).toBeCloseTo(0.5, 1)
    expect(cageBoundaryFeatherWeight(10, 8)).toBe(1)
    expect(cageBoundaryFeatherWeight(5, 0)).toBe(1)
  })

  test('feather changes warped RGB in the deformed extension', () => {
    const bounds = { x: 0, y: 0, width: 20, height: 20 }
    const source = new Uint8ClampedArray(20 * 20 * 4)
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const i = (y * 20 + x) * 4
        source[i] = x * 12
        source[i + 1] = y * 12
        source[i + 2] = 128
        source[i + 3] = 255
      }
    }
    const rest = buildDefaultCage(bounds)
    const deformed = rest.map((p) => ({ ...p })) as WarpPoint[]
    deformed[2] = { x: 35, y: 0 }
    deformed[5] = { x: 35, y: 10 }
    deformed[8] = { x: 35, y: 20 }
    const hard = warpCageRegion({
      source,
      srcBounds: bounds,
      restCage: rest,
      deformedCage: deformed,
      cols: 3,
      rows: 3,
      featherRadius: 0,
    })
    const soft = warpCageRegion({
      source,
      srcBounds: bounds,
      restCage: rest,
      deformedCage: deformed,
      cols: 3,
      rows: 3,
      featherRadius: 8,
    })
    let differs = false
    for (let i = 0; i < hard.data.length; i += 4) {
      if (
        hard.data[i] !== soft.data[i] ||
        hard.data[i + 1] !== soft.data[i + 1] ||
        hard.data[i + 2] !== soft.data[i + 2]
      ) {
        differs = true
        break
      }
    }
    expect(differs).toBe(true)
  })

  test('identity warp is unchanged by feather', () => {
    const bounds = { x: 0, y: 0, width: 20, height: 20 }
    const source = new Uint8ClampedArray(20 * 20 * 4)
    for (let i = 0; i < source.length; i += 4) {
      source[i] = 100
      source[i + 3] = 255
    }
    const rest = buildDefaultCage(bounds)
    const hard = warpCageRegion({
      source,
      srcBounds: bounds,
      restCage: rest,
      deformedCage: rest,
      cols: 3,
      rows: 3,
      featherRadius: 0,
    })
    const soft = warpCageRegion({
      source,
      srcBounds: bounds,
      restCage: rest,
      deformedCage: rest,
      cols: 3,
      rows: 3,
      featherRadius: 8,
    })
    expect(soft.data).toEqual(hard.data)
  })
})
