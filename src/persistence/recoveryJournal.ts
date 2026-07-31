/**
 * Small pointer to a complete browser-local raster recovery generation.
 * Pixel bytes live in IndexedDB; localStorage never carries raster data.
 */
const KEY = 'happy-shop:recovery-journal:v2'
const LEGACY_KEY = 'happy-shop:recovery-journal:v1'

export type RecoveryJournalEntry = {
  version: 2
  savedAt: string
  projectPath: string | null
  revision: string | null
  documentId: string
  documentName: string
  dirty: boolean
  generationId: string | null
}

export function writeRecoveryJournal(entry: RecoveryJournalEntry): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(entry))
    return true
  } catch {
    /* quota / private mode */
    return false
  }
}

export function readRecoveryJournal(): RecoveryJournalEntry | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<RecoveryJournalEntry>
    if (
      value.version !== 2 ||
      typeof value.savedAt !== 'string' ||
      (value.projectPath !== null && typeof value.projectPath !== 'string') ||
      (value.revision !== null && typeof value.revision !== 'string') ||
      typeof value.documentId !== 'string' ||
      typeof value.documentName !== 'string' ||
      typeof value.dirty !== 'boolean' ||
      (value.generationId !== null && typeof value.generationId !== 'string')
    ) return null
    return value as RecoveryJournalEntry
  } catch {
    return null
  }
}

export function clearRecoveryJournal(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* ignore */
  }
}
