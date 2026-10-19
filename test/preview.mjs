// Screenshot row: stock indicator, then each variant frozen at its first frame.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const css = JSON.parse(bundle.match(/const VARIANTS = (\{[\s\S]*?\})\n\nconst PLUGIN_ID/)[1])
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 460, height: 90 }, deviceScaleFactor: 4 })
await page.goto('file://' + new URL('./page.html', import.meta.url).pathname)
await page.screenshot({ path: new URL('./p-before.png', import.meta.url).pathname })
for (const id of Object.keys(css)) {
  await page.evaluate(({ id, style }) => {
    document.querySelectorAll('style[data-plugin="dsh-whale-random"]').forEach((n) => n.remove())
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-whale-random'
    tag.dataset.dshWhaleRandom = id
    tag.textContent = style
    document.head.appendChild(tag)
    // freeze on frame 0 for a legible still
    const el = document.querySelector('[data-chat-running] span[aria-hidden="true"] > span:first-child')
    el.style.animation = 'none'
    el.style.maskPosition = '0% 0'
  }, { id, style: css[id] })
  await page.screenshot({ path: new URL(`./p-${id}.png`, import.meta.url).pathname })
}
await browser.close()
