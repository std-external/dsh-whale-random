// Build the four whale animation variants as SVG sprite masks + CSS keyframes.
// Input: frames extracted from the official gifs (/var/cache/orange-tmp/whale/gN/*.png).
// Output: lib/client.js with one CSS string per variant.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FRAMES = '/var/cache/orange-tmp/whale'
const work = mkdtempSync(join(tmpdir(), 'whale-svg-'))

const VARIANTS = [
  { id: 'spin', dir: 'g1', size: 360, frames: 36, take: 12, duration: 0.72 },
  { id: 'turn', dir: 'g2', size: 360, frames: 24, take: 12, duration: 0.48 },
  { id: 'sway', dir: 'g3', size: 320, frames: 150, take: 15, duration: 3.0 },
  { id: 'wag', dir: 'g4', size: 360, frames: 24, take: 12, duration: 0.72 },
]

function pickFrames({ frames, take }) {
  const step = (frames - 1) / (take - 1)
  return Array.from({ length: take }, (_, k) => Math.round(1 + k * step))
}

/** Union trim box of the sampled frames, squared and padded so the art fills the icon. */
function contentBox(variant, picks) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const index of picks) {
    const src = `${FRAMES}/${variant.dir}/${String(index).padStart(3, '0')}.png`
    const [w, h, x, y] = execFileSync('identify', ['-format', '%@', src]).toString()
      .trim().match(/(\d+)x(\d+)\+(\d+)\+(\d+)/).slice(1).map(Number)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h)
  }
  const pad = 1.1
  const size = Math.round(Math.max(x1 - x0, y1 - y0) * pad)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return { size, left: Math.round(cx - size / 2), top: Math.round(cy - size / 2) }
}

function traceFrame(variant, index, box) {
  const src = `${FRAMES}/${variant.dir}/${String(index).padStart(3, '0')}.png`
  const pbm = join(work, `${variant.dir}-${index}.pbm`)
  execFileSync('convert', [src, '-background', 'white', '-alpha', 'remove',
    '-crop', `${box.size}x${box.size}+${box.left}+${box.top}`, '+repage',
    '-colorspace', 'gray', '-threshold', '65%', pbm])
  const svg = execFileSync('potrace', ['-s', '-o', '-', '--flat', '-O', '0.2', '-t', '2', '-a', '1.0', pbm],
    { maxBuffer: 1 << 24 }).toString()
  const path = svg.match(/<path d="([^"]+)"/)
  if (!path) throw new Error(`potrace produced no path for ${src}`)
  const d = path[1].replace(/\s+/g, ' ').replace(/([a-z]) /gi, '$1').trim()
  return `<g transform="translate(0 ${box.size}) scale(0.1 -0.1)"><path fill="#000" d="${d}"/></g>`
}

function spriteSvg(variant) {
  const picks = pickFrames(variant)
  const box = contentBox(variant, picks)
  const groups = picks.map((index, k) => {
    const body = traceFrame(variant, index, box)
    return `<g transform="translate(${k * box.size} 0)">${body}</g>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${picks.length * box.size} ${box.size}" width="${picks.length * box.size}" height="${box.size}">${groups.join('')}</svg>`
}

function dataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/%20/g, ' ')}`
}

function keyframes(variant) {
  const n = pickFrames(variant).length
  const keys = []
  for (let k = 0; k < n; k += 1) {
    const percent = (k / (n - 1)) * 100
    const pos = percent
    keys.push(`${percent.toFixed(4).replace(/\.?0+$/, '')}%{ -webkit-mask-position:${pos.toFixed(4).replace(/\.?0+$/, '')}% 0; mask-position:${pos.toFixed(4).replace(/\.?0+$/, '')}% 0 }`)
  }
  return `@keyframes dsh-whale-random-${variant.id} { ${keys.join(' ')} }`
}

const TARGET = '[data-chat-running] span[aria-hidden="true"] > span:first-child'
const STILL = '[data-chat-running] span[aria-hidden="true"] > svg'

function variantCss(variant) {
  const svg = spriteSvg(variant)
  const n = pickFrames(variant).length
  const uri = dataUri(svg)
  const esc = uri.replace(/"/g, '\\"')
  return `/* dsh-whale-random: ${variant.id} (${n} frames / ${variant.duration}s) */
@media (prefers-reduced-motion: no-preference) and (forced-colors: none) {
  @supports (mask-mode: alpha) {
    ${TARGET} {
      display: block !important;
      background: currentColor !important;
      -webkit-mask-image: url("${esc}");
      mask-image: url("${esc}");
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-size: ${n * 100}% 100%;
      mask-size: ${n * 100}% 100%;
      -webkit-mask-position: 0% 0;
      mask-position: 0% 0;
      -webkit-mask-mode: alpha;
      mask-mode: alpha;
      animation: dsh-whale-random-${variant.id} ${variant.duration}s steps(1, end) infinite;
    }
    ${STILL} { display: none !important }
  }
}
${keyframes(variant)}
`
}

const css = {}
for (const variant of VARIANTS) {
  css[variant.id] = variantCss(variant)
  process.stderr.write(`built ${variant.id}: ${(css[variant.id].length / 1024).toFixed(1)} KiB\n`)
}
writeFileSync(new URL('../src/variants.json', import.meta.url), JSON.stringify({ css }, null, 2))
process.stderr.write('wrote src/variants.json\n')

// The client module system serves one file per plugin, so the bundle is self-contained.
const CLIENT_TEMPLATE = `/**
 * dsh-whale-random — the Chat running-status whale, picked at random per page load.
 *
 * The official indicator is a 28x28 monochrome tail baked into a CSS \`mask\` of the
 * chat stylesheet. This plugin only appends one stylesheet of its own: it targets the
 * same element (\`[data-chat-running] span[aria-hidden="true"] > span:first-child\`),
 * paints it with \`currentColor\` and steps through an SVG sprite of the selected
 * animation with \`mask-position\`, which is animatable wherever the original mask is.
 *
 * Generated by scripts/build-css.mjs — edit that, not this file.
 */

/** One stylesheet per variant, each self-contained (sprite is inlined). */
const VARIANTS = __VARIANTS__

const PLUGIN_ID = 'dsh-whale-random'

/** Pick one variant for this page load. */
function pick() {
  const ids = Object.keys(VARIANTS)
  return ids[Math.floor(Math.random() * ids.length)] ?? ids[0]
}

/**
 * Install the chosen variant once for this page load.
 * @param ctx - client root context supplied by the dsh client module system.
 */
export function apply(ctx) {
  if (typeof document === 'undefined') return
  const id = pick()
  const css = VARIANTS[id]
  if (css === undefined) return
  const install = () => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.dshWhaleRandom = id
    tag.textContent = css
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }
  const effect = ctx && typeof ctx.effect === 'function' ? ctx.effect(install, 'whale-random:stylesheet') : install()
  return effect
}

export const inject = []
`
const bundle = CLIENT_TEMPLATE.replace('__VARIANTS__', JSON.stringify(css))
writeFileSync(new URL('../lib/client.js', import.meta.url), bundle)
process.stderr.write(`wrote lib/client.js (${(bundle.length / 1024).toFixed(1)} KiB)\n`)
