import type { EditorDocument } from '../../core/legacyDocument'

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

export type ProjectSnapshot = {
  project: Record<string, unknown>
  workspace: WorkspaceFile
  documents: DocumentListItem[]
  root: string
  packageRoot?: string
  rootSource?: string
  paths?: {
    documents: string
    editor: string
  }
}

export type DocumentResponse = {
  document: EditorDocument
  revision: string
  relativePath: string
}

export type SaveDocumentResult = {
  ok: true
  revision: string
  path: string
}

export type SaveDocumentConflict = {
  error: 'revision conflict'
  currentRevision: string
  document: EditorDocument
}

export type HotHandlers = {
  onDocumentChanged?: (data: Record<string, unknown>) => void
  onWorkspaceChanged?: (data: Record<string, unknown>) => void
}

const API = '/__happyshop/api'

/** Vite `configureServer` bridge — only present under `bun run dev`. */
export function isProjectBridgeEnabled(): boolean {
  return import.meta.env.DEV === true
}

export function createBrowserProjectSnapshot(): ProjectSnapshot {
  return {
    project: {
      version: 1,
      defaultDocument: 'demo',
    },
    workspace: {
      version: 1,
      layout: null,
      preferences: {},
      activeDocument: 'demo',
    },
    documents: [],
    root: '',
  }
}

export class ProjectBridgeUnavailableError extends Error {
  constructor(message = 'Project bridge unavailable') {
    super(message)
    this.name = 'ProjectBridgeUnavailableError'
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new ProjectBridgeUnavailableError(
      `Project bridge unavailable (HTTP ${res.status})`,
    )
  }
  const body = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    const err = new Error(
      typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`,
    ) as Error & { status: number; body: unknown }
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

export class ProjectClient {
  fetchProject(): Promise<ProjectSnapshot> {
    if (!isProjectBridgeEnabled()) {
      return Promise.resolve(createBrowserProjectSnapshot())
    }
    return request<ProjectSnapshot>(`${API}/project`)
  }

  fetchDocument(id: string): Promise<DocumentResponse> {
    if (!isProjectBridgeEnabled()) {
      return Promise.reject(new ProjectBridgeUnavailableError())
    }
    return request<DocumentResponse>(
      `${API}/documents/${encodeURIComponent(id)}`,
    )
  }

  saveDocument(
    document: EditorDocument,
    expectedRevision?: string,
  ): Promise<SaveDocumentResult> {
    if (!isProjectBridgeEnabled()) {
      return Promise.reject(new ProjectBridgeUnavailableError())
    }
    return request<SaveDocumentResult>(
      `${API}/documents/${encodeURIComponent(document.name)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ document, expectedRevision }),
      },
    )
  }

  listDocuments(): Promise<{ documents: DocumentListItem[] }> {
    if (!isProjectBridgeEnabled()) {
      return Promise.resolve({ documents: [] })
    }
    return request<{ documents: DocumentListItem[] }>(`${API}/documents`)
  }

  fetchWorkspace(): Promise<WorkspaceFile> {
    if (!isProjectBridgeEnabled()) {
      return Promise.resolve(createBrowserProjectSnapshot().workspace)
    }
    return request<WorkspaceFile>(`${API}/workspace`)
  }

  saveWorkspace(
    workspace: WorkspaceFile,
  ): Promise<{ ok: true; revision: string }> {
    if (!isProjectBridgeEnabled()) {
      // Static hosts (GitHub Pages / vite preview) keep workspace in memory only.
      return Promise.resolve({ ok: true, revision: 'browser' })
    }
    return request<{ ok: true; revision: string }>(`${API}/workspace`, {
      method: 'PUT',
      body: JSON.stringify(workspace),
    })
  }

  fetchLayoutPreset(name: string): Promise<unknown> {
    if (!isProjectBridgeEnabled()) {
      return Promise.reject(new ProjectBridgeUnavailableError())
    }
    return request<unknown>(`${API}/layouts/${encodeURIComponent(name)}`)
  }

  saveLayoutPreset(
    name: string,
    layout: unknown,
  ): Promise<{ ok: true; name: string }> {
    if (!isProjectBridgeEnabled()) {
      return Promise.reject(new ProjectBridgeUnavailableError())
    }
    return request<{ ok: true; name: string }>(
      `${API}/layouts/${encodeURIComponent(name)}`,
      {
        method: 'PUT',
        body: JSON.stringify(layout),
      },
    )
  }

  listLayoutPresets(): Promise<{ presets: string[] }> {
    if (!isProjectBridgeEnabled()) {
      return Promise.resolve({ presets: [] })
    }
    return request<{ presets: string[] }>(`${API}/layouts`)
  }
  subscribeHot(handlers: HotHandlers): () => void {
    const hot = import.meta.hot
    if (!hot) return () => {}

    const documentChanged = (data: unknown) =>
      handlers.onDocumentChanged?.(data as Record<string, unknown>)
    const workspaceChanged = (data: unknown) =>
      handlers.onWorkspaceChanged?.(data as Record<string, unknown>)

    if (handlers.onDocumentChanged) hot.on('he:document-changed', documentChanged)
    if (handlers.onWorkspaceChanged)
      hot.on('he:workspace-changed', workspaceChanged)

    return () => {
      if (handlers.onDocumentChanged)
        hot.off('he:document-changed', documentChanged)
      if (handlers.onWorkspaceChanged)
        hot.off('he:workspace-changed', workspaceChanged)
    }
  }
}

export const projectClient = new ProjectClient()
