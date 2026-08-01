import type {
  AssetId,
  ExportRequest,
  ProjectLocator,
  ProjectRevision,
  ProjectSaveTransaction,
  ProjectSnapshot,
  ProjectStore,
} from './types'
import { parseManifest } from './manifest'

const API = '/__happyshop/api'

/** Vite `configureServer` bridge — only present under `bun run dev`. */
function assertBridgeEnabled(): void {
  if (import.meta.env.DEV !== true) {
    throw new Error(
      'Project bridge is only available in local dev (`bun run dev`)',
    )
  }
}

export class ProjectConflictError extends Error {
  readonly currentRevision: ProjectRevision
  readonly document: ProjectSnapshot['document']

  constructor(
    currentRevision: ProjectRevision,
    document: ProjectSnapshot['document'],
  ) {
    super('revision conflict')
    this.name = 'ProjectConflictError'
    this.currentRevision = currentRevision
    this.document = document
  }
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  })
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Project bridge unavailable (HTTP ${res.status}, expected JSON)`,
    )
  }
  const body = (await res.json()) as T
  return { status: res.status, body }
}

/**
 * Browser-side ProjectStore talking to the Vite bridge (SPEC §13.2–13.3).
 * Binary assets travel as PUT bodies; manifest is JSON with revision checks.
 */
export class BridgeProjectStore implements ProjectStore {
  private locator: ProjectLocator | null = null

  get openLocator(): ProjectLocator | null {
    return this.locator
  }

  async open(locator: ProjectLocator): Promise<ProjectSnapshot> {
    assertBridgeEnabled()
    const { status, body } = await requestJson<{
      error?: string
      locator?: ProjectLocator
      revision?: string
      document?: ProjectSnapshot['document']
      assets?: ProjectSnapshot['assets']
    }>(`${API}/projects/open`, {
      method: 'POST',
      body: JSON.stringify({ path: locator.path }),
      signal: undefined,
    })
    if (status !== 200 || !body.document || !body.revision || !body.assets) {
      throw new Error(body.error ?? `open failed (${status})`)
    }
    this.locator = body.locator ?? locator
    return {
      locator: this.locator,
      revision: body.revision,
      document: body.document,
      assets: body.assets,
    }
  }

  async readAsset(id: AssetId, signal?: AbortSignal): Promise<Blob> {
    assertBridgeEnabled()
    const res = await fetch(`${API}/assets/${encodeURIComponent(id)}`, {
      signal,
      headers: { Accept: '*/*' },
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(err?.error ?? `asset read failed (${res.status})`)
    }
    return res.blob()
  }

  async save(
    transaction: ProjectSaveTransaction,
    signal?: AbortSignal,
  ): Promise<ProjectRevision> {
    assertBridgeEnabled()
    // Stage binaries first, then commit the manifest transaction atomically.
    for (const asset of transaction.assets) {
      const buf = await asset.blob.arrayBuffer()
      const res = await fetch(`${API}/assets/${encodeURIComponent(asset.id)}`, {
        method: 'PUT',
        signal,
        headers: {
          'Content-Type': asset.mimeType ?? 'application/octet-stream',
          'X-HappyShop-Asset-Kind': asset.kind,
          ...(asset.width != null
            ? { 'X-HappyShop-Width': String(asset.width) }
            : {}),
          ...(asset.height != null
            ? { 'X-HappyShop-Height': String(asset.height) }
            : {}),
        },
        body: buf,
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(err?.error ?? `asset write failed (${res.status})`)
      }
    }

    const { status, body } = await requestJson<{
      error?: string
      revision?: string
      currentRevision?: string
      document?: ProjectSnapshot['document']
      manifest?: unknown
    }>(`${API}/projects/save`, {
      method: 'PUT',
      signal,
      body: JSON.stringify({
        expectedRevision: transaction.expectedRevision,
        document: transaction.document,
        removedAssetIds: transaction.removedAssetIds ?? [],
        assetIds: transaction.assets.map((a) => a.id),
      }),
    })

    if (status === 409 && body.currentRevision && body.document) {
      throw new ProjectConflictError(body.currentRevision, body.document)
    }
    if (status !== 200 || !body.revision) {
      throw new Error(body.error ?? `save failed (${status})`)
    }
    return body.revision
  }

  async exportFile(request: ExportRequest, signal?: AbortSignal): Promise<void> {
    assertBridgeEnabled()
    const buf = await request.blob.arrayBuffer()
    const res = await fetch(`${API}/export`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': request.blob.type || 'application/octet-stream',
        'X-HappyShop-Destination': request.destinationPath,
        'X-HappyShop-Format': request.format,
      },
      body: buf,
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(err?.error ?? `export failed (${res.status})`)
    }
  }

  /** Convenience: fetch the currently open project's snapshot. */
  async fetchActive(): Promise<ProjectSnapshot | null> {
    if (import.meta.env.DEV !== true) return null
    const { status, body } = await requestJson<{
      open?: boolean
      locator?: ProjectLocator
      revision?: string
      document?: ProjectSnapshot['document']
      assets?: ProjectSnapshot['assets']
      manifest?: unknown
      error?: string
    }>(`${API}/projects/active`)
    if (status === 404 || body.open === false) return null
    if (status !== 200 || !body.document || !body.revision || !body.locator) {
      throw new Error(body.error ?? 'no active project')
    }
    this.locator = body.locator
    if (body.manifest) parseManifest(body.manifest)
    return {
      locator: body.locator,
      revision: body.revision,
      document: body.document,
      assets: body.assets ?? {},
    }
  }
}

let singleton: BridgeProjectStore | null = null

export function getBridgeProjectStore(): BridgeProjectStore {
  if (!singleton) singleton = new BridgeProjectStore()
  return singleton
}
