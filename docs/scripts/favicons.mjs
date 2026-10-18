#!/usr/bin/env node
/**
 * Favicons for the docs site, from an icon in assets/logo/.
 *
 *   pnpm --filter ./docs favicons
 *
 * Run it after changing the icon; the results are committed in docs/public/.
 *
 *   favicon.svg           modern browsers; dark brown, cream in a dark UI
 *   favicon.ico           16 + 32 px for browsers without SVG favicons; on a
 *                         paper-coloured tile, since it cannot follow a dark UI
 *   apple-touch-icon.png  180 px for iOS home screens; opaque, iOS rounds it
 *
 * Any SVG export works: the drawing is kept as it is (groups, transforms, clip
 * paths), only its colours are replaced, and a non-square canvas is padded to
 * a square around it.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/**
 * The icon, and how much to thicken its lines, as a fraction of its width.
 * A filled silhouette needs nothing; fine line art all but vanishes at tab
 * size and needs about 0.03, which outlines every shape in its own colour.
 */
const ICON = { file: 'logo_filled.svg', stroke: 0 }

// From the docs palette (theme/custom.css).
const INK = '#342923' // --vp-c-text-1, light
const CREAM = '#e8e0d4' // --vp-c-text-1, dark
const PAPER = '#fdfaf6' // --vp-c-bg, light

const logo = name => fileURLToPath(new URL(`../../assets/logo/${name}`, import.meta.url))
const out = name => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

/** The drawing inside an SVG file, without its colours, and its canvas. */
async function load(name) {
  const source = await readFile(logo(name), 'utf8')
  const root = /<svg\b[^>]*>/.exec(source)
  const viewBox = root && /viewBox="([^"]+)"/.exec(root[0])?.[1].trim().split(/[\s,]+/).map(Number)
  if (!root || viewBox?.length !== 4) throw new Error(`no <svg viewBox> in ${name}`)
  const body = source.slice(root.index + root[0].length, source.lastIndexOf('</svg>'))
    .replace(/\s(?:fill|stroke)="[^"]*"/g, '')
    .replace(/\sstyle="([^"]*)"/g, (_, css) => {
      const kept = css.split(';').filter(rule => rule.trim() && !/^\s*(?:fill|stroke)\s*:/.test(rule))
      return kept.length ? ` style="${kept.join(';')}"` : ''
    })
  return { viewBox, body }
}

/** The canvas grown to a square, the drawing centred in it. */
function square([x, y, width, height]) {
  const size = Math.max(width, height)
  return [x - (size - width) / 2, y - (size - height) / 2, size, size].map(n => +n.toFixed(3))
}

/** The icon on a square canvas in one colour; the drawing inherits it. */
function svg({ viewBox, body }, { color, dark }) {
  const box = square(viewBox)
  const stroke = ICON.stroke && ` stroke="${color}" stroke-width="${+(ICON.stroke * box[2]).toFixed(3)}" stroke-linejoin="round"`
  const style = dark
    ? `<style>@media (prefers-color-scheme: dark) { svg { fill: ${dark};${ICON.stroke ? ` stroke: ${dark};` : ''} } }</style>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" fill="${color}"${stroke || ''}>${style}${body}</svg>\n`
}

/** A PNG of the icon on a square tile, `padding` as a fraction of the size. */
async function png(icon, size, { background, padding, radius = 0 }) {
  const inner = Math.round(size * (1 - 2 * padding))
  const drawing = await sharp(Buffer.from(svg(icon, { color: INK }))).resize(inner, inner).png().toBuffer()
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius * size}" fill="${background}"/></svg>`
  return sharp(Buffer.from(tile)).composite([{ input: drawing, gravity: 'center' }]).png().toBuffer()
}

/** An .ico holding PNG images, which every browser that reads .ico accepts. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i
    header.writeUInt8(size % 256, entry) // 0 means 256
    header.writeUInt8(size % 256, entry + 1)
    header.writeUInt16LE(1, entry + 4) // colour planes
    header.writeUInt16LE(32, entry + 6) // bits per pixel
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...images.map(image => image.data)])
}

const icon = await load(ICON.file)

await writeFile(out('favicon.svg'), svg(icon, { color: INK, dark: CREAM }))

const tile = { background: PAPER, padding: 0.06, radius: 0.2 }
await writeFile(out('favicon.ico'), ico([
  { size: 16, data: await png(icon, 16, tile) },
  { size: 32, data: await png(icon, 32, tile) },
]))

await writeFile(out('apple-touch-icon.png'), await png(icon, 180, { background: PAPER, padding: 0.12 }))

console.log(`wrote docs/public/favicon.svg, favicon.ico, apple-touch-icon.png from assets/logo/${ICON.file}`)
