import { useEffect, useState } from 'react'
import { isBrowserOnline } from './googleFontConnectivity'

/** Tracks browser online/offline for Google Fonts tab banner gating. */
export function useGoogleFontsOffline(): boolean {
  const [offline, setOffline] = useState(() => !isBrowserOnline())

  useEffect(() => {
    const sync = () => setOffline(!isBrowserOnline())
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  return offline
}
