import { describe, expect, test } from 'bun:test'
import {
  createEmptyDocument,
  createGroupLayer,
  createRasterLayer,
} from './factories'
import {
  checkCanvasLimits,
  checkMinimumLayerCount,
  checkNoCycles,
  checkOpacityRange,
  checkSingleParent,
  validateDocumentInvariants,
} from './invariants'
import { asRasterAssetRef, createLayerId } from './ids'
import type { HappyDocument, Layer } from './schema'

function docWithLayers(
  rootChildren: string[],
  layers: Record<string, Layer>,
): HappyDocument {
  return {
    ...createEmptyDocument(),
    rootChildren: rootChildren as HappyDocument['rootChildren'],
    layers: layers as HappyDocument['layers'],
  }
}

describe('validateDocumentInvariants', () => {
  test('accepts a document with its required initial layer', () => {
    expect(validateDocumentInvariants(createEmptyDocument()).ok).toBe(true)
  })

  test('flags a document with no layers', () => {
    const empty = { ...createEmptyDocument(), rootChildren: [], layers: {} }
    expect(checkMinimumLayerCount(empty).length).toBe(1)
    expect(validateDocumentInvariants(empty).ok).toBe(false)
  })

  test('accepts a simple raster + group tree', () => {
    const rasterId = createLayerId()
    const raster = createRasterLayer({
      id: rasterId,
      pixels: asRasterAssetRef('asset-1'),
    })
    const groupId = createLayerId()
    const group = createGroupLayer({ id: groupId, children: [rasterId] })
    const withParent = { ...raster, parentId: groupId }

    const doc = docWithLayers([groupId], {
      [groupId]: group,
      [rasterId]: withParent,
    })

    expect(validateDocumentInvariants(doc).ok).toBe(true)
  })
})

describe('checkSingleParent', () => {
  test('flags a layer referenced by two parents', () => {
    const rasterId = createLayerId()
    const raster = createRasterLayer({
      id: rasterId,
      pixels: asRasterAssetRef('asset-1'),
    })
    const groupId = createLayerId()
    const group = createGroupLayer({ id: groupId, children: [rasterId] })

    // Referenced by both rootChildren and the group -> two parents.
    const doc = docWithLayers([groupId, rasterId], {
      [groupId]: group,
      [rasterId]: raster,
    })

    const issues = checkSingleParent(doc)
    expect(issues.some((i) => i.message.includes('2 parents'))).toBe(true)
  })

  test('flags an orphan layer referenced by nothing', () => {
    const rasterId = createLayerId()
    const raster = createRasterLayer({
      id: rasterId,
      pixels: asRasterAssetRef('asset-1'),
    })
    const doc = docWithLayers([], { [rasterId]: raster })

    const issues = checkSingleParent(doc)
    expect(
      issues.some((i) => i.message.includes('not referenced')),
    ).toBe(true)
  })

  test('flags a dangling reference to a nonexistent layer', () => {
    const doc = docWithLayers(['missing-id'], {})
    const issues = checkSingleParent(doc)
    expect(issues.some((i) => i.message.includes('unknown layer'))).toBe(true)
  })

  test('flags a duplicate reference within the same container', () => {
    const rasterId = createLayerId()
    const raster = createRasterLayer({
      id: rasterId,
      pixels: asRasterAssetRef('asset-1'),
    })
    const doc = docWithLayers([rasterId, rasterId], { [rasterId]: raster })
    const issues = checkSingleParent(doc)
    expect(issues.some((i) => i.message.includes('more than once'))).toBe(
      true,
    )
  })

  test('flags a parentId that disagrees with the actual container', () => {
    const rasterId = createLayerId()
    const raster = createRasterLayer({
      id: rasterId,
      pixels: asRasterAssetRef('asset-1'),
      parentId: createLayerId(), // points at a group that doesn't hold it
    })
    const doc = docWithLayers([rasterId], { [rasterId]: raster })
    const issues = checkSingleParent(doc)
    expect(issues.some((i) => i.path.endsWith('.parentId'))).toBe(true)
  })
})

describe('checkNoCycles', () => {
  test('flags two groups that only reference each other', () => {
    const idA = createLayerId()
    const idB = createLayerId()
    const groupA = createGroupLayer({ id: idA, parentId: idB, children: [idB] })
    const groupB = createGroupLayer({ id: idB, parentId: idA, children: [idA] })

    // Neither is reachable from the root -> unreachable/cycle.
    const doc = docWithLayers([], { [idA]: groupA, [idB]: groupB })

    const issues = checkNoCycles(doc)
    expect(issues.length).toBeGreaterThan(0)
  })

  test('accepts a deep but acyclic tree', () => {
    const idA = createLayerId()
    const idB = createLayerId()
    const idC = createLayerId()
    const groupB = createGroupLayer({ id: idB, parentId: idA, children: [idC] })
    const groupA = createGroupLayer({ id: idA, children: [idB] })
    const raster = createRasterLayer({
      id: idC,
      parentId: idB,
      pixels: asRasterAssetRef('asset-1'),
    })

    const doc = docWithLayers([idA], {
      [idA]: groupA,
      [idB]: groupB,
      [idC]: raster,
    })

    expect(checkNoCycles(doc)).toEqual([])
  })
})

describe('checkOpacityRange', () => {
  test('flags opacity above 1', () => {
    const id = createLayerId()
    const raster = { ...createRasterLayer({ id, pixels: asRasterAssetRef('a') }), opacity: 1.5 }
    const doc = docWithLayers([id], { [id]: raster })
    expect(checkOpacityRange(doc)).toHaveLength(1)
  })

  test('flags opacity below 0', () => {
    const id = createLayerId()
    const raster = { ...createRasterLayer({ id, pixels: asRasterAssetRef('a') }), opacity: -0.1 }
    const doc = docWithLayers([id], { [id]: raster })
    expect(checkOpacityRange(doc)).toHaveLength(1)
  })

  test('accepts boundary values 0 and 1', () => {
    const idLow = createLayerId()
    const idHigh = createLayerId()
    const low = { ...createRasterLayer({ id: idLow, pixels: asRasterAssetRef('a') }), opacity: 0 }
    const high = { ...createRasterLayer({ id: idHigh, pixels: asRasterAssetRef('b') }), opacity: 1 }
    const doc = docWithLayers([idLow, idHigh], { [idLow]: low, [idHigh]: high })
    expect(checkOpacityRange(doc)).toEqual([])
  })
})

describe('checkCanvasLimits', () => {
  test('flags a canvas side above the 8192px limit', () => {
    const doc = { ...createEmptyDocument(), canvas: { ...createEmptyDocument().canvas, width: 9000 } }
    expect(checkCanvasLimits(doc).length).toBeGreaterThan(0)
  })

  test('accepts a canvas within limits', () => {
    expect(checkCanvasLimits(createEmptyDocument())).toEqual([])
  })
})
