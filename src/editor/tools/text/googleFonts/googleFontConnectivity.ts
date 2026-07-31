/** Shared online/offline signal for Google Fonts network-backed flows. */

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

export function isNetworkFetchError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof DOMException && error.name === 'AbortError') return false
  if (error instanceof Error) {
    return /failed to fetch|networkerror|network error|load failed|offline/i.test(error.message)
  }
  return false
}
