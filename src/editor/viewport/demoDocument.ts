import {
  identityTransform,
  type RenderDocumentView,
} from '../../rendering/contracts'

/**
 * Stand-in `RenderDocumentView` for M1b, before a real document exists.
 * `ViewportHost` renders this when it isn't handed a `documentView` prop, so
 * the checkerboard + Pixi pipeline are visibly exercised end to end.
 */
export function createDemoDocumentView(): RenderDocumentView {
  return {
    id: 'demo',
    width: 960,
    height: 540,
    background: 'transparent',
    layers: [
      {
        id: 'demo-sky',
        kind: 'raster',
        visible: true,
        opacity: 1,
        fillOpacity: 1,
        blendMode: 'normal',
        transform: identityTransform(),
        width: 960,
        height: 540,
        source: { kind: 'color', color: '#3d7eb5' },
      },
      {
        id: 'demo-panel',
        kind: 'raster',
        visible: true,
        opacity: 0.85,
        fillOpacity: 1,
        blendMode: 'normal',
        transform: { ...identityTransform(), x: 160, y: 120, rotationDeg: -6 },
        width: 420,
        height: 260,
        source: { kind: 'color', color: '#ffc83d' },
      },
    ],
  }
}
