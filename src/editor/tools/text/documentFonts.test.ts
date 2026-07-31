import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createTextLayer,
} from '../../../core/document'
import {
  collectDocumentFontUsages,
  extractDesignerCredit,
} from './documentFonts'

describe('collectDocumentFontUsages', () => {
  test('returns empty list when no text layers exist', () => {
    const doc = createEmptyDocument({ width: 100, height: 100 })
    expect(collectDocumentFontUsages(doc)).toEqual([])
  })

  test('collects bundled, system, and google-font faces with dedupe', () => {
    const googleLayer = createTextLayer({
      content: 'Google',
      fontFamily: 'Roboto, sans-serif',
      fontSource: {
        kind: 'google-fonts',
        catalogId: 'roboto',
        weight: 400,
        style: 'normal',
        version: 'v51',
      },
    })
    const bundledLayer = createTextLayer({
      content: 'Bundled',
      fontFamily: 'Inter, sans-serif',
    })
    const systemLayer = createTextLayer({
      content: 'System',
      fontFamily: 'Arial, Helvetica, sans-serif',
    })
    const mixedLayer = createTextLayer({
      content: 'Hello',
      fontFamily: 'Inter, sans-serif',
      runs: [
        {
          start: 0,
          end: 2,
          fontFamily: 'Inter, sans-serif',
          fontSize: 24,
          fontWeight: 400,
          italic: false,
          color: '#000000',
        },
        {
          start: 2,
          end: 5,
          fontFamily: 'Roboto, sans-serif',
          fontSize: 24,
          fontWeight: 700,
          italic: false,
          color: '#000000',
          fontSource: {
            kind: 'google-fonts',
            catalogId: 'roboto',
            weight: 700,
            style: 'normal',
            version: 'v51',
          },
        },
      ],
    })

    let doc = createEmptyDocument({ width: 200, height: 200 })
    doc = addLayer(doc, googleLayer)
    doc = addLayer(doc, bundledLayer)
    doc = addLayer(doc, systemLayer)
    doc = addLayer(doc, mixedLayer)

    const usages = collectDocumentFontUsages(doc)
    expect(usages).toHaveLength(4)

    const inter = usages.find((usage) => usage.sourceKind === 'bundled')
    expect(inter?.displayName).toBe('Inter')
    expect(inter?.layerCount).toBe(2)

    const roboto = usages.find((usage) => usage.sourceKind === 'google-fonts')
    expect(roboto?.catalogId).toBe('roboto')
    expect(roboto?.weight).toBe(400)
    expect(roboto?.layerCount).toBe(1)

    const mixedRoboto = usages.find(
      (usage) => usage.sourceKind === 'google-fonts' && usage.weight === 700,
    )
    expect(mixedRoboto).toBeDefined()
    expect(mixedRoboto?.layerCount).toBe(1)

    const arial = usages.find((usage) => usage.sourceKind === 'system')
    expect(arial?.displayName).toBe('Arial')
    expect(arial?.layerCount).toBe(1)
  })
})

describe('extractDesignerCredit', () => {
  test('parses OFL copyright line', () => {
    expect(
      extractDesignerCredit(
        'Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic)\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.',
      ),
    ).toBe('The Roboto Project Authors')
  })

  test('returns short first lines verbatim', () => {
    expect(extractDesignerCredit('Google Inc.\n\nThis Font Software is licensed')).toBe('Google Inc.')
  })
})
