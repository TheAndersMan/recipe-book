/**
 * Renders the app icon to build/icon.iconset, then leaves iconutil to pack it.
 *
 * Drawn procedurally rather than shipped as a binary asset: no image tooling to
 * install, it re-renders at every size natively (so small sizes stay crisp
 * instead of being downscaled), and the palette below is the only thing you
 * need to touch to restyle it.
 *
 *   npm run icon
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICONSET = join(ROOT, 'build', 'icon.iconset')

// ---------------------------------------------------------------- palette

const PALETTE = {
  fieldTop: [0xd0, 0x7c, 0x40],
  fieldBottom: [0x9b, 0x49, 0x22],
  page: [0xfd, 0xf9, 0xf2],
  pageShade: [0xec, 0xdf, 0xcb],
  rule: [0xdd, 0xae, 0x8e],
  spine: [0x5c, 0x27, 0x12],
  ribbon: [0x9c, 0x2f, 0x1e]
}

// Geometry is authored in a 1024-unit square and scaled to each output size.
const CANVAS = 1024
const SUPERSAMPLE = 4

// ---------------------------------------------------------------- shapes

function roundedRect(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius)
  const dy = Math.abs(y - cy) - (halfH - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - radius
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ]
}

/** Colour of the icon at one point in 1024-space, or null for transparent. */
function sample(x, y) {
  // The rounded field, inset like a standard macOS icon.
  if (roundedRect(x, y, 512, 512, 412, 412, 190) > 0) return null

  let colour = mix(PALETTE.fieldTop, PALETTE.fieldBottom, clamp((y - 100) / 824))

  // Soft shadow under the book, offset downward, so it lifts off the field.
  const shadow = roundedRect(x, y - 18, 512, 512, 250, 192, 26)
  if (shadow > 0 && shadow < 54) {
    const falloff = 1 - shadow / 54
    colour = mix(colour, [0, 0, 0], falloff * falloff * 0.22)
  }

  // Spine first; the pages overlap its edges and leave only the gap showing.
  if (roundedRect(x, y, 512, 512, 18, 192, 9) <= 0) colour = PALETTE.spine

  const onLeftPage = roundedRect(x, y, 380, 512, 118, 190, 26) <= 0
  const onRightPage = roundedRect(x, y, 644, 512, 118, 190, 26) <= 0

  if (onLeftPage || onRightPage) {
    // A touch of shade toward the spine so the two pages read as a fold.
    const towardSpine = 1 - Math.min(Math.abs(x - 512) / 140, 1)
    colour = mix(PALETTE.page, PALETTE.pageShade, towardSpine * 0.55)

    const pageCentre = onLeftPage ? 380 : 644
    for (let i = 0; i < 4; i++) {
      const ruleY = 404 + i * 58
      if (roundedRect(x, y, pageCentre, ruleY, 76, 9, 9) <= 0) colour = PALETTE.rule
    }
  }

  // Ribbon bookmark, laid over the right page with a notched tail.
  const inRibbon = roundedRect(x, y, 700, 557, 26, 235, 0) <= 0
  const inNotch = y >= 740 && Math.abs(x - 700) <= (y - 740) / 2
  if (inRibbon && !inNotch) colour = PALETTE.ribbon

  return colour
}

function clamp(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

// ---------------------------------------------------------------- raster

function render(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = CANVAS / size
  const step = 1 / SUPERSAMPLE
  const samples = SUPERSAMPLE * SUPERSAMPLE

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let hits = 0

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const colour = sample(
            (px + (sx + 0.5) * step) * scale,
            (py + (sy + 0.5) * step) * scale
          )
          if (!colour) continue
          r += colour[0]
          g += colour[1]
          b += colour[2]
          hits++
        }
      }

      const offset = (py * size + px) * 4
      if (hits > 0) {
        // Un-premultiply: average colour over covered samples, alpha = coverage.
        pixels[offset] = Math.round(r / hits)
        pixels[offset + 1] = Math.round(g / hits)
        pixels[offset + 2] = Math.round(b / hits)
        pixels[offset + 3] = Math.round((hits / samples) * 255)
      }
    }
  }

  return pixels
}

// ---------------------------------------------------------------- png

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // One filter byte (0 = None) per scanline.
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------------------------------------------------------------- output

// The filenames iconutil expects inside an .iconset directory.
const VARIANTS = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png']
]

mkdirSync(ICONSET, { recursive: true })

const cache = new Map()
for (const [size, name] of VARIANTS) {
  if (!cache.has(size)) cache.set(size, encodePng(size, render(size)))
  writeFileSync(join(ICONSET, name), cache.get(size))
  process.stdout.write(`  ${name}\n`)
}

writeFileSync(join(ROOT, 'build', 'icon.png'), cache.get(1024))
console.log('\nWrote build/icon.iconset and build/icon.png')
console.log('Now run: iconutil -c icns build/icon.iconset -o build/icon.icns')
