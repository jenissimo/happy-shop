/**
 * Blend / FX image goldens — CPU reference kernels (SPEC §10 / §21.6).
 * Tolerance documented in ./README.md (maxAbsDiff ≤ 2, meanAbsDiff ≤ 0.5).
 */
import { describe, expect, test } from 'bun:test'
import { applyEffectStack } from '../../rendering/effects/applyEffectStack'
import {
  applyBevelEmboss,
  applyChromaKey,
  applyChromaKeyGlobal,
  applyColorOverlay,
  applyDropShadow,
  applyGradientOverlayLinear,
  applyInnerGlowEdge,
  applyInnerShadow,
  applyOuterGlow,
  applyPatternOverlayChecker,
  applySatin,
  applyStrokeOutside,
  blendEffectRgb,
  blendMultiply,
  blendNormalOver,
  sampleBevelContour,
} from '../../rendering/effects/layerEffects'
import { resolveEffectStack } from '../../rendering/effects/resolveEffectStack'
import { assertRgbaClose, DEFAULT_TOLERANCE } from './compareRgba'
import solidRed from './fixtures/solidRed32.json'

describe('image golden tolerance contract', () => {
  test('documents default tolerance', () => {
    expect(DEFAULT_TOLERANCE.maxAbsDiff).toBe(2)
    expect(DEFAULT_TOLERANCE.meanAbsDiff).toBe(0.5)
  })
})

describe('color overlay golden', () => {
  test('50% blue overlay on solid red', () => {
    const rgba = new Uint8ClampedArray(solidRed.rgba)
    applyColorOverlay(rgba, { r: 0, g: 0, b: 255 }, 0.5)
    const expected = new Uint8ClampedArray(rgba.length)
    for (let i = 0; i < expected.length; i += 4) {
      expected[i] = 128
      expected[i + 1] = 0
      expected[i + 2] = 128
      expected[i + 3] = 255
    }
    assertRgbaClose(rgba, expected, { maxAbsDiff: 1, meanAbsDiff: 0.5 })
  })
})

describe('chroma key golden', () => {
  test('clears pure green key', () => {
    const rgba = new Uint8ClampedArray([
      0, 255, 0, 255,
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ])
    applyChromaKeyGlobal(rgba, { r: 0, g: 255, b: 0 }, 30, 0)
    const expected = new Uint8ClampedArray([
      0, 255, 0, 0,
      255, 0, 0, 255,
      0, 255, 0, 0,
      0, 0, 255, 255,
    ])
    assertRgbaClose(rgba, expected, { maxAbsDiff: 0, meanAbsDiff: 0 })
  })

  test('flood vs global — disconnected greens', () => {
    const w = 3
    const h = 1
    const base = [0, 255, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255]
    const flood = new Uint8ClampedArray(base)
    applyChromaKey(flood, {
      keyRgb: { r: 0, g: 255, b: 0 },
      tolerance: 30,
      softness: 0,
      mode: 'flood',
      width: w,
      height: h,
      floodOrigins: [{ x: 0, y: 0 }],
    })
    expect(flood[3]).toBe(0)
    expect(flood[11]).toBe(255)

    const global = new Uint8ClampedArray(base)
    applyChromaKey(global, {
      keyRgb: { r: 0, g: 255, b: 0 },
      tolerance: 30,
      softness: 0,
      mode: 'global',
      width: w,
      height: h,
    })
    expect(global[3]).toBe(0)
    expect(global[11]).toBe(0)
  })
})

describe('stroke outside golden', () => {
  test('dilates a center opaque pixel', () => {
    const w = 5
    const h = 5
    const src = new Uint8ClampedArray(w * h * 4)
    const cx = 2
    const cy = 2
    const i = (cy * w + cx) * 4
    src[i] = 255
    src[i + 1] = 255
    src[i + 2] = 255
    src[i + 3] = 255
    const out = applyStrokeOutside(src, w, h, { r: 0, g: 0, b: 0 }, 1, 1)
    expect(out[i + 3]).toBe(255)
    expect(out[i]).toBe(255)
    const up = ((cy - 1) * w + cx) * 4
    expect(out[up + 3]!).toBeGreaterThan(0)
    expect(out[up]!).toBeLessThanOrEqual(2)
  })
})

function blockFixture(w: number, h: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = (y * w + x) * 4
      rgba[i] = 180
      rgba[i + 1] = 180
      rgba[i + 2] = 180
      rgba[i + 3] = 255
    }
  }
  return rgba
}

describe('drop shadow golden', () => {
  test('offset shadow increases coverage', () => {
    const w = 16
    const h = 16
    const src = blockFixture(w, h)
    const out = applyDropShadow(src, w, h, {
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      angle: 0,
      distance: 2,
      size: 1,
    })
    let srcA = 0
    let outA = 0
    for (let i = 3; i < src.length; i += 4) {
      srcA += src[i]!
      outA += out[i]!
    }
    expect(outA).toBeGreaterThan(srcA)
  })
})

describe('outer / inner glow goldens', () => {
  test('outer glow expands alpha sum', () => {
    const w = 12
    const h = 12
    const src = blockFixture(w, h)
    const out = applyOuterGlow(src, w, h, { r: 255, g: 255, b: 0 }, 1, 2)
    let srcA = 0
    let outA = 0
    for (let i = 3; i < src.length; i += 4) {
      srcA += src[i]!
      outA += out[i]!
    }
    expect(outA).toBeGreaterThan(srcA)
  })

  test('inner glow tints edge pixels', () => {
    const w = 12
    const h = 12
    const rgba = blockFixture(w, h)
    // Block opaque region starts at (2,2) — sample that edge pixel.
    const edge = (2 * w + 2) * 4
    const before = rgba[edge]!
    applyInnerGlowEdge(rgba, w, h, { r: 255, g: 0, b: 0 }, 1, 3)
    expect(rgba[edge]!).toBeGreaterThan(before)
  })
})

describe('inner shadow / satin / bevel goldens', () => {
  test('inner shadow darkens', () => {
    const w = 12
    const h = 12
    const rgba = blockFixture(w, h)
    const before = rgba[((h / 2) | 0) * w * 4]!
    applyInnerShadow(rgba, w, h, {
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      angle: 120,
      distance: 3,
      size: 2,
    })
    expect(rgba[((h / 2) | 0) * w * 4]!).toBeLessThanOrEqual(before)
  })

  test('satin mutates interior', () => {
    const w = 12
    const h = 12
    const rgba = blockFixture(w, h)
    const copy = new Uint8ClampedArray(rgba)
    applySatin(rgba, w, h, {
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      angle: 19,
      distance: 4,
      invert: false,
    })
    let diff = 0
    for (let i = 0; i < rgba.length; i++) diff += Math.abs(rgba[i]! - copy[i]!)
    expect(diff).toBeGreaterThan(0)
  })

  test('bevel adds highlight or shadow contrast', () => {
    const w = 12
    const h = 12
    const rgba = blockFixture(w, h)
    applyBevelEmboss(rgba, w, h, {
      size: 2,
      depth: 200,
      highlight: { r: 255, g: 255, b: 255 },
      shadow: { r: 0, g: 0, b: 0 },
      highlightOpacity: 1,
      shadowOpacity: 1,
    })
    let min = 255
    let max = 0
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3]! === 0) continue
      min = Math.min(min, rgba[i]!)
      max = Math.max(max, rgba[i]!)
    }
    expect(max - min).toBeGreaterThan(0)
  })

  test('bevel contour curves reshape the lighting response', () => {
    expect(sampleBevelContour('linear', 0.25)).toBeCloseTo(0.25)
    expect(sampleBevelContour('cone', 0.25)).toBeCloseTo(0.5)
    expect(sampleBevelContour('ring', 0.5)).toBeCloseTo(1)
  })

  test('bevel texture adds procedural height detail', () => {
    const w = 16
    const h = 16
    const plain = blockFixture(w, h)
    const textured = new Uint8ClampedArray(plain)
    const common = {
      size: 2,
      depth: 150,
      highlight: { r: 255, g: 255, b: 255 },
      shadow: { r: 0, g: 0, b: 0 },
      highlightOpacity: 1,
      shadowOpacity: 1,
    }
    applyBevelEmboss(plain, w, h, common)
    applyBevelEmboss(textured, w, h, {
      ...common,
      texture: {
        enabled: true,
        pattern: 'checker',
        scale: 25,
        depth: 100,
        invert: false,
      },
    })

    let difference = 0
    for (let i = 0; i < plain.length; i++) {
      difference += Math.abs(plain[i]! - textured[i]!)
    }
    expect(difference).toBeGreaterThan(0)
  })

  test('bevel chisel-hard produces sharper facet contrast than smooth', () => {
    const w = 16
    const h = 16
    const smooth = blockFixture(w, h)
    const chisel = new Uint8ClampedArray(smooth)
    const common = {
      size: 4,
      depth: 200,
      highlight: { r: 255, g: 255, b: 255 },
      shadow: { r: 0, g: 0, b: 0 },
      highlightOpacity: 1,
      shadowOpacity: 1,
    }
    applyBevelEmboss(smooth, w, h, { ...common, technique: 'smooth' })
    applyBevelEmboss(chisel, w, h, { ...common, technique: 'chisel-hard' })
    let smoothRange = 0
    let chiselRange = 0
    for (let i = 0; i < smooth.length; i += 4) {
      if (smooth[i + 3]! === 0) continue
      smoothRange = Math.max(smoothRange, smooth[i]!)
      chiselRange = Math.max(chiselRange, chisel[i]!)
    }
    expect(chiselRange).toBeGreaterThanOrEqual(smoothRange)
    let diff = 0
    for (let i = 0; i < smooth.length; i++) diff += Math.abs(smooth[i]! - chisel[i]!)
    expect(diff).toBeGreaterThan(0)
  })
})

describe('gradient / pattern overlay goldens', () => {
  test('linear gradient left-right', () => {
    const w = 8
    const h = 4
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 128
      rgba[i + 3] = 255
    }
    applyGradientOverlayLinear(
      rgba,
      w,
      h,
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      1,
      0,
    )
    const left = rgba[0]!
    const right = rgba[(w - 1) * 4]!
    expect(right).toBeGreaterThan(left)
  })

  test('checker pattern alternates', () => {
    const w = 4
    const h = 4
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 128
      rgba[i + 3] = 255
    }
    applyPatternOverlayChecker(rgba, w, h, 1, 2)
    expect(rgba[0]).not.toBe(rgba[2 * 4])
  })
})

describe('blend goldens', () => {
  test('normal over composites semi-transparent white on black', () => {
    const dst = new Uint8ClampedArray([0, 0, 0, 255])
    const src = new Uint8ClampedArray([255, 255, 255, 128])
    blendNormalOver(dst, src)
    assertRgbaClose(dst, [128, 128, 128, 255], { maxAbsDiff: 1, meanAbsDiff: 1 })
  })

  test('multiply darkens', () => {
    const dst = new Uint8ClampedArray([200, 200, 200, 255])
    const src = new Uint8ClampedArray([128, 128, 128, 255])
    blendMultiply(dst, src)
    expect(dst[0]!).toBeLessThan(200)
    expect(dst[3]).toBe(255)
  })

  test('CPU effect blend modes do not fall back to normal', () => {
    const base = 96
    const effect = 192
    expect(blendEffectRgb(base, effect, 1, 'darken')).toBe(96)
    expect(blendEffectRgb(base, effect, 1, 'lighten')).toBe(192)
    expect(blendEffectRgb(base, effect, 1, 'difference')).toBe(96)
    expect(blendEffectRgb(base, effect, 1, 'exclusion')).not.toBe(effect)
  })

  test('effect stack forwards overlay blend mode to CPU color overlay', () => {
    const src = new Uint8ClampedArray([128, 128, 128, 255])
    const out = applyEffectStack(src, 1, 1, [
      {
        type: 'color-overlay',
        enabled: true,
        blendMode: 'multiply',
        color: '#808080',
        opacity: 1,
      },
    ])
    expect(out[0]).toBeLessThan(128)
  })
})

describe('stroke + color overlay on soft alpha', () => {
  test('outside black stroke stays near rgb 0 after white overlay on antialiased edge', () => {
    const w = 7
    const h = 5
    const rgba = new Uint8ClampedArray(w * h * 4)
    // Opaque white block with a soft right edge (simulates rasterized text AA).
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        const i = (y * w + x) * 4
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 255
        rgba[i + 3] = 255
      }
    }
    for (let y = 1; y <= 3; y++) {
      const i = (y * w + 3) * 4
      rgba[i + 3] = 128
    }

    const out = applyEffectStack(new Uint8ClampedArray(rgba), w, h, [
      {
        type: 'color-overlay',
        enabled: true,
        blendMode: 'normal',
        color: '#ffffff',
        opacity: 1,
      },
      {
        type: 'stroke',
        enabled: true,
        blendMode: 'normal',
        color: '#000000',
        opacity: 1,
        size: 1,
        position: 'outside',
      },
    ])

    // Pure outside-stroke ring adjacent to fully opaque fill (srcA=0, maxA=1).
    const ring = (2 * w + 0) * 4
    expect(out[ring + 3]!).toBe(255)
    expect(out[ring]!).toBeLessThanOrEqual(2)
    expect(out[ring + 1]!).toBeLessThanOrEqual(2)
    expect(out[ring + 2]!).toBeLessThanOrEqual(2)

    // Soft edge pixel must stay fully opaque (no washed-out alpha halo).
    const edge = (2 * w + 3) * 4
    expect(out[edge + 3]!).toBe(255)
  })
})

describe('multi-instance effect stack goldens', () => {
  test('2 strokes — outer ring uses second stroke color; order matters', () => {
    const w = 11
    const h = 11
    const src = new Uint8ClampedArray(w * h * 4)
    const mid = ((5 * w + 5) * 4)
    src[mid] = src[mid + 1] = src[mid + 2] = 200
    src[mid + 3] = 255

    const thinRed = {
      type: 'stroke' as const,
      enabled: true,
      blendMode: 'normal' as const,
      color: '#ff0000',
      opacity: 1,
      size: 1,
      position: 'outside' as const,
    }
    const thickBlue = {
      type: 'stroke' as const,
      enabled: true,
      blendMode: 'normal' as const,
      color: '#0000ff',
      opacity: 1,
      size: 2,
      position: 'outside' as const,
    }

    // Paint order: thin red first (below), thick blue second (above / outer).
    const out = applyEffectStack(
      new Uint8ClampedArray(src),
      w,
      h,
      [thinRed, thickBlue],
    )
    const far = ((5 * w + 8) * 4) // ~3px from center — only thick blue reaches
    expect(out[far + 3]!).toBeGreaterThan(0)
    expect(out[far + 2]!).toBeGreaterThan(out[far]!) // blue > red

    const swapped = applyEffectStack(
      new Uint8ClampedArray(src),
      w,
      h,
      [thickBlue, thinRed],
    )
    // Different array order ⇒ different pixels (list-governed ordering).
    let diff = 0
    for (let i = 0; i < out.length; i++) {
      diff += Math.abs(out[i]! - swapped[i]!)
    }
    expect(diff).toBeGreaterThan(0)
  })

  test('resolver + CPU stack share key-phase hoist', () => {
    const effects = [
      {
        type: 'color-overlay' as const,
        enabled: true,
        blendMode: 'normal' as const,
        color: '#ff0000',
        opacity: 1,
      },
      {
        type: 'chroma-key' as const,
        enabled: true,
        keyColor: '#00ff00',
        tolerance: 30,
        softness: 0,
      },
    ]
    expect(resolveEffectStack(effects).nodes.map((n) => n.type)).toEqual([
      'chroma-key',
      'color-overlay',
    ])
  })
})
