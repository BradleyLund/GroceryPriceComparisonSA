/**
 * Adapter for the Shoprite Group storefronts (Shoprite and Checkers).
 *
 * Both run the same Next.js platform and, helpfully, ship complete
 * schema.org Product JSON-LD (including `offers.price`) in the server-rendered
 * HTML — so no browser is needed.
 *
 * Discovery goes through the product sitemaps rather than the search endpoint:
 * it is the documented, robots-friendly path, and the slugs carry enough of
 * the product name to shortlist candidates before fetching any page.
 */

import { extractJsonLd, findProductNode, extractSitemapLocs } from '../lib/html.mjs'
import { matchesKeywords } from '../lib/match.mjs'
import { cleanName, normalizeText, parsePrice, parseSize } from '../lib/normalize.mjs'

/** Slug -> rough product name, e.g. "sasko-white-bread-700g-10241929EA". */
export function slugToName(url) {
  const slug = url.split('/product/')[1] ?? ''
  return (
    slug
      .replace(/-\d+[A-Z]{2}$/, '') // trailing SKU
      // Slugs flatten decimals: "cake-flour-2-5kg" means 2.5kg, not 5kg.
      .replace(/(\d)-(\d)(?=\s*(kg|g|ml|l)\b)/gi, '$1.$2')
      .replace(/-/g, ' ')
      .trim()
  )
}

/**
 * Shortlist sitemap URLs whose slug already looks like the item we want.
 * This keeps us from fetching tens of thousands of product pages.
 */
export function shortlist(urls, spec, limit) {
  const wantSize = spec.size ? parseSize(spec.size) : null
  const scored = []

  for (const url of urls) {
    const name = slugToName(url)
    const text = normalizeText(name)
    if (!text) continue
    if (!matchesKeywords(text, spec)) continue

    // Prefer slugs whose embedded size already matches — cheap pre-filter.
    const gotSize = parseSize(name)
    let bonus = 0
    if (wantSize && gotSize) {
      if (gotSize.base !== wantSize.base) continue
      const ratio = Math.min(gotSize.amount, wantSize.amount) / Math.max(gotSize.amount, wantSize.amount)
      if (ratio < 0.5) continue
      bonus = ratio
    }
    scored.push({ url, name, bonus, length: text.length })
  }

  scored.sort((a, b) => b.bonus - a.bonus || a.length - b.length)
  return scored.slice(0, limit)
}

export function createShopriteGroupAdapter({ id, label, origin }) {
  return {
    id,
    label,
    strategy: 'http',

    async collect({ fetcher, catalog, log, candidatesPerItem }) {
      const indexXml = await fetcher.text(`${origin}/sitemap.xml`)
      const productSitemaps = extractSitemapLocs(indexXml).filter((u) => /product-sitemap/i.test(u))
      log.info(`  ${productSitemaps.length} product sitemap(s)`)

      /** @type {string[]} */
      const productUrls = []
      for (const sm of productSitemaps) {
        const xml = await fetcher.text(sm)
        productUrls.push(...extractSitemapLocs(xml).filter((u) => u.includes('/product/')))
      }
      log.info(`  ${productUrls.length} product URLs discovered`)

      /** @type {Map<string, object[]>} itemId -> candidate products */
      const byItem = new Map()

      for (const item of catalog.items) {
        const candidates = shortlist(productUrls, item, candidatesPerItem)
        if (!candidates.length) {
          log.warn(`  ${item.id}: no sitemap candidates`)
          byItem.set(item.id, [])
          continue
        }

        const products = []
        for (const candidate of candidates) {
          try {
            const html = await fetcher.text(candidate.url)
            const node = findProductNode(extractJsonLd(html))
            if (!node) continue
            const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
            const price = parsePrice(offers?.price)
            if (price == null) continue
            // Skip anything explicitly out of stock — an unavailable price is
            // not a price this shopper could actually pay.
            const availability = String(offers?.availability ?? '')
            if (/OutOfStock|SoldOut|Discontinued/i.test(availability)) continue
            products.push({
              name: cleanName(node.name ?? candidate.name),
              price,
              url: candidate.url,
              sku: node.sku ? String(node.sku) : undefined,
            })
          } catch (err) {
            log.warn(`  ${item.id}: ${candidate.url} — ${err.message}`)
          }
        }
        log.info(`  ${item.id}: ${products.length} priced candidate(s)`)
        byItem.set(item.id, products)
      }

      return byItem
    },
  }
}

export const shoprite = createShopriteGroupAdapter({
  id: 'shoprite',
  label: 'Shoprite',
  origin: 'https://www.shoprite.co.za',
})

export const checkers = createShopriteGroupAdapter({
  id: 'checkers',
  label: 'Checkers',
  origin: 'https://www.checkers.co.za',
})
