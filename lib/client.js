/**
 * dsh-whale-random — the Chat running-status whale, picked at random per page load.
 *
 * The official indicator is a 28×28 monochrome tail baked into a CSS `mask` of the
 * chat stylesheet. This plugin only appends one stylesheet of its own: it targets
 * the same element (`[data-chat-running] span[aria-hidden="true"] > span:first-child`),
 * paints it with `currentColor` and steps through an SVG sprite of the selected
 * animation with `mask-position`, which is animatable everywhere the original mask is.
 */
import { variants } from './variants.js'

const PLUGIN_ID = 'dsh-whale-random'

function pick() {
  const ids = Object.keys(variants)
  return ids[Math.floor(Math.random() * ids.length)] ?? ids[0]
}

/**
 * Install the chosen variant once for this page load.
 * @param ctx - client root context supplied by the dsh client module system.
 */
export function apply(ctx) {
  if (typeof document === 'undefined') return
  const id = pick()
  const css = variants[id]
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
  if (ctx !== undefined && typeof ctx.effect === 'function') ctx.effect(install, 'whale-random:stylesheet')
  else install()
}

export const inject = []
