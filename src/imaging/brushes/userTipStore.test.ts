import { describe, expect, test } from 'bun:test'
import type { ImportedUserTip } from './abrImport'
import {
  listUserTipDescriptors,
  loadUserTipAlpha,
  saveUserTips,
} from './userTipStore'

function sampleTip(id: string): ImportedUserTip {
  return {
    descriptor: {
      id,
      name: `Imported ${id}`,
      pack: 'user',
      kind: 'stamp',
      hardness: 0.5,
      roundness: 1,
      angle: 0,
      spacing: 0.25,
      defaults: {},
      license: {
        spdx: 'User-supplied',
        pack: 'Imported by this user',
        source: 'https://local.invalid/happy-shop/user-brush-import',
      },
      texture: {
        src: `indexeddb://happy-shop-user-brushes/${id}`,
        width: 2,
        height: 2,
      },
    },
    alpha: {
      data: new Uint8ClampedArray([0, 64, 128, 255]),
      width: 2,
      height: 2,
    },
  }
}

const hasIndexedDb = typeof indexedDB !== 'undefined'

describe('userTipStore', () => {
  test('returns empty descriptors when IndexedDB is unavailable', async () => {
    if (hasIndexedDb) return
    expect(await listUserTipDescriptors()).toEqual([])
    expect(await loadUserTipAlpha('user.missing')).toBeUndefined()
    expect(saveUserTips([sampleTip('user.missing')])).rejects.toThrow(
      'IndexedDB is unavailable',
    )
  })

  test.skipIf(!hasIndexedDb)('persists imported tips and reloads descriptors plus alpha', async () => {
    const id = `user.test-${crypto.randomUUID().replaceAll('-', '')}`
    await saveUserTips([sampleTip(id)])

    const descriptors = await listUserTipDescriptors()
    expect(descriptors.some((tip) => tip.id === id)).toBe(true)

    const alpha = await loadUserTipAlpha(id)
    expect(alpha).toEqual({
      data: new Uint8ClampedArray([0, 64, 128, 255]),
      width: 2,
      height: 2,
    })
  })

  test.skipIf(!hasIndexedDb)('ignores non-user descriptors when listing', async () => {
    const id = `user.nonuser-${crypto.randomUUID().replaceAll('-', '')}`
    const tip = sampleTip(id)
    tip.descriptor.pack = 'other'
    await saveUserTips([tip])

    const descriptors = await listUserTipDescriptors()
    expect(descriptors.some((entry) => entry.id === id)).toBe(false)
  })
})
