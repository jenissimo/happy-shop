import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDocument } from '../core/document/factories.ts'
import {
  openProjectDirectory,
  saveProject,
  stageAsset,
} from './happyshopProject.ts'

describe('happyshopProject atomic save', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    dirs.length = 0
  })

  test('save advances revision and rejects stale expectedRevision', () => {
    const dir = mkdtempSync(join(tmpdir(), 'happyshop-'))
    dirs.push(dir)
    const projectDir = join(dir, 'Demo.happyshop')
    const opened = openProjectDirectory(projectDir)
    const firstRev = opened.manifest.revision

    const doc = createEmptyDocument({ name: 'Demo' })
    const ok = saveProject({
      expectedRevision: firstRev,
      document: doc,
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return

    const conflict = saveProject({
      expectedRevision: firstRev,
      document: createEmptyDocument({ name: 'Stale' }),
    })
    expect(conflict.ok).toBe(false)
    if (conflict.ok) return
    expect(conflict.conflict).toBe(true)
    expect(conflict.currentRevision).toBe(ok.revision)

    const manifest = JSON.parse(
      readFileSync(join(projectDir, 'manifest.json'), 'utf8'),
    ) as { revision: string; document: { name: string } }
    expect(manifest.revision).toBe(ok.revision)
    expect(manifest.document.name).toBe('Demo')
  })

  test('stageAsset writes layer PNG under layers/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'happyshop-'))
    dirs.push(dir)
    const projectDir = join(dir, 'Asset.happyshop')
    openProjectDirectory(projectDir)
    stageAsset('layer1', 'layer', Buffer.from([137, 80, 78, 71]), {
      width: 1,
      height: 1,
      mimeType: 'image/png',
    })
    const bytes = readFileSync(join(projectDir, 'layers', 'layer1.png'))
    expect(bytes[0]).toBe(137)
  })
})
