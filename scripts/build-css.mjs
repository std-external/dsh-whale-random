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

function traceFrame(dir, index, size) {
  const src = `${FRAMES}/${dir}/${String(index).padStart(3, '0')}.png`
  const pbm = join(work, `${dir}-${index}.pbm`)
  execFileSync('convert', [src, '-background', 'white', '-alpha', 'remove',
    '-colorspace', 'gray', '-threshold', '65%', pbm])
  const svg = execFileSync('potrace', ['-s', '-o', '-', '--flat', '-O', '0.2', '-t', '2', '-a', '1.0', pbm],
    { maxBuffer: 1 << 24 }).toString()
  const path = svg.match(/<path d="([^"]+)"/)
  if (!path) throw new Error(`potrace produced no path for ${src}`)
  const d = path[1].replace(/\s+/g, ' ').replace(/([a-z]) /gi, '$1').trim()
  // potrace draws in a 10x coordinate space flipped along y.
  return `<g transform="translate(0 ${size}) scale(0.1 -0.1)"><path fill="#000" d="${d}"/></g>`
}

function spriteSvg(variant) {
  const picks = pickFrames(variant)
  const groups = picks.map((index, k) => {
    const body = traceFrame(variant.dir, index, variant.size)
    return `<g transform="translate(${k * variant.size} 0)">${body}</g>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${picks.length * variant.size} ${variant.size}" width="${picks.length * variant.size}" height="${variant.size}">${groups.join('')}</svg>`
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
