import { describe, expect, test } from 'bun:test'
import {
  createBrowserProjectSnapshot,
  isProjectBridgeEnabled,
  ProjectClient,
} from './ProjectClient'

describe('ProjectClient static host mode', () => {
  test('createBrowserProjectSnapshot is a usable in-memory project', () => {
    const snap = createBrowserProjectSnapshot()
    expect(snap.workspace.activeDocument).toBe('demo')
    expect(snap.documents).toEqual([])
    expect(snap.project.defaultDocument).toBe('demo')
  })

  test('fetchProject resolves without hitting the Vite bridge outside DEV', async () => {
    // Unit tests run under bun (not Vite DEV); bridge must not be required.
    expect(isProjectBridgeEnabled()).toBe(false)
    const client = new ProjectClient()
    const snap = await client.fetchProject()
    expect(snap.workspace.activeDocument).toBe('demo')
    await expect(client.saveWorkspace(snap.workspace)).resolves.toEqual({
      ok: true,
      revision: 'browser',
    })
  })
})
