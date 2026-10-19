import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const variants = JSON.parse(readFileSync(new URL('../src/variants.json', import.meta.url), 'utf8')).css
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 640, height: 160 }, deviceScaleFactor: 4 })
await page.goto('file://' + new URL('./page.html', import.meta.url).pathname)

const support = await page.evaluate(() => ({
  maskMode: CSS.supports('mask-mode', 'alpha'),
  maskImage: CSS.supports('mask-image', 'url(data:image/svg+xml,%3Csvg/%3E)'),
  maskPosition: CSS.supports('mask-position', '50% 0'),
}))

const whale = '[data-chat-running] span[aria-hidden="true"] > span:first-child'
async function probe() {
  return page.$eval(whale, (el) => {
    const cs = getComputedStyle(el)
    return {
      display: cs.display,
      maskImage: (cs.maskImage || cs.webkitMaskImage || '').slice(0, 60),
      maskSize: cs.maskSize || cs.webkitMaskSize,
      maskPosition: cs.maskPosition || cs.webkitMaskPosition,
      background: cs.backgroundColor,
    }
  })
}

const before = await probe()
await page.screenshot({ path: '/var/cache/orange-tmp/whale-svg-plugin/test/before.png' })

const report = { support, before, variants: {}, shots: [] }
for (const [id, css] of Object.entries(variants)) {
  await page.evaluate((style) => {
    document.querySelectorAll('style[data-dsh-whale-test]').forEach((n) => n.remove())
    const tag = document.createElement('style')
    tag.dataset.dshWhaleTest = 'true'
    tag.textContent = style
    document.head.appendChild(tag)
  }, css)
  const states = []
  for (const wait of [0, 120, 240, 360]) {
    await page.waitForTimeout(wait === 0 ? 50 : 120)
    states.push(await probe())
  }
  const shot = `/var/cache/orange-tmp/whale-svg-plugin/test/after-${id}.png`
  await page.screenshot({ path: shot })
  report.variants[id] = states
  report.shots.push(shot)
}
writeFileSync('/var/cache/orange-tmp/whale-svg-plugin/test/report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ support, before, first: report.variants.wag?.slice(0, 2) }, null, 2))
await browser.close()
