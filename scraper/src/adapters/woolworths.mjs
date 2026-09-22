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

/**
 * Runs inside the page.
 *
 * Woolworths product tiles are not anchors — they're divs with click
 * handlers — so there is no product link to key off. Instead this anchors on
 * each price leaf (a bare `<strong>R 129.99</strong>`) and walks up to the
 * smallest ancestor that also carries a product name.
 */
/* c8 ignore start */
function extractGrid() {
  const PRICE = /R\s?\d+(?:[ ,]\d{3})*[.,]\d{2}/
  const isPriceOnly = (t) => new RegExp(`^${PRICE.source}$`).test(t)
  const isNoise = (l) =>
    isPriceOnly(l) ||
    PRICE.test(l) || // promo lines like "BUY ANY 2 FOR R230"
    /^\(\d+\)$/.test(l) || // review count
    /^(buy|save|was|new|add|quick|out of stock|sold out)/i.test(l)

  const priceLeaves = [...document.querySelectorAll('*')].filter(
    (el) => el.children.length === 0 && isPriceOnly((el.textContent || '').trim()),
  )

  const seen = new Set()
  const out = []

  for (const leaf of priceLeaves) {
    const priceText = (leaf.textContent || '').trim()
    let card = leaf
    for (let i = 0; i < 8 && card.parentElement; i += 1) {
      card = card.parentElement
      const lines = (card.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

      // More than a tile's worth of lines means we've walked up into a grid
      // container and the "name" would belong to a different product.
      if (lines.length > 8) break
      if (!lines.some(isPriceOnly)) continue

      const name = lines.find((l) => !isNoise(l) && l.length > 4)
      if (!name) continue

      const key = `${name}|${priceText}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({
          name,
          priceText,
          url: location.href,
          soldOut: /out of stock|sold out/i.test(card.innerText || ''),
        })
      }
      break
    }
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
    // `include` terms identify the product; `any` terms are variant
    // qualifiers ("white", "plain") that match unrelated aisles — "white"
    // pulls in pink-white-wine — so they only break ties, never select.
    const primary = [...(item.categoryHints ?? []), ...(item.include ?? [])]
      .map((t) => normalizeText(t).replace(/\s+/g, '-'))
      .filter((t) => t.length >= 3)
    const secondary = (item.any ?? [])
      .flat()
      .map((t) => normalizeText(t).replace(/\s+/g, '-'))
      .filter((t) => t.length >= 3)

    if (!primary.length) continue

    const scored = []
    for (const url of categoryUrls) {
      const lower = url.toLowerCase()
      // Only the last path segment really names the aisle; matching anywhere
      // in the path lets a parent section drag in every child category.
      const leaf = lower.split('/').filter(Boolean).pop() ?? ''
      if (!primary.some((t) => leaf.includes(t))) continue

      let score = 0
      score += primary.filter((t) => leaf.includes(t)).length * 2
      score += secondary.filter((t) => lower.includes(t)).length
      // Promotional and campaign landing pages carry a thin, rotating subset
      // of stock; prefer the permanent aisle.
      if (/\/(promotions|banners|food-basket)\//.test(lower)) score -= 3
      score -= lower.split('/').length * 0.1 // prefer shallower, canonical paths

      scored.push({ url, score })
    }

    scored.sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    for (const { url } of scored.slice(0, perItemLimit)) {
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
  origin: 'https://www.woolworths.co.za',

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
          // Tiles have no stable class or link to wait on, so wait for at
          // least a few rendered prices instead.
          waitForFunction: () => (document.body.innerText.match(/R\s?\d+[.,]\d{2}/g) || []).length >= 3,
          extract: extractGrid,
          settleMs: 1200,
          waitTimeout: 12_000,
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
