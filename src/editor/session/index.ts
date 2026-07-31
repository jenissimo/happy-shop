export {
  useEditorSessionStore,
  getSelectedLayer,
  getEditorSessionSnapshot,
  type EditorSessionState,
  type SessionCameraPrefs,
  type SessionProjectBinding,
} from './EditorSessionStore'
export {
  documentHistory,
  resetDocumentHistory,
  getActiveDocumentHistory,
  setActiveDocumentHistory,
} from './documentHistory'
export { saveActiveProject, type SaveProjectResult } from './saveProject'
export {
  useDocumentTabManager,
  ensureInitialDocumentTab,
  type DocumentTab,
  type DocumentTabId,
} from './DocumentTabManager'
export {
  toRenderDocumentView,
  type RenderAssetLookup,
} from './toRenderDocumentView'
/** @deprecated Prefer `toRenderDocumentView`. */
export { mapDocumentToRenderView } from './mapDocumentToRenderView'
export { createDemoHappyDocument } from './demoHappyDocument'
