#!/usr/bin/env bun
/**
 * Offline brush-pack converter. Inputs stay in gitignored vendor-tmp/; only
 * grayscale PNGs, manifests, LICENSE, and NOTICE metadata are committed.
 *
 * Example:
 * bun scripts/brushes/convert.ts --in vendor-tmp/oga-rd/source --pack oga-rd \
 *   --license CC0-1.0 --source https://opengameart.org/content/60-free-gimp-krita-brushes \
 *   --author rubberduck --max 512 --out public/brushes/oga-rd --include "a.gbr,b.gih"
 */
import { basename, extname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { inflateSync, deflateSync } from 'node:zlib'

type Image = { width: number; height: number; alpha: Uint8Array }
type Arguments = Record<string, string>

function argumentMap(): Arguments {
  const args: Arguments = {}
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i]
    const value = process.argv[i + 1]
    if (!key?.startsWith('--') || !value) throw new Error(`Expected --key value, got ${key ?? ''}`)
    args[key.slice(2)] = value
  }
  return args
}

function requireArg(args: Arguments, key: string): string {
  const value = args[key]
  if (!value) throw new Error(`Missing required --${key}`)
  return value
}

function u32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, false)
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function pngImage(data: Uint8Array): Image {
  const signature = '\x89PNG\r\n\x1a\n'
  if (Buffer.from(data.subarray(0, 8)).toString('binary') !== signature) throw new Error('Invalid PNG')
  let offset = 8
  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  const chunks: Uint8Array[] = []
  let palette: Uint8Array | undefined
  let transparency: Uint8Array | undefined
  while (offset < data.length) {
    const length = u32(data, offset)
    const type = Buffer.from(data.subarray(offset + 4, offset + 8)).toString('ascii')
    const chunk = data.subarray(offset + 8, offset + 8 + length)
    offset += length + 12
    if (type === 'IHDR') {
      width = u32(chunk, 0)
      height = u32(chunk, 4)
      depth = chunk[8]!
      colorType = chunk[9]!
      if (depth !== 8 || chunk[12] !== 0) throw new Error('Only non-interlaced, 8-bit PNGs are supported')
    } else if (type === 'PLTE') palette = chunk
    else if (type === 'tRNS') transparency = chunk
    else if (type === 'IDAT') chunks.push(chunk)
    else if (type === 'IEND') break
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType]
  if (!width || !height || !channels) throw new Error(`Unsupported PNG color type ${colorType}`)
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
  const pixels = new Uint8Array(height * stride)
  for (let y = 0, src = 0; y < height; y += 1) {
    const filter = raw[src++]!
    const row = pixels.subarray(y * stride, (y + 1) * stride)
    const prior = y === 0 ? undefined : pixels.subarray((y - 1) * stride, y * stride)
    for (let x = 0; x < stride; x += 1) {
      const value = raw[src++]!
      const left = x >= channels ? row[x - channels]! : 0
      const above = prior?.[x] ?? 0
      const upperLeft = x >= channels ? prior?.[x - channels] ?? 0 : 0
      row[x] = filter === 0 ? value : filter === 1 ? (value + left) & 255
        : filter === 2 ? (value + above) & 255 : filter === 3 ? (value + ((left + above) >> 1)) & 255
          : filter === 4 ? (value + paeth(left, above, upperLeft)) & 255 : (() => { throw new Error(`Unsupported PNG filter ${filter}`) })()
    }
  }
  const alpha = new Uint8Array(width * height)
  for (let i = 0, pixel = 0; i < pixels.length; i += channels, pixel += 1) {
    if (colorType === 4 || colorType === 6) alpha[pixel] = pixels[i + channels - 1]!
    else if (colorType === 3) alpha[pixel] = transparency?.[pixels[i]!] ?? 255
    else if (colorType === 0) alpha[pixel] = pixels[i]!
    else alpha[pixel] = Math.round(pixels[i]! * 0.2126 + pixels[i + 1]! * 0.7152 + pixels[i + 2]! * 0.0722)
  }
  if (colorType === 3 && !palette) throw new Error('PNG palette is missing')
  return { width, height, alpha }
}

function gimpBrush(data: Uint8Array, offset = 0): { image: Image; next: number } {
  const headerSize = u32(data, offset)
  const width = u32(data, offset + 8)
  const height = u32(data, offset + 12)
  const bytes = u32(data, offset + 16)
  if (headerSize < 20 || !width || !height || bytes < 1 || bytes > 4) throw new Error('Invalid GIMP brush header')
  const start = offset + headerSize
  const end = start + width * height * bytes
  if (end > data.length) throw new Error('Truncated GIMP brush')
  const alpha = new Uint8Array(width * height)
  for (let source = start, pixel = 0; source < end; source += bytes, pixel += 1) {
    alpha[pixel] = bytes === 2 || bytes === 4
      ? data[source + bytes - 1]!
      : bytes === 1
        ? data[source]!
        : Math.round(data[source]! * 0.2126 + data[source + 1]! * 0.7152 + data[source + 2]! * 0.0722)
  }
  return { image: { width, height, alpha }, next: end }
}

function decode(path: string, data: Uint8Array): Image {
  const extension = extname(path).toLowerCase()
  if (extension === '.png') return pngImage(data)
  if (extension === '.gbr') return gimpBrush(data).image
  if (extension === '.gih') {
    const nul = data.indexOf(0)
    if (nul < 0) throw new Error('Invalid GIMP brush pipe')
    // A GIH's text header commonly ends with two NUL bytes. Locate frame 0
    // through the fixed GIMP magic rather than assuming a one-byte separator.
    for (let magic = nul + 1; magic < Math.min(data.length - 4, nul + 96); magic += 1) {
      if (Buffer.from(data.subarray(magic, magic + 4)).toString('ascii') === 'GIMP') {
        return gimpBrush(data, magic - 20).image // Animated pipe: frame 0 only.
      }
    }
    throw new Error('GIMP brush pipe has no frame 0')
  }
  throw new Error(`Unsupported input ${extension}`)
}

function trim(image: Image): Image {
  let left = image.width
  let top = image.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (image.alpha[y * image.width + x] === 0) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < left) throw new Error('Brush is fully transparent')
  const width = right - left + 1
  const height = bottom - top + 1
  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) alpha.set(image.alpha.subarray((top + y) * image.width + left, (top + y) * image.width + left + width), y * width)
  return { width, height, alpha }
}

function downsample(image: Image, maximum: number): Image {
  const scale = Math.min(1, maximum / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  if (width === image.width && height === image.height) return image
  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const x0 = Math.floor(x * image.width / width), x1 = Math.ceil((x + 1) * image.width / width)
    const y0 = Math.floor(y * image.height / height), y1 = Math.ceil((y + 1) * image.height / height)
    let total = 0, count = 0
    for (let sy = y0; sy < y1; sy += 1) for (let sx = x0; sx < x1; sx += 1) { total += image.alpha[sy * image.width + sx]!; count += 1 }
    alpha[y * width + x] = Math.round(total / count)
  }
  return { width, height, alpha }
}

function normalize(image: Image): Image {
  const peak = Math.max(...image.alpha)
  if (!peak) throw new Error('Brush is fully transparent')
  if (peak === 255) return image
  return { ...image, alpha: Uint8Array.from(image.alpha, (value) => Math.round(value * 255 / peak)) }
}

let crcTable: Uint32Array | undefined
function crc32(data: Uint8Array): number {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
  })
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type)
  const output = Buffer.alloc(12 + data.length)
  output.writeUInt32BE(data.length, 0); typeBytes.copy(output, 4); Buffer.from(data).copy(output, 8)
  output.writeUInt32BE(crc32(output.subarray(4, 8 + data.length)), 8 + data.length)
  return output
}

function grayscalePng(image: Image): Buffer {
  const raw = Buffer.alloc((image.width + 1) * image.height)
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (image.width + 1)] = 0
    Buffer.from(image.alpha.subarray(y * image.width, (y + 1) * image.width)).copy(raw, y * (image.width + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(image.width, 0); ihdr.writeUInt32BE(image.height, 4); ihdr[8] = 8; ihdr[9] = 0
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function slug(path: string): string {
  return basename(path, extname(path)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function title(value: string): string {
  return value.split('-').map((word) => word ? word[0]!.toUpperCase() + word.slice(1) : '').join(' ')
}

const CC0_NOTICE = `Creative Commons Zero v1.0 Universal\n\nTo the extent possible under law, the author has waived all copyright and related or neighboring rights to this work. See https://creativecommons.org/publicdomain/zero/1.0/legalcode\n`

async function main(): Promise<void> {
  const args = argumentMap()
  const input = requireArg(args, 'in')
  const out = requireArg(args, 'out')
  const pack = requireArg(args, 'pack')
  const license = requireArg(args, 'license')
  const source = requireArg(args, 'source')
  const author = requireArg(args, 'author')
  const maximum = Number(args.max ?? '512')
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error('--max must be a positive integer')
  new URL(source)
  const requested = new Set((args.include ?? '').split(',').map((value) => value.trim()).filter(Boolean))
  const files = [...new Bun.Glob('**/*.{gbr,gih,png}').scanSync({ cwd: input })].filter((file) => requested.size === 0 || requested.has(file) || requested.has(basename(file)))
  if (!files.length) throw new Error('No selected .gbr, .gih, or .png inputs found')
  await mkdir(out, { recursive: true })
  const manifest: unknown[] = []
  for (const file of files.sort()) {
    const image = normalize(downsample(trim(decode(file, new Uint8Array(await Bun.file(join(input, file)).arrayBuffer()))), maximum))
    const id = slug(file)
    const filename = `${id}.png`
    await Bun.write(join(out, filename), grayscalePng(image))
    manifest.push({
      id: `${pack}.${id}`, name: title(id), pack, kind: 'stamp', hardness: 0.85, roundness: 1, angle: 0, spacing: 0.25,
      texture: { src: `/brushes/${pack}/${filename}`, width: image.width, height: image.height },
      defaults: {}, license: { spdx: license, pack: args['pack-name'] ?? pack, source, author },
    })
  }
  await Bun.write(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const licensePath = join(out, 'LICENSE')
  if (!(await Bun.file(licensePath).exists())) await Bun.write(licensePath, license === 'CC0-1.0' ? CC0_NOTICE : `${license}\n`)
  const notice = args.notice ?? join(out, '..', 'NOTICE.md')
  const count = manifest.length
  const row = `| \`${pack}\` | ${args['pack-name'] ?? pack} | ${author} | ${license} | ${source} | ${args.date ?? new Date().toISOString().slice(0, 10)} | ${count} |\n`
  const noticeFile = Bun.file(notice)
  const existing = (await noticeFile.exists()) ? await noticeFile.text() : '# Brush pack notices\n\n| Pack id | Name | Author | License | Source | Retrieved | Tips |\n|---|---|---|---|---|---|---|\n'
  await Bun.write(notice, existing.includes(`| \`${pack}\` |`) ? existing : `${existing}${row}`)
  console.log(`Converted ${count} tip(s) to ${out}`)
}

await main()
