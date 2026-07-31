/** Pure RGB / HSB / HSL / hex conversion for the ColorPicker. */

export type Rgb = { r: number; g: number; b: number }
export type Hsb = { h: number; s: number; b: number }
export type Hsl = { h: number; s: number; l: number }

export type ParsedColor = {
  rgb: Rgb
  /** 0–1 */
  a: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function round(n: number): number {
  return Math.round(n)
}

/** Parse `#rgb`, `#rrggbb`, `#rrggbbaa`, or bare hex. Falls back to black. */
export function parseColor(input: string): ParsedColor {
  const raw = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const r = parseInt(raw[0]! + raw[0]!, 16)
    const g = parseInt(raw[1]! + raw[1]!, 16)
    const b = parseInt(raw[2]! + raw[2]!, 16)
    return { rgb: { r, g, b }, a: 1 }
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return {
      rgb: {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16),
      },
      a: 1,
    }
  }
  if (/^[0-9a-fA-F]{8}$/.test(raw)) {
    return {
      rgb: {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16),
      },
      a: parseInt(raw.slice(6, 8), 16) / 255,
    }
  }
  return { rgb: { r: 0, g: 0, b: 0 }, a: 1 }
}

function byteHex(n: number): string {
  return clamp(round(n), 0, 255).toString(16).padStart(2, '0')
}

/** Format `#rrggbb` or `#rrggbbaa` (alpha omitted when opaque or not requested). */
export function formatHex(rgb: Rgb, a = 1, withAlpha = false): string {
  const base = `#${byteHex(rgb.r)}${byteHex(rgb.g)}${byteHex(rgb.b)}`
  if (!withAlpha) return base
  const aa = clamp(a, 0, 1)
  if (aa >= 1) return base
  return `${base}${byteHex(aa * 255)}`
}

export function rgbToHsb({ r, g, b }: Rgb): Hsb {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : (d / max) * 100
  return { h, s, b: max * 100 }
}

export function hsbToRgb({ h, s, b }: Hsb): Rgb {
  const H = ((h % 360) + 360) % 360
  const S = clamp(s, 0, 100) / 100
  const V = clamp(b, 0, 100) / 100
  const C = V * S
  const X = C * (1 - Math.abs(((H / 60) % 2) - 1))
  const m = V - C
  let rp = 0
  let gp = 0
  let bp = 0
  if (H < 60) {
    rp = C
    gp = X
  } else if (H < 120) {
    rp = X
    gp = C
  } else if (H < 180) {
    gp = C
    bp = X
  } else if (H < 240) {
    gp = X
    bp = C
  } else if (H < 300) {
    rp = X
    bp = C
  } else {
    rp = C
    bp = X
  }
  return {
    r: round((rp + m) * 255),
    g: round((gp + m) * 255),
    b: round((bp + m) * 255),
  }
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: l * 100 }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === R) h = ((G - B) / d) % 6
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const H = ((h % 360) + 360) % 360
  const S = clamp(s, 0, 100) / 100
  const L = clamp(l, 0, 100) / 100
  const C = (1 - Math.abs(2 * L - 1)) * S
  const X = C * (1 - Math.abs(((H / 60) % 2) - 1))
  const m = L - C / 2
  let rp = 0
  let gp = 0
  let bp = 0
  if (H < 60) {
    rp = C
    gp = X
  } else if (H < 120) {
    rp = X
    gp = C
  } else if (H < 180) {
    gp = C
    bp = X
  } else if (H < 240) {
    gp = X
    bp = C
  } else if (H < 300) {
    rp = X
    bp = C
  } else {
    rp = C
    bp = X
  }
  return {
    r: round((rp + m) * 255),
    g: round((gp + m) * 255),
    b: round((bp + m) * 255),
  }
}

/** Hue CSS for SV square / slider (`hsl(h 100% 50%)`). */
export function hueCss(h: number): string {
  return `hsl(${((h % 360) + 360) % 360} 100% 50%)`
}

export function clampByte(n: number): number {
  return clamp(round(n), 0, 255)
}

export function clampHue(n: number): number {
  return clamp(n, 0, 360)
}

export function clampPercent(n: number): number {
  return clamp(n, 0, 100)
}
