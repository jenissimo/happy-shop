/**
 * Public API for the New Document / import feature (SPEC §13-14/§20,
 * UX-PHOTOSHOP.md "New Document dialog"). See `commands.ts` for wiring
 * instructions and `controller.ts` for the integrator-facing
 * `onDocumentCreated` hook.
 */

export { NewDocumentDialog } from './NewDocumentDialog'

export { registerFileCommands, applyNewDocument } from './commands'

export {
  openNewDocumentDialog,
  closeNewDocumentDialog,
  isNewDocumentDialogOpen,
  useNewDocumentDialogOpen,
  onDocumentCreated,
} from './controller'

export { openImageFile, createDocumentFromClipboard } from './fileOpen'
export type { NewDocumentResult } from './fileOpen'

export { createDocumentFromDialog } from './createDocumentFromDialog'

export {
  DOCUMENT_PRESETS,
  CUSTOM_PRESET_ID,
  CLIPBOARD_PRESET_ID,
  findPreset,
  makeClipboardPreset,
} from './presets'
export type { DocumentPreset } from './presets'

export {
  createDefaultFormState,
  canSubmitNewDocument,
  clampDimension,
  isOverSoftLimit,
  normalizeHexColor,
  resolveBackground,
} from './validation'
export type { NewDocumentFormState, BackgroundOption } from './validation'
