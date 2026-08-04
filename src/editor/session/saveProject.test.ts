import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../core/document'
import { ProjectConflictError } from '../../persistence'
import type {
  ProjectLocator,
  ProjectSaveTransaction,
  ProjectSnapshot,
  ProjectStore,
} from '../../persistence'
import { useEditorSessionStore } from './EditorSessionStore'
import {
  saveActiveProject,
  saveActiveProjectAs,
  type SaveProjectDeps,
} from './saveProject'

const ORIGINAL = 'projects/Original.happyshop'
const COPY = 'projects/Copy.happyshop'

type Recorded = {
  opened: string[]
  saved: { path: string | null; expectedRevision: string | null }[]
  recents: { path: string; name: string }[]
}

/**
 * Minimal in-memory ProjectStore: `revisions` seeds what `open()` reports per
 * path so tests can assert Save As commits against the *destination's*
 * revision rather than the one the session was carrying.
 */
function fakeStore(options: {
  revisions?: Record<string, string>
  onSave?: () => never
} = {}) {
  const recorded: Recorded = { opened: [], saved: [], recents: [] }
  let locator: ProjectLocator | null = null
  let counter = 0

  const store: ProjectStore = {
    get openLocator() {
      return locator
    },
    async open(target: ProjectLocator): Promise<ProjectSnapshot> {
      recorded.opened.push(target.path)
      locator = { kind: 'directory', path: target.path || 'projects/Untitled.happyshop' }
      return {
        locator,
        revision: options.revisions?.[locator.path] ?? `opened-${++counter}`,
        document: createEmptyDocument({ name: 'On Disk' }),
        assets: {},
      }
    },
    async readAsset() {
      throw new Error('not used')
    },
    async save(transaction: ProjectSaveTransaction) {
      recorded.saved.push({
        path: locator?.path ?? null,
        expectedRevision: transaction.expectedRevision,
      })
      options.onSave?.()
      return `saved-${++counter}`
    },
    async exportFile() {},
  }

  const deps: SaveProjectDeps = {
    getStore: () => store,
    collectAssets: async () => [],
    rememberRecent: (path, name) => recorded.recents.push({ path, name }),
    afterSave: async () => {},
  }

  return { store, deps, recorded }
}

function bindTo(path: string | null, revision: string | null): void {
  useEditorSessionStore.setState({
    document: createEmptyDocument({ name: 'Sunset' }),
    dirty: true,
    project: { projectPath: path, revision },
  })
}

beforeEach(() => {
  bindTo(ORIGINAL, 'rev-original')
})

describe('saveActiveProject', () => {
  test('saves to the bound path with the session revision', async () => {
    const { store, deps, recorded } = fakeStore()
    await store.open({ kind: 'directory', path: ORIGINAL })
    recorded.opened.length = 0

    const result = await saveActiveProject(deps)

    expect(result).toMatchObject({ ok: true, path: ORIGINAL })
    // Already open at that locator → no redundant re-open.
    expect(recorded.opened).toEqual([])
    expect(recorded.saved).toEqual([
      { path: ORIGINAL, expectedRevision: 'rev-original' },
    ])
    expect(useEditorSessionStore.getState().project.projectPath).toBe(ORIGINAL)
    expect(useEditorSessionStore.getState().dirty).toBe(false)
  })
})

describe('saveActiveProjectAs', () => {
  test('opens the destination and saves with that project’s revision', async () => {
    const { store, deps, recorded } = fakeStore({
      revisions: { [COPY]: 'rev-copy' },
    })
    await store.open({ kind: 'directory', path: ORIGINAL })
    recorded.opened.length = 0

    const result = await saveActiveProjectAs(COPY, deps)

    expect(result).toMatchObject({ ok: true, path: COPY })
    expect(recorded.opened).toEqual([COPY])
    // The stale `rev-original` must never reach the destination transaction.
    expect(recorded.saved).toEqual([{ path: COPY, expectedRevision: 'rev-copy' }])
  })

  test('rebinds the session to the new destination and marks it clean', async () => {
    const { deps, recorded } = fakeStore()

    const result = await saveActiveProjectAs(COPY, deps)

    expect(result.ok).toBe(true)
    const session = useEditorSessionStore.getState()
    expect(session.project.projectPath).toBe(COPY)
    expect(session.project.revision).toBe(
      result.ok ? result.revision : 'unreachable',
    )
    expect(session.dirty).toBe(false)
    expect(recorded.recents).toEqual([{ path: COPY, name: 'Sunset' }])
  })

  test('re-opens even when the store already points at the destination', async () => {
    const { store, deps, recorded } = fakeStore()
    await store.open({ kind: 'directory', path: COPY })
    recorded.opened.length = 0

    await saveActiveProjectAs(COPY, deps)

    expect(recorded.opened).toEqual([COPY])
  })

  test('leaves the original binding in place when the destination is unsafe', async () => {
    const { deps, recorded } = fakeStore()

    for (const bad of ['projects/../etc.happyshop', '/etc/passwd', '', 'x.happyshop']) {
      const result = await saveActiveProjectAs(bad, deps)
      expect(result.ok).toBe(false)
    }

    expect(recorded.opened).toEqual([])
    expect(recorded.saved).toEqual([])
    expect(useEditorSessionStore.getState().project).toEqual({
      projectPath: ORIGINAL,
      revision: 'rev-original',
    })
  })

  test('restores the original binding when the destination save fails', async () => {
    const { deps } = fakeStore({
      onSave: () => {
        throw new Error('disk full')
      },
    })

    const result = await saveActiveProjectAs(COPY, deps)

    expect(result).toEqual({ ok: false, error: 'disk full' })
    expect(useEditorSessionStore.getState().project).toEqual({
      projectPath: ORIGINAL,
      revision: 'rev-original',
    })
    expect(useEditorSessionStore.getState().dirty).toBe(true)
  })

  test('reports a revision conflict on the destination', async () => {
    const { deps } = fakeStore({
      onSave: () => {
        throw new ProjectConflictError(
          'rev-theirs',
          createEmptyDocument({ name: 'Theirs' }),
        )
      },
    })

    const result = await saveActiveProjectAs(COPY, deps)

    expect(result).toEqual({ ok: false, conflict: true, currentRevision: 'rev-theirs' })
    expect(useEditorSessionStore.getState().project.projectPath).toBe(ORIGINAL)
  })
})
