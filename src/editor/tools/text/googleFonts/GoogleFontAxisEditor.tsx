import { useEffect, useState } from 'react'
import type { GoogleFontSource, TextLayer } from '../../../../core/document'
import { loadGoogleFontFamily } from './catalogIndex'
import type { GoogleFontCatalogEntry } from './catalogTypes'
import { commitGoogleFontWithAxes, registerCommittedGoogleFont, uiAxes } from './googleFontDownload'
import { defaultAxisValues, normalizeAxisValues } from './variableAxis'
import { VariableAxisControls } from './VariableAxisControls'
import axisStyles from './VariableAxisControls.module.css'

type Props = {
  fontSource: GoogleFontSource
  layerStyle: Pick<TextLayer, 'italic'>
  disabled?: boolean
  onPinned: (source: GoogleFontSource, fontWeight: number) => void
  onError: (message: string) => void
}

export function GoogleFontAxisEditor({ fontSource, layerStyle, disabled, onPinned, onError }: Props) {
  const [entry, setEntry] = useState<GoogleFontCatalogEntry | null>(null)
  const [axisValues, setAxisValues] = useState<Record<string, number>>({})
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadGoogleFontFamily(fontSource.catalogId)
      .then((family) => {
        if (cancelled) return
        setEntry(family)
        setAxisValues(fontSource.axes ?? defaultAxisValues(family.axes))
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(error instanceof Error ? error.message : 'Could not load font axes')
      })
    return () => { cancelled = true }
  }, [fontSource.catalogId, fontSource.axes, onError])

  const controls = entry ? uiAxes(entry) : []
  if (!entry || !controls.length) return null

  const commitAxes = async (nextValues: Record<string, number>) => {
    if (!entry) return
    setCommitting(true)
    onError('')
    try {
      const style = layerStyle.italic ? 'italic' : 'normal'
      const values = normalizeAxisValues(entry.axes, nextValues)
      const { record, source } = await commitGoogleFontWithAxes(entry, style, values)
      await registerCommittedGoogleFont(record)
      onPinned(source, source.weight)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not pin font axes')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className={axisStyles.root}>
      <div className={axisStyles.caption}>Variable axes</div>
      <VariableAxisControls
        axes={controls}
        values={normalizeAxisValues(entry.axes, axisValues)}
        disabled={disabled || committing}
        onChange={(tag, value) => {
          const next = { ...axisValues, [tag]: value }
          setAxisValues(next)
          void commitAxes(next)
        }}
      />
    </div>
  )
}
