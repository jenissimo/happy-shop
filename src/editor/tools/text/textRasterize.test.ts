import { afterEach, describe, expect, test } from 'bun:test'
import type { TextLayer } from '../../../core/document'
import {
  ensureTextFontLoaded,
  measureTextBounds,
  pointTextAlignOffset,
  rasterizeTextLayerToBitmap,
} from './textRasterize'

const originalDocument = globalThis.document
const originalCreateImageBitmap = globalThis.createImageBitmap

afterEach(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  })
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: originalCreateImageBitmap,
  })
})

describe('ensureTextFontLoaded', () => {
  test('loads the layer face and waits for the font set', async () => {
    const calls: string[] = []
    let resolveReady!: () => void
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        fonts: {
          load: async (font: string) => {
            calls.push(font)
            resolveReady()
            return []
          },
          ready,
        },
      },
    })
    const layer = {
      italic: true,
      fontWeight: 700,
      fontSize: 24,
      fontFamily: 'Inter, sans-serif',
    } as TextLayer

    await ensureTextFontLoaded(layer)

    expect(calls).toEqual(['italic 700 24px Inter, sans-serif'])
  })
})

describe('text measurement', () => {
  test('keeps a long point-text line measurable and preserves alignment anchors', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        fonts: {
          load: async () => [],
          ready: Promise.resolve(),
        },
        createElement: () => ({
          getContext: () => ({
            font: '',
            measureText: (value: string) => ({ width: value.length * 8 }),
          }),
        }),
      },
    })
    const content = 'x'.repeat(50_000)
    const measured = await measureTextBounds({
      content,
      fontSize: 24,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 400,
      italic: false,
      leading: 0,
      tracking: 0,
      textMode: 'point',
      align: 'right',
    } as TextLayer)

    expect(measured.width).toBe(400_000)
    expect(measured.height).toBe(29)
    expect(measured.offsetX).toBe(-400_000)
    expect(pointTextAlignOffset('center', 200)).toBe(-100)
    expect(pointTextAlignOffset('left', 200)).toBe(0)
  })

  test('wraps paragraph text within its frame', async () => {
    const drawnLines: string[] = []
    const context = {
      font: '',
      fillStyle: '',
      textBaseline: 'alphabetic',
      strokeStyle: '',
      lineWidth: 1,
      clearRect: () => undefined,
      measureText: (value: string) => ({ width: value.length * 10 }),
      fillText: (text: string) => drawnLines.push(text),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
    }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        fonts: { load: async () => [], ready: Promise.resolve() },
        createElement: () => ({ width: 0, height: 0, getContext: () => context }),
      },
    })
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async () => ({}) as ImageBitmap,
    })

    await rasterizeTextLayerToBitmap({
      content: 'aaa bbb ccc',
      fontSize: 20, fontFamily: 'Inter', fontWeight: 400, italic: false,
      underline: false, color: '#000000', leading: 0, tracking: 0,
      textMode: 'box', align: 'left', bounds: { w: 40, h: 100 },
    } as TextLayer, { width: 40, height: 100, offsetX: 0, offsetY: 0 })

    expect(drawnLines).toEqual(['aaa ', 'bbb ', 'ccc'])
  })

  test('uses the paragraph width for baked center and right alignment', async () => {
    const positions: number[] = []
    const context = {
      font: '',
      fillStyle: '',
      textBaseline: 'alphabetic',
      strokeStyle: '',
      lineWidth: 1,
      clearRect: () => undefined,
      measureText: () => ({ width: 40 }),
      fillText: (_text: string, x: number) => positions.push(x),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
    }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        fonts: { load: async () => [], ready: Promise.resolve() },
        createElement: () => ({ width: 0, height: 0, getContext: () => context }),
      },
    })
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async () => ({}) as ImageBitmap,
    })
    const layer = {
      content: 'hello',
      fontSize: 24,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 400,
      italic: false,
      underline: false,
      color: '#000000',
      leading: 0,
      tracking: 0,
      textMode: 'box',
      bounds: { w: 100, h: 40 },
      align: 'center',
    } as TextLayer

    await rasterizeTextLayerToBitmap(layer, {
      width: 100,
      height: 40,
      offsetX: 0,
      offsetY: 0,
    })
    layer.align = 'right'
    await rasterizeTextLayerToBitmap(layer, {
      width: 100,
      height: 40,
      offsetX: 0,
      offsetY: 0,
    })

    expect(positions).toEqual([30, 60])
  })

  test('bakes a mixed-weight rich text run', async () => {
    const draws: Array<{ text: string; font: string }> = []
    const context = {
      font: '',
      fillStyle: '',
      textBaseline: 'alphabetic',
      strokeStyle: '',
      lineWidth: 1,
      clearRect: () => undefined,
      measureText: () => ({ width: 10 }),
      fillText(text: string) { draws.push({ text, font: this.font }) },
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
    }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        fonts: { load: async () => [], ready: Promise.resolve() },
        createElement: () => ({ width: 0, height: 0, getContext: () => context }),
      },
    })
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async () => ({}) as ImageBitmap,
    })
    await rasterizeTextLayerToBitmap({
      content: 'AB',
      fontSize: 20, fontFamily: 'Inter', fontWeight: 400, italic: false,
      underline: false, color: '#000000', leading: 0, tracking: 0,
      textMode: 'point', align: 'left', bounds: { w: 0, h: 0 },
      runs: [
        { start: 0, end: 1, fontFamily: 'Inter', fontSize: 20, fontWeight: 400, italic: false, color: '#000000' },
        { start: 1, end: 2, fontFamily: 'Inter', fontSize: 20, fontWeight: 700, italic: false, color: '#000000' },
      ],
    } as TextLayer, { width: 20, height: 24, offsetX: 0, offsetY: 0 })

    expect(draws).toEqual([
      { text: 'A', font: 'normal 400 20px Inter' },
      { text: 'B', font: 'normal 700 20px Inter' },
    ])
  })
})
