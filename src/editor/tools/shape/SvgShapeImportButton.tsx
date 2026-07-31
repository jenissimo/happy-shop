import { UploadSimple } from '@phosphor-icons/react'
import { useRef } from 'react'
import { createAndSelectShapeLayer } from './shapeCommands'
import { extractSimpleSvgPath, pathBounds, pathToSvgData } from './shapeGeometry'
import { useShapeToolStore } from './shapeToolStore'

/** Places the first simple SVG path/polygon as an editable vector shape layer. */
export function SvgShapeImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const path = extractSimpleSvgPath(await file.text())
    if (!path) {
      window.alert('SVG must contain a simple <path> or <polygon> using M, L, H, V, and Z commands.')
      return
    }
    const bounds = pathBounds(path)
    const options = useShapeToolStore.getState().options
    createAndSelectShapeLayer({
      primitive: 'svg-path',
      w: bounds.w,
      h: bounds.h,
      pathData: pathToSvgData(path, bounds.x, bounds.y),
      fill: { enabled: options.fillEnabled, color: options.fillColor, opacity: options.fillOpacity },
      stroke: { enabled: options.strokeEnabled, color: options.strokeColor, opacity: options.strokeOpacity, width: options.strokeWidth },
    })
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={(event) => {
          void onFile(event.target.files?.[0])
          event.currentTarget.value = ''
        }}
      />
      <button
        type="button"
        title="Place simple SVG path or polygon"
        aria-label="Place SVG"
        onClick={() => inputRef.current?.click()}
      >
        <UploadSimple size={14} />
      </button>
    </>
  )
}
