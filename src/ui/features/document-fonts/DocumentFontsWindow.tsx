import { useEffect, useState } from 'react'
import type { HappyDocument } from '../../../core/document'
import {
  collectDocumentFontUsages,
  resolveDocumentFontAttributions,
  type DocumentFontAttribution,
} from '../../../editor/tools/text/documentFonts'
import { Button } from '../../base/Button'
import { FloatingWindow } from '../../base/FloatingWindow'
import styles from './DocumentFontsWindow.module.css'

type Props = {
  open: boolean
  document: HappyDocument
  onClose: () => void
}

function sourceBadge(kind: DocumentFontAttribution['sourceKind']): string {
  switch (kind) {
    case 'bundled':
      return 'Bundled'
    case 'google-fonts':
      return 'Google Fonts'
    default:
      return 'System'
  }
}

export function DocumentFontsWindow({ open, document, onClose }: Props) {
  const [entries, setEntries] = useState<DocumentFontAttribution[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntries(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const usages = collectDocumentFontUsages(document)
    void resolveDocumentFontAttributions(usages).then((resolved) => {
      if (cancelled) return
      setEntries(resolved)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, document])

  return (
    <FloatingWindow
      open={open}
      title="Document Info"
      onClose={onClose}
      width={460}
      height={420}
      bare
    >
      <div className={styles.content}>
        <p className={styles.note}>
          Fonts referenced by text layers in this document. License text is served from bundled
          assets or your local Google Fonts cache when available.
        </p>
        {loading && !entries ? (
          <p className={styles.loading}>Loading font attribution…</p>
        ) : null}
        {!loading && entries?.length === 0 ? (
          <p className={styles.empty}>No text layers use custom fonts in this document.</p>
        ) : null}
        {entries && entries.length > 0 ? (
          <div className={styles.list}>
            {entries.map((entry) => (
              <article key={entry.key} className={styles.entry}>
                <div className={styles.header}>
                  <h4 className={styles.family}>{entry.displayName}</h4>
                  <span className={styles.badge}>{sourceBadge(entry.sourceKind)}</span>
                </div>
                <p className={styles.meta}>
                  {entry.license ? <>License: {entry.license}</> : 'License: unknown'}
                  {entry.designer ? <> · {entry.designer}</> : null}
                  {entry.provenance ? <> · {entry.provenance}</> : null}
                  {entry.sourceKind === 'google-fonts' && entry.cached ? <> · cached locally</> : null}
                  {entry.layerCount > 1 ? <> · {entry.layerCount} layers</> : null}
                </p>
                {entry.licenseText ? (
                  <details className={styles.license}>
                    <summary className={styles.licenseSummary}>Show license text</summary>
                    <pre className={styles.licenseText}>{entry.licenseText}</pre>
                  </details>
                ) : entry.licenseUrl ? (
                  <p className={styles.meta}>
                    <a href={entry.licenseUrl} target="_blank" rel="noreferrer">
                      View license
                    </a>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
        <div className={styles.actions}>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
