import type { TextLayer } from '../../../../core/document'

const RANGES: Array<[string, RegExp]> = [
  ['cyrillic', /[\u0400-\u052f]/u],
  ['greek', /[\u0370-\u03ff]/u],
  ['arabic', /[\u0600-\u06ff]/u],
  ['hebrew', /[\u0590-\u05ff]/u],
  ['devanagari', /[\u0900-\u097f]/u],
  ['thai', /[\u0e00-\u0e7f]/u],
  ['japanese', /[\u3040-\u30ff]/u],
  ['korean', /[\uac00-\ud7af]/u],
  ['chinese-simplified', /[\u4e00-\u9fff]/u],
]

/** Best-effort Unicode range detection for a document's editable text. */
export function detectDocumentScripts(layers: readonly TextLayer[]): string[] {
  const text = layers.map((layer) => layer.content).join('')
  const detected = RANGES.filter(([, pattern]) => pattern.test(text)).map(([subset]) => subset)
  return detected.length ? detected : ['latin']
}
