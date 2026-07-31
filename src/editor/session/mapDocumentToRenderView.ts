/**
 * @deprecated Prefer `toRenderDocumentView(doc, assets)`. Kept as a thin
 * alias so callers outside session ownership (e.g. export commands) keep
 * compiling while they migrate.
 */
export { toRenderDocumentView as mapDocumentToRenderView } from './toRenderDocumentView'
