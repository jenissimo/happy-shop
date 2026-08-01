import { describe, expect, test } from 'bun:test'
import { tipDiameterScreenPx } from './brushCursor'
import { resizeCursorIdForHandle } from './resizeCursor'
import { resolveViewportCursor, type ViewportCursorInput } from './resolveCursor'
import { TOOLS } from '../toolbar/tools'

function base(over: Partial<ViewportCursorInput> = {}): ViewportCursorInput {
  return {
    activeToolId: 'move',
    overCanvas: true,
    spaceHeld: false,
    isPanning: false,
    altHeld: false,
    precisionHeld: false,
    brushCursorPreference: 'normal',
    zoom: 1,
    brushSizeDocPx: 20,
    brushHardness: 0.85,
    canPaint: true,
    hoverHandle: null,
    hoverHandleRotationDeg: 0,
    ...over,
  }
}

describe('resolveViewportCursor', () => {
  test('priority: pan > space > tool', () => {
    expect(resolveViewportCursor(base({ isPanning: true })).id).toBe('grabbing')
    expect(resolveViewportCursor(base({ spaceHeld: true })).id).toBe('grab')
    expect(resolveViewportCursor(base({ activeToolId: 'hand' })).id).toBe('grab')
  })

  test('marquee / text / shape / lasso / wand / crop / move', () => {
    expect(resolveViewportCursor(base({ activeToolId: 'marquee' })).id).toBe(
      'marquee',
    )
    expect(resolveViewportCursor(base({ activeToolId: 'text' })).id).toBe('text')
    expect(resolveViewportCursor(base({ activeToolId: 'shape' })).id).toBe(
      'shape',
    )
    expect(resolveViewportCursor(base({ activeToolId: 'pen' })).id).toBe('pen')
    expect(resolveViewportCursor(base({ activeToolId: 'pathSelection' })).id).toBe(
      'path-selection',
    )
    expect(resolveViewportCursor(base({ activeToolId: 'directSelection' })).id).toBe(
      'direct-selection',
    )
    expect(resolveViewportCursor(base({ activeToolId: 'lasso' })).id).toBe(
      'lasso',
    )
    expect(resolveViewportCursor(base({ activeToolId: 'magicWand' })).id).toBe(
      'wand',
    )
    expect(resolveViewportCursor(base({ activeToolId: 'paintBucket' })).id).toBe(
      'paint-bucket',
    )
    expect(resolveViewportCursor(base({ activeToolId: 'crop' })).id).toBe('crop')
    expect(resolveViewportCursor(base({ activeToolId: 'move' })).id).toBe('move')
  })

  test('every toolbar tool maps to a dedicated canvas cursor', () => {
    const expected: Record<string, string> = {
      move: 'move',
      marquee: 'marquee',
      lasso: 'lasso',
      magicWand: 'wand',
      crop: 'crop',
      eyedropper: 'eyedropper',
      brush: 'brush',
      pencil: 'brush',
      eraser: 'eraser',
      paintBucket: 'paint-bucket',
      gradient: 'gradient',
      cloneStamp: 'stamp',
      historyBrush: 'stamp',
      patternStamp: 'stamp',
      spotHealing: 'spot-heal',
      healingBrush: 'heal',
      smudge: 'smudge',
      blur: 'blur',
      sharpen: 'sharpen',
      dodge: 'dodge',
      burn: 'burn',
      sponge: 'sponge',
      liquifyWarp: 'liquify',
      liquifyReconstruct: 'liquify-reconstruct',
      liquifyBloat: 'liquify-bloat',
      liquifyPucker: 'liquify-pucker',
      liquifyTwirl: 'liquify-twirl',
      liquifyFreeze: 'liquify-freeze',
      liquifyThaw: 'liquify-thaw',
      text: 'text',
      pathSelection: 'path-selection',
      directSelection: 'direct-selection',
      pen: 'pen',
      freeformPen: 'pen',
      addAnchor: 'pen',
      deleteAnchor: 'pen',
      convertPoint: 'pen',
      shape: 'shape',
      hand: 'grab',
      rotateView: 'rotate',
      zoom: 'zoom-in',
      quickMask: 'quick-mask',
    }

    for (const [tool, cursorId] of Object.entries(expected)) {
      const resolved = resolveViewportCursor(
        base({ activeToolId: tool as ViewportCursorInput['activeToolId'] }),
      )
      expect(resolved.id, tool).toBe(cursorId)
      expect(resolved.id, tool).not.toBe('default')
    }

    // Keep the table in sync with TOOLS — missing/extra entries fail the review.
    expect(Object.keys(expected).sort()).toEqual(
      TOOLS.map((tool) => tool.id).sort(),
    )
  })

  test('zoom Alt flips out', () => {
    expect(resolveViewportCursor(base({ activeToolId: 'zoom' })).id).toBe(
      'zoom-in',
    )
    expect(
      resolveViewportCursor(base({ activeToolId: 'zoom', altHeld: true })).id,
    ).toBe('zoom-out')
  })

  test('brush tip ring scales with zoom; Alt eyedropper; locked not-allowed', () => {
    const brush = resolveViewportCursor(base({ activeToolId: 'brush', zoom: 2 }))
    expect(brush.id).toBe('brush')
    expect(brush.css).toBe('none')
    expect(brush.tipRing?.diameterPx).toBe(40)
    expect(brush.tipRing?.shape).toBe('circle')
    expect(brush.tipRing?.hardnessGhostPx).toBeCloseTo(34, 5)

    const pencil = resolveViewportCursor(
      base({ activeToolId: 'pencil', zoom: 2, brushSizeDocPx: 3.4 }),
    )
    expect(pencil.id).toBe('brush')
    expect(pencil.tipRing?.mode).toBe('pencil')
    expect(pencil.tipRing?.shape).toBe('square')
    // Integer document stamp side × zoom (3 × 2).
    expect(pencil.tipRing?.diameterPx).toBe(6)
    expect(pencil.tipRing?.hardnessGhostPx).toBeNull()

    expect(
      resolveViewportCursor(
        base({ activeToolId: 'brush', altHeld: true }),
      ).id,
    ).toBe('eyedropper')

    expect(
      resolveViewportCursor(
        base({ activeToolId: 'eraser', canPaint: false }),
      ).id,
    ).toBe('not-allowed')

    expect(
      resolveViewportCursor(
        base({ activeToolId: 'brush', precisionHeld: true }),
      ).id,
    ).toBe('precision')
  })

  test('eraser uses dashed tip mode', () => {
    const r = resolveViewportCursor(base({ activeToolId: 'eraser' }))
    expect(r.tipRing?.mode).toBe('eraser')
  })

  test('retouch tools use the shared tip ring', () => {
    for (const [tool, id] of [
      ['cloneStamp', 'stamp'],
      ['historyBrush', 'stamp'],
      ['patternStamp', 'stamp'],
      ['smudge', 'smudge'],
      ['blur', 'blur'],
      ['sharpen', 'sharpen'],
      ['dodge', 'dodge'],
      ['burn', 'burn'],
      ['sponge', 'sponge'],
      ['spotHealing', 'spot-heal'],
      ['healingBrush', 'heal'],
      ['liquifyWarp', 'liquify'],
      ['liquifyReconstruct', 'liquify-reconstruct'],
      ['liquifyBloat', 'liquify-bloat'],
      ['liquifyPucker', 'liquify-pucker'],
      ['liquifyTwirl', 'liquify-twirl'],
      ['liquifyFreeze', 'liquify-freeze'],
      ['liquifyThaw', 'liquify-thaw'],
    ] as const) {
      const cursor = resolveViewportCursor(base({ activeToolId: tool }))
      expect(cursor.id).toBe(id)
      expect(cursor.css).toBe('none')
      expect(cursor.tipRing?.mode).toBe('brush')
      expect(cursor.tipRing?.hardnessGhostPx).toBeCloseTo(17, 5)
    }
  })

  test('Alt source assignment keeps Clone Stamp cursor static', () => {
    const cursor = resolveViewportCursor(
      base({ activeToolId: 'cloneStamp', altHeld: true }),
    )
    expect(cursor.id).toBe('stamp')
    expect(cursor.tipRing).toBeNull()
  })

  test('Alt source assignment keeps Healing Brush cursor static', () => {
    const cursor = resolveViewportCursor(
      base({ activeToolId: 'healingBrush', altHeld: true }),
    )
    expect(cursor.id).toBe('heal')
    expect(cursor.tipRing).toBeNull()
  })

  test('precise preference and giant rings fall back to crosshair', () => {
    expect(
      resolveViewportCursor(
        base({ activeToolId: 'brush', brushCursorPreference: 'precise' }),
      ).id,
    ).toBe('precision')
    expect(
      resolveViewportCursor(
        base({ activeToolId: 'brush', brushSizeDocPx: 2001 }),
      ).id,
    ).toBe('precision')
  })

  test('transform handle cursors', () => {
    expect(
      resolveViewportCursor(base({ hoverHandle: 'rotate' })).id,
    ).toBe('rotate')
    expect(resolveViewportCursor(base({ hoverHandle: 'se' })).id).toBe(
      'resize-se',
    )
    expect(
      resolveViewportCursor(
        base({ hoverHandle: 'e', hoverHandleRotationDeg: 90 }),
      ).id,
    ).toBe('resize-s')
  })

  test('outside canvas → default', () => {
    expect(resolveViewportCursor(base({ overCanvas: false })).id).toBe('default')
  })
})

describe('tipDiameterScreenPx', () => {
  test('size × zoom', () => {
    expect(tipDiameterScreenPx(20, 1)).toBe(20)
    expect(tipDiameterScreenPx(20, 0.5)).toBe(10)
  })
})

describe('resizeCursorIdForHandle', () => {
  test('snaps with rotation', () => {
    expect(resizeCursorIdForHandle('n', 0)).toBe('resize-n')
    expect(resizeCursorIdForHandle('n', 45)).toBe('resize-ne')
  })
})
