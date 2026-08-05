import { describe, expect, it } from 'bun:test'
import { acquireApplication, releaseApplication } from './applicationRegistry'

describe('acquireApplication', () => {
  it('builds one Application per canvas even when a mount is torn down mid-init', async () => {
    const canvas = {}
    let built = 0
    // React StrictMode: the first mount starts init, is torn down before it
    // resolves, and the second mount asks for the same canvas.
    const create = async () => {
      built += 1
      await Promise.resolve()
      return { id: built }
    }
    const first = acquireApplication(canvas, create)
    const second = acquireApplication(canvas, create)

    expect(await first).toBe(await second)
    expect(built).toBe(1)
  })

  it('gives a different canvas its own Application', async () => {
    let built = 0
    const create = async () => ({ id: ++built })
    await acquireApplication({}, create)
    await acquireApplication({}, create)
    expect(built).toBe(2)
  })

  it('builds a fresh Application after release', async () => {
    const canvas = {}
    let built = 0
    const create = async () => ({ id: ++built })
    const first = await acquireApplication(canvas, create)
    releaseApplication(canvas)
    const second = await acquireApplication(canvas, create)
    expect(second).not.toBe(first)
    expect(built).toBe(2)
  })

  it('treats the replacement canvas of a hard reload as its own identity', async () => {
    // A hard reload destroys the backend (releasing the old canvas) and mounts
    // a new element, because the old one's GL context is permanently lost.
    const first = {}
    let built = 0
    const create = async () => ({ id: ++built })
    const before = await acquireApplication(first, create)
    releaseApplication(first)
    const second = {}
    const after = await acquireApplication(second, create)
    expect(after).not.toBe(before)
    // And the new canvas still gets exactly one Application, not one per mount.
    expect(await acquireApplication(second, create)).toBe(after)
    expect(built).toBe(2)
  })

  it('does not poison a canvas when init fails', async () => {
    const canvas = {}
    let attempts = 0
    const failing = async () => {
      attempts += 1
      throw new Error('no webgl')
    }
    await expect(acquireApplication(canvas, failing)).rejects.toThrow('no webgl')
    await expect(acquireApplication(canvas, failing)).rejects.toThrow('no webgl')
    expect(attempts).toBe(2)
  })
})
