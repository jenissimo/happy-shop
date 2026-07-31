import { describe, expect, test } from 'bun:test'
import { convertAbrToUserTips, type AbrDocument } from './abrImport'

describe('convertAbrToUserTips', () => {
  test('converts sampled ABR brushes to user-pack stamp descriptors', () => {
    const abr: AbrDocument = {
      brushes: [{
        name: '  Chalk  ',
        shape: {
          type: 'sampled',
          size: 42,
          angle: 15,
          roundness: 0.7,
          spacing: 0.4,
          sampledData: 'sample-1',
        },
      }],
      samples: [{
        id: 'sample-1',
        bounds: { w: 2, h: 2 },
        alpha: new Uint8Array([0, 64, 128, 255]),
      }],
    }

    const [tip] = convertAbrToUserTips(abr, () => 'user.chalk')

    expect(tip).toEqual({
      descriptor: expect.objectContaining({
        id: 'user.chalk',
        name: 'Chalk',
        pack: 'user',
        kind: 'stamp',
        spacing: 0.4,
        texture: {
          src: 'indexeddb://happy-shop-user-brushes/user.chalk',
          width: 2,
          height: 2,
        },
        license: expect.objectContaining({ spdx: 'User-supplied' }),
      }),
      alpha: { data: new Uint8ClampedArray([0, 64, 128, 255]), width: 2, height: 2 },
    })
  })

  test('keeps unsupported ABR shapes as procedural descriptors', () => {
    const abr: AbrDocument = {
      brushes: [{
        name: '',
        shape: {
          type: 'dynamic',
          size: 24,
          angle: 0,
          spacing: 9,
        },
      }],
      samples: [],
    }

    const [tip] = convertAbrToUserTips(abr, () => 'user.dynamic')

    expect(tip).toEqual(expect.objectContaining({
      descriptor: expect.objectContaining({
        id: 'user.dynamic',
        name: 'Imported brush 1',
        kind: 'procedural',
        spacing: 2,
        defaults: { size: 24 },
      }),
    }))
    expect(tip.alpha).toBeUndefined()
  })
})
