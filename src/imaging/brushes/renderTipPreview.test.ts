import { describe, expect, test } from 'bun:test'
import { PROCEDURAL_TIPS } from './presets/proc'
import { renderTipPreview } from './renderTipPreview'

const request = {
  tip: PROCEDURAL_TIPS[1]!,
  size: 24,
  hardness: 0.35,
  opacity: 1,
  flow: 1,
  spacing: 0.25,
  angle: 0,
  roundness: 1,
  color: '#123456',
  mode: 'paint' as const,
  width: 296,
  height: 64,
  dpr: 1,
}

describe('renderTipPreview', () => {
  test('is deterministic and paints non-transparent pixels', () => {
    const first = renderTipPreview(request)
    const second = renderTipPreview(request)
    expect(first.data).toEqual(second.data)
    let alpha = 0
    for (let i = 3; i < first.data.length; i += 4) alpha += first.data[i]!
    expect(alpha).toBeGreaterThan(0)
  })
})
