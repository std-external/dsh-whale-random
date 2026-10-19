// Verification harness: renders the real running-status DOM with the real chat
// stylesheet, then installs lib/client.js exactly as the client module system would.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const moduleSource = bundle
  .replace('export function apply', 'function apply')
  .replace('export const inject', 'const inject')
const expected = JSON.parse(
  bundle.match(/const VARIANTS = (\{[\s\S]*?\})\n\nconst PLUGIN_ID/)[1],
)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 640, height: 120 }, deviceScaleFactor: 4 })
await page.goto('file://' + new URL('./page.html', import.meta.url).pathname)
await page.evaluate((src) => { (0, eval)(`${src}\nwindow.__apply = apply`) }, moduleSource)

const support = await page.evaluate(() => ({
  maskMode: CSS.supports('mask-mode', 'alpha'),
  maskImage: CSS.supports('mask-image', 'url(data:image/svg+xml,%3Csvg/%3E)'),
  maskPosition: CSS.supports('mask-position', '50% 0'),
}))

const WHALE = '[data-chat-running] span[aria-hidden="true"] > span:first-child'
const probe = () => page.$eval(WHALE, (el) => {
  const cs = getComputedStyle(el)
  return {
    display: cs.display,
    maskImage: (cs.maskImage || cs.webkitMaskImage || '').slice(0, 46),
    maskSize: cs.maskSize || cs.webkitMaskSize,
    maskPosition: cs.maskPosition || cs.webkitMaskPosition,
    background: cs.backgroundColor,
  }
})

const before = await probe()
await page.screenshot({ path: new URL('./before.png', import.meta.url).pathname })

const report = { support, before, installed: {}, positions: {}, bundles: {} }
for (const id of Object.keys(expected)) {
  await page.evaluate((variant) => {
    document.querySelectorAll('style[data-plugin="dsh-whale-random"]').forEach((n) => n.remove())
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-whale-random'
    tag.dataset.dshWhaleRandom = variant
    tag.textContent = __VARIANTS_CSS[variant]
    document.head.appendChild(tag)
  }, id).catch(async () => {
    // first pass: expose the bundle's own CSS table to the page
    await page.evaluate((css) => { window.__VARIANTS_CSS = css }, expected)
    await page.evaluate((variant) => {
      document.querySelectorAll('style[data-plugin="dsh-whale-random"]').forEach((n) => n.remove())
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-whale-random'
      tag.dataset.dshWhaleRandom = variant
      tag.textContent = window.__VARIANTS_CSS[variant]
      document.head.appendChild(tag)
    }, id)
  })
  report.installed[id] = await probe()
  const positions = []
  for (let i = 0; i < 4; i += 1) {
    positions.push((await probe()).maskPosition)
    await page.waitForTimeout(120)
  }
  report.positions[id] = positions
  await page.screenshot({ path: new URL(`./after-${id}.png`, import.meta.url).pathname })
}

// End-to-end: run the plugin's own apply() and confirm it installs one tagged tag.
report.e2e = await page.evaluate(() => {
  document.querySelectorAll('style[data-plugin="dsh-whale-random"]').forEach((n) => n.remove())
  window.__apply({})
  const tags = document.querySelectorAll('style[data-plugin="dsh-whale-random"]')
  return { tags: tags.length, variant: tags[0]?.dataset.dshWhaleRandom ?? null }
})

writeFileSync(new URL('./report.json', import.meta.url).pathname, JSON.stringify(report, null, 2))
console.log(JSON.stringify({
  support,
  before: before.maskImage.slice(0, 40),
  installed: Object.fromEntries(Object.entries(report.installed).map(([k, v]) => [k, { maskSize: v.maskSize, bg: v.background }])),
  positions: report.positions,
  e2e: report.e2e,
}, null, 2))
await browser.close()
