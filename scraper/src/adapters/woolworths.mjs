/**
 * Woolworths adapter.
 *
 * Woolworths is React-rendered and sits behind bot protection that serves an
 * instrumented shell to plain HTTP clients, so this adapter uses a browser.
 *
 * It scrapes *category grids* rather than individual product pages: one page
 * yields dozens of name/price pairs, which is far fewer requests than walking
 * products one at a time. Category URLs come from the published food sitemap,
 * and robots.txt disallows `/*searchterm`, so search is never used.
 */

import { extractSitemapLocs } from '../lib/html.mjs'
import { normalizeText, parsePrice } from '../lib/normalize.mjs'

const SITEMAP = 'https://content.woolworthsstatic.co.za/sitemap/food.xml'

/** Runs inside the page. */
/* c8 ignore start */
function extractGrid() {
  const seen = new Set()
  const out = []

  // Product tiles vary by template; anchor on the product link and walk up to
  // the card that also contains a price.
  const links = document.querySelectorAll('a[href*="/prod/"], a[href*="/p/"]')
  for (const link of links) {
    let card = link
    for (let i = 0; i < 6 && card; i += 1) {
      const text = card.innerText || ''
      if (/R\s?\d+[.,]\d{2}/.test(text) && text.trim().length > 6) break
      card = card.parentElement
    }
    if (!card) continue

    const text = (card.innerText || '').trim()
    const priceMatch = text.match(/R\s?\d+(?:[ ,]\d{3})*[.,]\d{2}/)
    if (!priceMatch) continue

    const name = (link.innerText || link.getAttribute('aria-label') || '').trim().split('\n')[0]
    if (!name || name.length < 3) continue

    const href = link.getAttribute('href') || ''
    const key = `${name}|${priceMatch[0]}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      name,
      priceText: priceMatch[0],
      url: href.startsWith('http') ? href : `https://www.woolworths.co.za${href}`,
      soldOut: /out of stock|sold out/i.test(text),
    })
  }
  return out
}
/* c8 ignore stop */

/**
 * Pick the category pages worth visiting for this catalog: any food category
 * whose slug mentions one of the item's keywords.
 */
export function selectCategories(categoryUrls, catalog, perItemLimit) {
  /** @type {Map<string, Set<string>>} url -> item ids it might serve */
  const chosen = new Map()

  for (const item of catalog.items) {
    const terms = [
      ...(item.categoryHints ?? []),
      ...(item.include ?? []),
      ...(item.any ?? []).flat(),
    ]
      .map((t) => normalizeText(t).replace(/\s+/g, '-'))
      .filter((t) => t.length >= 3)

    const matches = categoryUrls
      .filter((url) => terms.some((t) => url.toLowerCase().includes(t)))
      .slice(0, perItemLimit)

    for (const url of matches) {
      if (!chosen.has(url)) chosen.set(url, new Set())
      chosen.get(url).add(item.id)
    }
  }
  return chosen
}

export const woolworths = {
  id: 'woolworths',
  label: 'Woolworths',
  strategy: 'browser',

  async collect({ fetcher, browser, catalog, log, candidatesPerItem }) {
    const xml = await fetcher.text(SITEMAP)
    const categoryUrls = extractSitemapLocs(xml).filter((u) => u.includes('/browse/food'))
    log.info(`  ${categoryUrls.length} food category URLs in sitemap`)

    const chosen = selectCategories(categoryUrls, catalog, Math.max(2, Math.ceil(candidatesPerItem / 2)))
    log.info(`  visiting ${chosen.size} category page(s)`)

    /** Pool of every product seen across the visited grids. */
    const pool = []
    for (const url of chosen.keys()) {
      try {
        const rows = await browser.evaluateOnPage(url, {
          waitFor: 'a[href*="/prod/"], a[href*="/p/"]',
          extract: extractGrid,
          settleMs: 1800,
        })
        let added = 0
        for (const row of rows ?? []) {
          const price = parsePrice(row.priceText)
          if (price == null || row.soldOut) continue
          pool.push({ name: row.name, price, url: row.url })
          added += 1
        }
        log.info(`    ${added.toString().padStart(3)} products — ${url.split('/browse/')[1] ?? url}`)
      } catch (err) {
        log.warn(`  category failed: ${url} — ${err.message}`)
      }
    }
    log.info(`  ${pool.length} products pooled`)

    // Every item matches against the whole pool; the matcher does the filtering.
    const byItem = new Map()
    for (const item of catalog.items) byItem.set(item.id, pool)
    return byItem
  },
}
