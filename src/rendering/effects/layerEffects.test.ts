import { describe, expect, test } from 'bun:test'
import {
  applyBevelEmboss,
  applyBrightnessContrast,
  applyChromaKeyGlobal,
  applyDropShadow,
  applyInnerGlowEdge,
  applyInnerShadow,
  applyOuterGlow,
  applyPatternOverlayChecker,
  applySatin,
  applyGradientOverlay,
  applyGradientOverlayLinear,
  chromaKeyDescriptor,
  dropShadowDescriptor,
  outerGlowDescriptor,
  strokeDescriptor,
} from './layerEffects'
import { documentTextureTransformForLayer } from './filters/BevelEmbossFilter'

describe('effect bounds inflation', () => {
  test('drop shadow inflates by size and offset', () => {
    const insets = dropShadowDescriptor.boundsInflation({
      blur: 4,
      spread: 0,
      offsetX: 3,
      offsetY: 5,
    })
    expect(insets.left).toBeGreaterThanOrEqual(8)
    expect(insets.top).toBeGreaterThanOrEqual(8)
  })

  test('stroke inflates by size', () => {
    expect(strokeDescriptor.boundsInflation({ size: 2 })).toEqual({
      top: 2,
      right: 2,
      bottom: 2,
      left: 2,
    })
  })

  test('outer glow inflates by size*2', () => {
    expect(outerGlowDescriptor.boundsInflation({ size: 5 }).top).toBe(10)
  })

  test('chroma-key inflates by edge blur pad', () => {
    expect(chromaKeyDescriptor.boundsInflation({ edgeBlur: 2 })).toEqual({
      top: 6,
      right: 6,
      bottom: 6,
      left: 6,
    })
  })
})

describe('adjustment / chroma kernels', () => {
  test('brightness-contrast brightens opaque pixels', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 255])
    applyBrightnessContrast(rgba, 0.2, 0)
    expect(rgba[0]!).toBeGreaterThan(100)
  })

  test('chroma key clears exact key color within tolerance', () => {
    const rgba = new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255])
    applyChromaKeyGlobal(rgba, { r: 0, g: 255, b: 0 }, 30, 0)
    expect(rgba[3]).toBe(0)
    expect(rgba[7]).toBe(255)
  })
})

describe('style CPU kernels smoke', () => {
  function opaqueCenter(w: number, h: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(w * h * 4)
    const cx = Math.floor(w / 2)
    const cy = Math.floor(h / 2)
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        const i = (y * w + x) * 4
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 200
        rgba[i + 3] = 255
      }
    }
    return rgba
  }

  test('drop shadow adds alpha outside shape', () => {
    const w = 16
    const h = 16
    const src = opaqueCenter(w, h)
    const out = applyDropShadow(src, w, h, {
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      angle: 0,
      distance: 3,
      size: 1,
    })
    let shadowPixels = 0
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3]! > 0 && src[i + 3]! === 0) shadowPixels++
    }
    expect(shadowPixels).toBeGreaterThan(0)
  })

  test('outer glow expands alpha', () => {
    const w = 12
    const h = 12
    const src = opaqueCenter(w, h)
    const out = applyOuterGlow(src, w, h, { r: 255, g: 255, b: 0 }, 1, 2)
    let expanded = 0
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3]! > src[i + 3]!) expanded++
    }
    expect(expanded).toBeGreaterThan(0)
  })

  test('inner glow / shadow / satin / overlays mutate opaque pixels', () => {
    const w = 12
    const h = 12
    const base = opaqueCenter(w, h)

    const glow = new Uint8ClampedArray(base)
    applyInnerGlowEdge(glow, w, h, { r: 255, g: 255, b: 0 }, 1, 2)

    const shadow = new Uint8ClampedArray(base)
    applyInnerShadow(shadow, w, h, {
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      angle: 120,
      distance: 2,
      size: 2,
    })

    const satin = new Uint8ClampedArray(base)
    applySatin(satin, w, h, {
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      angle: 0,
      distance: 1,
      invert: true,
    })

    const grad = new Uint8ClampedArray(base)
    applyGradientOverlayLinear(
      grad,
      w,
      h,
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      1,
      0,
    )

    const pat = new Uint8ClampedArray(base)
    applyPatternOverlayChecker(pat, w, h, 1, 2)

    const bevel = new Uint8ClampedArray(base)
    applyBevelEmboss(bevel, w, h, {
      size: 2,
      depth: 100,
      highlight: { r: 255, g: 255, b: 255 },
      shadow: { r: 0, g: 0, b: 0 },
      highlightOpacity: 0.75,
      shadowOpacity: 0.75,
    })

    // At least one pixel differs from base for each kernel.
    const differs = (a: Uint8ClampedArray) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== base[i]) return true
      return false
    }
    expect(differs(glow)).toBe(true)
    expect(differs(shadow)).toBe(true)
    expect(differs(satin)).toBe(true)
    expect(differs(grad)).toBe(true)
    expect(differs(pat)).toBe(true)
    expect(differs(bevel)).toBe(true)
  })

  test('N-stop gradient preserves the middle stop', () => {
    const rgba = new Uint8ClampedArray(5 * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 128
      rgba[i + 3] = 255
    }
    applyGradientOverlay(
      rgba,
      5,
      1,
      [
        { offset: 0, color: { r: 0, g: 0, b: 0 }, opacity: 1 },
        { offset: 0.5, color: { r: 255, g: 0, b: 0 }, opacity: 1 },
        { offset: 1, color: { r: 255, g: 255, b: 255 }, opacity: 1 },
      ],
      1,
      0,
    )
    const center = 2 * 4
    expect(rgba[center]!).toBeGreaterThan(240)
    expect(rgba[center + 1]!).toBeLessThan(15)
    expect(rgba[center + 2]!).toBeLessThan(15)
  })

  test('bevel chisel techniques differ from smooth lighting', () => {
    const width = 16
    const height = 16
    const source = opaqueCenter(width, height)
    const common = {
      size: 4,
      depth: 200,
      highlight: { r: 255, g: 255, b: 255 },
      shadow: { r: 0, g: 0, b: 0 },
      highlightOpacity: 1,
      shadowOpacity: 1,
    }
    const smooth = new Uint8ClampedArray(source)
    const chiselHard = new Uint8ClampedArray(source)
    const chiselSoft = new Uint8ClampedArray(source)
    applyBevelEmboss(smooth, width, height, { ...common, technique: 'smooth' })
    applyBevelEmboss(chiselHard, width, height, { ...common, technique: 'chisel-hard' })
    applyBevelEmboss(chiselSoft, width, height, { ...common, technique: 'chisel-soft' })
    expect(chiselHard).not.toEqual(smooth)
    expect(chiselSoft).not.toEqual(smooth)
    expect(chiselSoft).not.toEqual(chiselHard)
  })

  test('unaligned bevel texture samples document coordinates', () => {
    const width = 16
    const height = 16
    const source = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < source.length; i += 4) {
      source[i] = source[i + 1] = source[i + 2] = source[i + 3] = 255
    }
    const common = {
      size: 1,
      depth: 100,
      highlight: { r: 255, g: 255, b: 255 },
      shadow: { r: 0, g: 0, b: 0 },
      highlightOpacity: 1,
      shadowOpacity: 1,
      texture: {
        enabled: true,
        pattern: 'noise' as const,
        scale: 25,
        depth: 100,
        invert: false,
      },
    }
    const translated = documentTextureTransformForLayer({
      x: 17,
      y: 11,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      skewXDeg: 0,
      skewYDeg: 0,
      pivotX: 0,
      pivotY: 0,
    })

    const alignedAtOrigin = new Uint8ClampedArray(source)
    applyBevelEmboss(alignedAtOrigin, width, height, common)
    const alignedTranslated = new Uint8ClampedArray(source)
    applyBevelEmboss(alignedTranslated, width, height, {
      ...common,
      texture: { ...common.texture, alignWithLayer: true, documentTransform: translated },
    })
    expect(alignedTranslated).toEqual(alignedAtOrigin)

    const documentAnchored = new Uint8ClampedArray(source)
    applyBevelEmboss(documentAnchored, width, height, {
      ...common,
      texture: { ...common.texture, alignWithLayer: false, documentTransform: translated },
    })
    expect(documentAnchored).not.toEqual(alignedAtOrigin)
  })

  test('document texture transform preserves pivot, scale, and rotation', () => {
    const scaled = documentTextureTransformForLayer(
      {
        x: 10,
        y: 20,
        scaleX: 2,
        scaleY: 3,
        rotationDeg: 0,
        skewXDeg: 0,
        skewYDeg: 0,
        pivotX: 4,
        pivotY: 5,
      },
      1,
      2,
    )
    const map = (transform: typeof scaled, x: number, y: number) => [
      transform.offset[0] + x * transform.xAxis[0] + y * transform.yAxis[0],
      transform.offset[1] + x * transform.xAxis[1] + y * transform.yAxis[1],
    ]
    expect(map(scaled, 5, 7)).toEqual([10, 20])
    expect(map(scaled, 6, 8)).toEqual([12, 23])

    const rotated = documentTextureTransformForLayer({
      x: 10,
      y: 20,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 90,
      skewXDeg: 0,
      skewYDeg: 0,
      pivotX: 0,
      pivotY: 0,
    })
    expect(map(rotated, 1, 0)[0]).toBeCloseTo(10)
    expect(map(rotated, 1, 0)[1]).toBeCloseTo(21)
  })
})
