import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { PickerSurface } from '../../../ui/base/PickerSurface'
import { BUNDLED_FONTS } from './fontCatalog'
import { availableSystemFonts, type SystemFont } from './systemFonts'
import { loadDownloadableGoogleFontIds, loadGoogleFontFamily, loadGoogleFontIndex } from './googleFonts/catalogIndex'
import { commitGoogleFontWithAxes, registerCommittedGoogleFont, uiAxes } from './googleFonts/googleFontDownload'
import { isNetworkFetchError } from './googleFonts/googleFontConnectivity'
import { listCachedGoogleFonts } from './googleFonts/fontCache'
import { loadGoogleFontLivePreview } from './googleFonts/livePreview'
import { useGoogleFontsOffline } from './googleFonts/useGoogleFontsOffline'
import {
  defaultGoogleFontSortMode,
  sortGoogleFontIndex,
  type GoogleFontSortMode,
} from './googleFonts/catalogSort'
import { CURATED_SCRIPT_CHIPS, SCRIPT_SAMPLES } from './googleFonts/scriptTypes'
import type { GoogleFontCatalogEntry, GoogleFontIndexEntry } from './googleFonts/catalogTypes'
import type { GoogleFontSource } from '../../../core/document'
import {
  defaultAxisValues,
  findMatchingStaticFile,
  normalizeAxisValues,
} from './googleFonts/variableAxis'
import { VariableAxisControls } from './googleFonts/VariableAxisControls'
import {
  GOOGLE_FONTS_MODE_CHANGED_EVENT,
  readGoogleFontsModePref,
  type GoogleFontsMode,
} from '../../../ui/features/settings/prefs'
import styles from './FontPicker.module.css'

type Props = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  value: string
  documentScripts?: readonly string[]
  onChange: (family: string) => void
  onGoogleFontSelect: (family: string, source: GoogleFontSource) => void
  onClose: () => void
}

const RECENT_KEY = 'happy-shop.recent.fonts'
const MAX_RECENT = 8
const PREVIEW = 'AaBbGg 123'

function loadRecents(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(stored)
      ? stored.filter((entry): entry is string => typeof entry === 'string').slice(0, MAX_RECENT)
      : []
  } catch {
    return []
  }
}

function saveRecent(family: string): string[] {
  const next = [family, ...loadRecents().filter((entry) => entry !== family)].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable in private mode.
  }
  return next
}

function FontRow({
  family,
  label,
  category,
  selected,
  onSelect,
}: {
  family: string
  label: string
  category?: SystemFont['category']
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`${styles.row}${selected ? ` ${styles.selected}` : ''}`}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
    >
      <span className={styles.name}>{label}</span>
      {category && <span className={styles.category}>{category}</span>}
      <span className={styles.preview} style={{ fontFamily: family }}>
        {PREVIEW}
      </span>
    </button>
  )
}

function GoogleFontRow({
  font,
  sample,
  livePreview,
  adding,
  offline,
  cached,
  downloadable,
  onSelect,
}: {
  font: GoogleFontIndexEntry
  sample: string
  livePreview: boolean
  adding: boolean
  offline: boolean
  cached: boolean
  downloadable: boolean
  onSelect: () => void
}) {
  const rowRef = useRef<HTMLButtonElement>(null)
  const [previewFamily, setPreviewFamily] = useState<string>()
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'unavailable'>('idle')

  useEffect(() => {
    if (!livePreview || !downloadable || previewFamily) return
    let controller: AbortController | undefined
    let requested = false
    const load = () => {
      if (requested) return
      requested = true
      const requestController = new AbortController()
      controller = requestController
      setPreviewState('loading')
      void loadGoogleFontLivePreview(font.id, requestController.signal)
        .then((family) => {
          if (!requestController.signal.aborted) {
            setPreviewFamily(family)
            setPreviewState('idle')
          }
        })
        .catch((error: unknown) => {
          if (!requestController.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
            setPreviewState('unavailable')
          }
        })
    }
    const observer = typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) load()
        else if (controller && !previewFamily) {
          controller.abort()
          controller = undefined
          requested = false
          setPreviewState('idle')
        }
      }, { rootMargin: '120px 0px' })
    if (observer && rowRef.current) observer.observe(rowRef.current)
    else load()
    return () => {
      observer?.disconnect()
      controller?.abort()
    }
  }, [font.id, livePreview, downloadable, previewFamily])

  const requiresConnection = offline && !cached
  const disabled = adding || requiresConnection || !downloadable

  return (
    <button
      ref={rowRef}
      type="button"
      className={`${styles.row}${requiresConnection || !downloadable ? ` ${styles.rowMuted}` : ''}`}
      onClick={onSelect}
      disabled={disabled}
      aria-disabled={disabled || undefined}
    >
      <span className={styles.name}>{font.family}</span>
      <span className={styles.category}>{font.category} · {font.license}</span>
      <span className={styles.preview} style={previewFamily ? { fontFamily: `"${previewFamily}"` } : undefined}>
        {sample}
      </span>
      {!downloadable ? (
        <span className={styles.previewStatus}>Browse only</span>
      ) : null}
      {downloadable && requiresConnection ? (
        <span className={styles.previewStatus}>Requires connection</span>
      ) : null}
      {downloadable && livePreview && !previewFamily && !requiresConnection && (
        <span className={styles.previewStatus}>
          {previewState === 'loading' ? 'Loading preview…' : previewState === 'unavailable' ? 'Preview unavailable' : 'Live preview'}
        </span>
      )}
      {adding && <span className={styles.category}>Preparing…</span>}
    </button>
  )
}

export function FontPicker({ open, anchorRef, value, documentScripts = [], onChange, onGoogleFontSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [systemFonts, setSystemFonts] = useState<SystemFont[]>([])
  const [recents, setRecents] = useState<string[]>([])
  const [googleMode, setGoogleMode] = useState<GoogleFontsMode>(readGoogleFontsModePref)
  const [googleIndex, setGoogleIndex] = useState<GoogleFontIndexEntry[]>([])
  const [downloadableIds, setDownloadableIds] = useState<ReadonlySet<string>>(() => new Set())
  const [googleError, setGoogleError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleTab, setGoogleTab] = useState(false)
  const [script, setScript] = useState<string | null>(null)
  const [matchesDocument, setMatchesDocument] = useState(false)
  const [category, setCategory] = useState<string>('all')
  const [sortMode, setSortMode] = useState<GoogleFontSortMode>('alpha')
  const [adding, setAdding] = useState<string | null>(null)
  const [pendingGoogle, setPendingGoogle] = useState<GoogleFontCatalogEntry | null>(null)
  const [pendingAxisValues, setPendingAxisValues] = useState<Record<string, number>>({})
  const [cachedCatalogIds, setCachedCatalogIds] = useState<ReadonlySet<string>>(() => new Set())
  const [googleNetworkError, setGoogleNetworkError] = useState(false)
  const googleOffline = useGoogleFontsOffline()
  const listScrollRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = listScrollRef.current
  })

  const reloadGoogleCatalog = () => {
    setGoogleLoading(true)
    setGoogleError('')
    setGoogleNetworkError(false)
    setGoogleIndex([])
    setDownloadableIds(new Set())
    void Promise.all([loadGoogleFontIndex(), loadDownloadableGoogleFontIds()])
      .then(([index, downloadable]) => {
        setGoogleIndex(index)
        setDownloadableIds(downloadable)
      })
      .catch((error: unknown) => {
        setGoogleError(error instanceof Error ? error.message : 'Could not load catalog')
        if (isNetworkFetchError(error)) setGoogleNetworkError(true)
      })
      .finally(() => setGoogleLoading(false))
  }

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSystemFonts(availableSystemFonts())
    setRecents(loadRecents())
  }, [open])

  useEffect(() => {
    if (!open || !googleTab || googleMode === 'off') return
    void listCachedGoogleFonts().then((records) => {
      setCachedCatalogIds(new Set(records.map((record) => record.id)))
    })
  }, [open, googleTab, googleMode])

  useEffect(() => {
    const sync = () => setGoogleMode(readGoogleFontsModePref())
    window.addEventListener(GOOGLE_FONTS_MODE_CHANGED_EVENT, sync)
    return () => window.removeEventListener(GOOGLE_FONTS_MODE_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    if (!open || !googleTab || googleMode === 'off' || googleIndex.length || googleLoading) return
    reloadGoogleCatalog()
  }, [open, googleTab, googleMode, googleIndex.length, googleLoading])

  useEffect(() => {
    if (googleIndex.length) setSortMode(defaultGoogleFontSortMode(googleIndex))
  }, [googleIndex])

  const normalizedQuery = query.trim().toLowerCase()
  const filterFamily = (family: string, label = family) =>
    !normalizedQuery ||
    family.toLowerCase().includes(normalizedQuery) ||
    label.toLowerCase().includes(normalizedQuery)
  const visibleSystemFonts = useMemo(
    () => systemFonts.filter((font) => filterFamily(font.family, font.label)),
    [systemFonts, normalizedQuery],
  )
  const visibleRecents = useMemo(
    () => recents.filter((family) => filterFamily(family)),
    [recents, normalizedQuery],
  )
  const visibleBundledFonts = useMemo(
    () => BUNDLED_FONTS.filter((font) => filterFamily(font.family, font.label)),
    [normalizedQuery],
  )
  const visibleGoogleFonts = useMemo(
    () => sortGoogleFontIndex(
      googleIndex.filter((font) =>
        filterFamily(font.family) &&
        (matchesDocument
          ? documentScripts.some((subset) => font.subsets.includes(subset))
          : !script || font.subsets.includes(script)) &&
        (category === 'all' || font.category === category),
      ),
      sortMode,
    ),
    [googleIndex, normalizedQuery, script, category, matchesDocument, documentScripts, sortMode],
  )
  const select = (family: string) => {
    onChange(family)
    setRecents(saveRecent(family))
    onClose()
  }
  const prepareGoogleFont = async (indexEntry: GoogleFontIndexEntry) => {
    if (!downloadableIds.has(indexEntry.id)) {
      setGoogleError(`"${indexEntry.family}" is browse-only (not available for download yet).`)
      return
    }
    setAdding(indexEntry.id)
    setGoogleError('')
    try {
      const entry = await loadGoogleFontFamily(indexEntry.id)
      setPendingGoogle(entry)
      setPendingAxisValues(defaultAxisValues(entry.axes))
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : 'Could not load font details')
      if (isNetworkFetchError(error)) setGoogleNetworkError(true)
    } finally {
      setAdding(null)
    }
  }
  const addGoogleFont = async () => {
    const entry = pendingGoogle
    if (!entry) return
    setAdding(entry.id)
    setGoogleError('')
    try {
      const style = 'normal' as const
      const values = normalizeAxisValues(entry.axes, pendingAxisValues)
      const { record, source } = await commitGoogleFontWithAxes(entry, style, values)
      await registerCommittedGoogleFont(record)
      onGoogleFontSelect(entry.family, source)
      setRecents(saveRecent(entry.family))
      onClose()
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : 'Could not download font')
      if (isNetworkFetchError(error)) setGoogleNetworkError(true)
    } finally {
      setAdding(null)
    }
  }

  const showGoogleOfflineBanner = googleOffline || googleNetworkError

  return (
    <PickerSurface open={open} anchorRef={anchorRef} onClose={onClose} title="Font" width={340} ariaLabel="Font picker">
      <div className={styles.picker}>
        <header className={styles.header}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search families"
            aria-label="Search font families"
          />
        </header>
        <div className={styles.tabs} role="tablist" aria-label="Font source">
          <button type="button" role="tab" aria-selected={!googleTab} className={!googleTab ? styles.tabActive : styles.tab} onClick={() => setGoogleTab(false)}>Installed</button>
          <button type="button" role="tab" aria-selected={googleTab} className={googleTab ? styles.tabActive : styles.tab} onClick={() => setGoogleTab(true)}>Google Fonts</button>
        </div>
        <div
          ref={listRef}
          className={styles.listbox}
          role="listbox"
          aria-label="Font families"
          onScroll={(event) => { listScrollRef.current = event.currentTarget.scrollTop }}
        >
          {googleTab ? (
            <section>
              {googleMode === 'off' ? (
                <div className={styles.disabledHint} data-testid="google-fonts-disabled-hint">
                  <p><strong>Google Fonts is off.</strong> Enable browsing in Settings → Text → Google Fonts (Browse only or Browse with live preview). Downloaded fonts you already added stay available offline.</p>
                </div>
              ) : null}
              {googleMode !== 'off' && showGoogleOfflineBanner ? (
                <div className={styles.offlineBanner} role="status" data-testid="google-fonts-offline-banner">
                  <span>
                    {googleOffline
                      ? 'You\u2019re offline. Downloaded Google Fonts remain usable; new downloads and live previews require a connection.'
                      : 'Could not reach Google Fonts. Downloaded fonts remain usable; retry when your connection is back.'}
                  </span>
                  <button type="button" onClick={reloadGoogleCatalog} disabled={googleLoading}>
                    {googleLoading ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              ) : null}
              {googleMode !== 'off' ? (
              <div className={styles.filters}>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as GoogleFontSortMode)} aria-label="Sort Google Fonts">
                  <option value="popularity">Popularity</option>
                  <option value="trending">Trending</option>
                  <option value="alpha">A–Z</option>
                </select>
                <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Google Fonts category">
                  <option value="all">All categories</option>
                  <option value="sans-serif">Sans serif</option>
                  <option value="serif">Serif</option>
                  <option value="display">Display</option>
                  <option value="handwriting">Handwriting</option>
                  <option value="monospace">Monospace</option>
                </select>
                {CURATED_SCRIPT_CHIPS.map(([id, label]) => (
                  <button key={id} type="button" className={script === id && !matchesDocument ? styles.chipActive : styles.chip} onClick={() => { setMatchesDocument(false); setScript(script === id ? null : id) }}>{label}</button>
                ))}
                {documentScripts.length > 0 && <button type="button" className={matchesDocument ? styles.chipActive : styles.chip} onClick={() => setMatchesDocument(!matchesDocument)}>Matches document ({documentScripts.length})</button>}
              </div>
              ) : null}
              {googleMode !== 'off' && googleLoading && <p className={styles.empty}>Loading offline catalog…</p>}
              {googleMode !== 'off' && googleError && <p className={styles.empty} role="alert">{googleError}</p>}
              {googleMode !== 'off' && !googleLoading && !googleError && visibleGoogleFonts.map((font) => (
                <GoogleFontRow
                  key={font.id}
                  font={font}
                  sample={SCRIPT_SAMPLES[script ?? font.subsets[0] ?? 'latin'] ?? SCRIPT_SAMPLES.latin}
                  livePreview={googleMode === 'live-preview' && !googleOffline}
                  adding={adding !== null}
                  offline={googleOffline}
                  cached={cachedCatalogIds.has(font.id)}
                  downloadable={downloadableIds.has(font.id)}
                  onSelect={() => void prepareGoogleFont(font)}
                />
              ))}
              {googleMode !== 'off' && !googleLoading && !googleError && visibleGoogleFonts.length === 0 && <p className={styles.empty}>No matching Google Fonts.</p>}
              {googleMode !== 'off' && pendingGoogle && (() => {
                const style = 'normal' as const
                const values = normalizeAxisValues(pendingGoogle.axes, pendingAxisValues)
                const staticFile = findMatchingStaticFile(pendingGoogle, style, values)
                const sizeBytes = staticFile?.sizeBytes ?? pendingGoogle.variableFile?.sizeBytes ?? pendingGoogle.files[0]?.sizeBytes ?? 0
                const axisControls = uiAxes(pendingGoogle)
                return (
                  <div className={styles.consent}>
                    <span>Download {pendingGoogle.family} ({Math.ceil(sizeBytes / 1024)} KB · {pendingGoogle.license}) from Google Fonts and cache it for offline, deterministic export?</span>
                    {axisControls.length > 0 ? (
                      <VariableAxisControls
                        axes={axisControls}
                        values={values}
                        disabled={adding !== null}
                        onChange={(tag, next) => setPendingAxisValues((current) => ({ ...current, [tag]: next }))}
                      />
                    ) : null}
                    <button type="button" onClick={() => void addGoogleFont()} disabled={adding !== null}>Add</button>
                    <button type="button" onClick={() => { setPendingGoogle(null); setPendingAxisValues({}) }} disabled={adding !== null}>Cancel</button>
                  </div>
                )
              })()}
            </section>
          ) : (
            <>
          {visibleRecents.length > 0 && (
            <section>
              <h3>Recent</h3>
              {visibleRecents.map((family) => (
                <FontRow
                  key={family}
                  family={family}
                  label={family.split(',')[0]!.trim()}
                  selected={family === value}
                  onSelect={() => select(family)}
                />
              ))}
            </section>
          )}
          <section>
            <h3>Bundled</h3>
            {visibleBundledFonts.map((font) => (
              <FontRow
                key={font.family}
                family={font.family}
                label={font.label}
                category={font.category}
                selected={font.family === value}
                onSelect={() => select(font.family)}
              />
            ))}
          </section>
          <section>
            <h3>System</h3>
            {visibleSystemFonts.length > 0 ? (
              visibleSystemFonts.map((font) => (
                <FontRow
                  key={font.family}
                  family={font.family}
                  label={font.label}
                  category={font.category}
                  selected={font.family === value}
                  onSelect={() => select(font.family)}
                />
              ))
            ) : (
              <p className={styles.empty}>No matching system fonts.</p>
            )}
          </section>
            </>
          )}
        </div>
      </div>
    </PickerSurface>
  )
}
