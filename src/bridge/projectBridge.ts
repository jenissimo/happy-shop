import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  watch,
  type FSWatcher,
} from 'node:fs'
import { join, relative } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import type { EditorDocument } from '../core/legacyDocument.ts'
import {
  PATHS,
  atomicWrite,
  ensureEditorDirs,
  revisionOf,
} from './paths.ts'
import {
  deleteUnusedAsset,
  getOpenedProject,
  openProjectDirectory,
  readAssetBytes,
  readOpenedSnapshot,
  saveProject,
  stageAsset,
  writeExportFile,
} from './happyshopProject.ts'
export type WorkspaceFile = {
  version: number
  layout: unknown
  preferences: Record<string, unknown>
  pan?: { x: number; y: number }
  activeDocument?: string
}

export type DocumentListItem = {
  id: string
  name: string
  relativePath: string
  revision: string
}

type DocumentFile = {
  id: string
  name: string
  path: string
  relativePath: string
  revision: string
  document: EditorDocument
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function broadcast(server: ViteDevServer, event: string, data: unknown) {
  server.ws.send({ type: 'custom', event, data })
}

function loadWorkspace(): WorkspaceFile {
  ensureEditorDirs()
  const path = join(PATHS.EDITOR_DIR, 'workspace.json')
  if (!existsSync(path)) {
    const empty: WorkspaceFile = {
      version: 1,
      layout: null,
      preferences: {},
      activeDocument: PATHS.PROJECT_CONFIG.defaultDocument ?? 'demo',
      pan: { x: 0, y: 0 },
    }
    atomicWrite(path, `${JSON.stringify(empty, null, 2)}\n`)
    return empty
  }
  return JSON.parse(readFileSync(path, 'utf8')) as WorkspaceFile
}

function readDocumentFile(path: string): DocumentFile {
  const raw = readFileSync(path, 'utf8')
  const document = JSON.parse(raw) as EditorDocument
  const name = document.name || path.replace(/\.json$/i, '').split(/[/\\]/).pop()!
  const relativePath = relative(PATHS.ROOT, path).replace(/\\/g, '/')
  return {
    id: name,
    name,
    path,
    relativePath,
    revision: revisionOf(raw),
    document,
  }
}

function listDocuments(): DocumentFile[] {
  ensureEditorDirs()
  const dir = PATHS.DOCUMENTS_DIR
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readDocumentFile(join(dir, f)))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function writeDocumentJson(
  document: EditorDocument,
  path: string,
): { path: string; revision: string } {
  const contents = `${JSON.stringify(document, null, 2)}\n`
  atomicWrite(path, contents)
  return { path, revision: revisionOf(contents) }
}

export function editorProjectBridge(): Plugin {
  let watchers: FSWatcher[] = []
  let serverRef: ViteDevServer | null = null
  let debounce: ReturnType<typeof setTimeout> | null = null

  const notify = (event: string, data: unknown) => {
    if (!serverRef) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      broadcast(serverRef!, event, data)
    }, 40)
  }

  const attachWatchers = () => {
    for (const w of watchers) w.close()
    watchers = []
    ensureEditorDirs()
    const dirs = [PATHS.DOCUMENTS_DIR, PATHS.EDITOR_DIR]
    for (const dir of dirs) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      try {
        const w = watch(dir, { recursive: true }, (_kind, filename) => {
          if (!filename) return
          const name = filename.toString().replace(/\\/g, '/')
          if (name.endsWith('.tmp')) return
          if (dir === PATHS.DOCUMENTS_DIR && name.endsWith('.json')) {
            try {
              const base = name.includes('/') ? name.split('/').pop()! : name
              const full = join(PATHS.DOCUMENTS_DIR, base)
              if (existsSync(full)) {
                const file = readDocumentFile(full)
                notify('he:document-changed', {
                  id: file.id,
                  name: file.name,
                  revision: file.revision,
                  relativePath: file.relativePath,
                })
              } else {
                notify('he:document-changed', {
                  name: base.replace(/\.json$/i, ''),
                })
              }
            } catch {
              notify('he:document-changed', { error: true, name })
            }
          } else if (dir === PATHS.EDITOR_DIR) {
            notify('he:workspace-changed', { name })
          }
        })
        watchers.push(w)
      } catch {
        /* watch may fail on some FS */
      }
    }
  }

  return {
    name: 'editor-project-bridge',
    configureServer(server) {
      serverRef = server
      ensureEditorDirs()
      attachWatchers()

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? ''
        if (!url.startsWith('/__happyshop/')) return next()

        try {
          if (url === '/__happyshop/api/capabilities' && req.method === 'GET') {
            return sendJson(res, 200, {
              maxSide: 8192,
              softMegapixelLimit: 64,
              codecs: ['png', 'jpeg', 'webp'],
              renderer: ['webgl2'],
              projectFormat: 'directory-v1',
            })
          }

          if (url === '/__happyshop/api/projects/open' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req)) as { path?: string }
            const opened = openProjectDirectory(body.path)
            return sendJson(res, 200, {
              locator: opened.locator,
              revision: opened.manifest.revision,
              document: opened.manifest.document,
              assets: opened.manifest.assets,
            })
          }

          if (url === '/__happyshop/api/projects/active' && req.method === 'GET') {
            const opened = getOpenedProject()
            if (!opened) {
              return sendJson(res, 404, { open: false, error: 'no project open' })
            }
            const snap = readOpenedSnapshot()
            return sendJson(res, 200, {
              open: true,
              locator: snap.locator,
              revision: snap.manifest.revision,
              document: snap.manifest.document,
              assets: snap.manifest.assets,
              manifest: snap.manifest,
            })
          }

          if (url === '/__happyshop/api/projects/save' && req.method === 'PUT') {
            if (!getOpenedProject()) openProjectDirectory(null)
            const body = JSON.parse(await readBody(req)) as {
              expectedRevision: string | null
              document: import('../core/document/schema.ts').HappyDocument
              removedAssetIds?: string[]
              assetIds?: string[]
            }
            const result = saveProject(body)
            if (!result.ok) {
              return sendJson(res, 409, {
                error: 'revision conflict',
                currentRevision: result.currentRevision,
                document: result.document,
              })
            }
            return sendJson(res, 200, {
              ok: true,
              revision: result.revision,
              manifest: result.manifest,
            })
          }

          const assetMatch = url.match(
            /^\/__happyshop\/api\/assets\/([^/]+)$/,
          )
          if (assetMatch) {
            const id = decodeURIComponent(assetMatch[1]!)
            if (!getOpenedProject()) openProjectDirectory(null)

            if (req.method === 'GET') {
              try {
                const bytes = readAssetBytes(id)
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/octet-stream')
                res.setHeader('Cache-Control', 'no-cache')
                res.end(bytes)
                return
              } catch (e) {
                return sendJson(res, 404, {
                  error: e instanceof Error ? e.message : 'not found',
                })
              }
            }

            if (req.method === 'PUT') {
              const chunks: Buffer[] = []
              await new Promise<void>((resolveBody, reject) => {
                req.on('data', (c) =>
                  chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
                )
                req.on('end', () => resolveBody())
                req.on('error', reject)
              })
              const bytes = Buffer.concat(chunks)
              const kind =
                (req.headers['x-happyshop-asset-kind'] as string | undefined) ??
                'layer'
              const widthHeader = req.headers['x-happyshop-width']
              const heightHeader = req.headers['x-happyshop-height']
              const descriptor = stageAsset(id, kind, bytes, {
                width: widthHeader ? Number(widthHeader) : undefined,
                height: heightHeader ? Number(heightHeader) : undefined,
                mimeType:
                  typeof req.headers['content-type'] === 'string'
                    ? req.headers['content-type']
                    : undefined,
              })
              return sendJson(res, 200, { ok: true, asset: descriptor })
            }

            if (req.method === 'DELETE') {
              deleteUnusedAsset(id)
              return sendJson(res, 200, { ok: true })
            }
          }

          if (url === '/__happyshop/api/export' && req.method === 'POST') {
            const dest = req.headers['x-happyshop-destination']
            if (typeof dest !== 'string' || !dest) {
              return sendJson(res, 400, { error: 'missing destination' })
            }
            const chunks: Buffer[] = []
            await new Promise<void>((resolveBody, reject) => {
              req.on('data', (c) =>
                chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
              )
              req.on('end', () => resolveBody())
              req.on('error', reject)
            })
            const written = writeExportFile(dest, Buffer.concat(chunks))
            return sendJson(res, 200, { ok: true, path: written.path })
          }

          if (url === '/__happyshop/api/project' && req.method === 'GET') {
            return sendJson(res, 200, {
              project: PATHS.PROJECT_CONFIG,
              workspace: loadWorkspace(),
              documents: listDocuments().map((d) => ({
                id: d.id,
                name: d.name,
                relativePath: d.relativePath,
                revision: d.revision,
              })),
              root: PATHS.ROOT,
              packageRoot: PATHS.PACKAGE_ROOT,
              rootSource: PATHS.PROJECT_ROOT_SOURCE,
              paths: {
                documents: PATHS.DOCUMENTS_DIR,
                editor: PATHS.EDITOR_DIR,
              },
            })
          }

          if (url === '/__happyshop/api/workspace' && req.method === 'GET') {
            return sendJson(res, 200, loadWorkspace())
          }

          if (url === '/__happyshop/api/workspace' && req.method === 'PUT') {
            const body = JSON.parse(await readBody(req)) as WorkspaceFile
            const path = join(PATHS.EDITOR_DIR, 'workspace.json')
            atomicWrite(path, `${JSON.stringify(body, null, 2)}\n`)
            return sendJson(res, 200, {
              ok: true,
              revision: revisionOf(JSON.stringify(body)),
            })
          }

          if (url === '/__happyshop/api/documents' && req.method === 'GET') {
            return sendJson(res, 200, {
              documents: listDocuments().map((d) => ({
                id: d.id,
                name: d.name,
                relativePath: d.relativePath,
                revision: d.revision,
              })),
            })
          }

          const docMatch = url.match(
            /^\/__happyshop\/api\/documents\/([^/?]+)(.*)$/,
          )
          if (docMatch) {
            const key = decodeURIComponent(docMatch[1]!)
            const docs = listDocuments()
            const file =
              docs.find((d) => d.name === key || d.id === key) ??
              (existsSync(join(PATHS.DOCUMENTS_DIR, `${key}.json`))
                ? readDocumentFile(join(PATHS.DOCUMENTS_DIR, `${key}.json`))
                : null)

            if (req.method === 'GET') {
              if (!file) return sendJson(res, 404, { error: 'document not found' })
              return sendJson(res, 200, {
                document: file.document,
                revision: file.revision,
                relativePath: file.relativePath,
              })
            }

            if (req.method === 'PUT') {
              const body = JSON.parse(await readBody(req)) as {
                document: EditorDocument
                expectedRevision?: string
              }
              if (
                file &&
                body.expectedRevision &&
                body.expectedRevision !== file.revision
              ) {
                return sendJson(res, 409, {
                  error: 'revision conflict',
                  currentRevision: file.revision,
                  document: file.document,
                })
              }
              const { path, revision } = writeDocumentJson(
                body.document,
                file?.path ??
                  join(PATHS.DOCUMENTS_DIR, `${body.document.name}.json`),
              )
              return sendJson(res, 200, {
                ok: true,
                revision,
                path: relative(PATHS.ROOT, path).replace(/\\/g, '/'),
              })
            }
          }

          if (url === '/__happyshop/api/layouts' && req.method === 'GET') {
            const dir = join(PATHS.EDITOR_DIR, 'layouts')
            mkdirSync(dir, { recursive: true })
            const presets = readdirSync(dir)
              .filter((f) => f.endsWith('.json'))
              .map((f) => f.replace(/\.json$/, ''))
            return sendJson(res, 200, { presets })
          }

          if (url.startsWith('/__happyshop/api/layouts/') && req.method === 'PUT') {
            const name = decodeURIComponent(
              url.slice('/__happyshop/api/layouts/'.length).split('?')[0]!,
            )
            const safe = name.replace(/[^a-zA-Z0-9_-]/g, '')
            const body = JSON.parse(await readBody(req))
            const path = join(PATHS.EDITOR_DIR, 'layouts', `${safe}.json`)
            atomicWrite(path, `${JSON.stringify(body, null, 2)}\n`)
            return sendJson(res, 200, { ok: true, name: safe })
          }

          if (url.startsWith('/__happyshop/api/layouts/') && req.method === 'GET') {
            const name = decodeURIComponent(
              url.slice('/__happyshop/api/layouts/'.length).split('?')[0]!,
            )
            const path = join(
              PATHS.EDITOR_DIR,
              'layouts',
              `${name.replace(/[^a-zA-Z0-9_-]/g, '')}.json`,
            )
            if (!existsSync(path)) return sendJson(res, 404, { error: 'not found' })
            return sendJson(res, 200, JSON.parse(readFileSync(path, 'utf8')))
          }          return sendJson(res, 404, { error: 'not found' })
        } catch (e) {
          return sendJson(res, 500, {
            error: e instanceof Error ? e.message : 'Internal error',
          })
        }
      })
    },
    buildEnd() {
      for (const w of watchers) w.close()
      watchers = []
    },
  }
}
