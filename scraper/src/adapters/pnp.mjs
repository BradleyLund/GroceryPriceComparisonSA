/**
 * Pick n Pay adapter.
 *
 * PnP runs an Angular/Spartacus storefront: the product page HTML is an empty
 * shell and the price arrives over XHR, so this adapter renders pages in a
 * real browser. Its backing OCC API (`/pnphybris/v2/pnp/products/...`) needs a
 * per-store session context that isn't reproducible from outside, so the
 * rendered DOM is the reliable source.
 *
 * Note PnP's robots.txt is the strictest of the five: it disallows search
 * paths, asks for a 10s crawl delay, and declares a 04:00-08:45 UTC visit
 * window. Discovery therefore uses the product sitemap, and the fetcher
 * enforces the delay and the window.
 */

import { extractSitemapLocs } from '../lib/html.mjs'
import { matchesKeywords } from '../lib/match.mjs'
import { cleanName, normalizeText, parsePrice, parseSize } from '../lib/normalize.mjs'

const ORIGIN = 'https://www.pnp.co.za'

/** "/nature-s-choice-coconut-milk-powder-450g/p/000000000000654899_EA" */
export function slugToName(url) {
  const m = url.match(/^https?:\/\/[^/]+\/([^/]+)\/p\//)
  if (!m) return ''
  return m[1]
    .replace(/(\d)-(\d)(?=\s*(kg|g|ml|l)\b)/gi, '$1.$2')
    .replace(/-/g, ' ')
    .trim()
}

export function shortlist(urls, spec, limit) {
  const wantSize = spec.size ? parseSize(spec.size) : null
  const scored = []
  for (const url of urls) {
    const name = slugToName(url)
    const text = normalizeText(name)
    if (!text) continue
    if (!matchesKeywords(text, spec)) continue

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

/** Runs inside the page. Keep it dependency-free and defensive. */
/* c8 ignore start */
function extractFromPage() {
  const pick = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      const txt = el?.textContent?.trim()
      if (txt) return txt
    }
    return null
  }
  return {
    name:
      pick(['h1', '[class*="product-name"]', '[class*="productName"]']) ??
      document.title.replace(/\s*\|\s*PnP\s*$/i, '').trim(),
    priceText: pick([
      '.cms-price-display-container .price',
      '[class*="price-display"] .price',
      '.price',
      '[class*="ProductPrice"]',
      '[data-testid*="price"]',
    ]),
    soldOut: /out of stock|sold out|unavailable/i.test(document.body.innerText.slice(0, 4000)),
  }
}
/* c8 ignore stop */

export const pnp = {
  id: 'pnp',
  label: 'Pick n Pay',
  strategy: 'browser',
  origin: ORIGIN,

  async collect({ fetcher, browser, catalog, log, candidatesPerItem }) {
    const indexXml = await fetcher.text(`${ORIGIN}/sitemap.xml`)
    const productSitemaps = extractSitemapLocs(indexXml).filter((u) => /PRODUCT-/i.test(u))
    log.info(`  ${productSitemaps.length} product sitemap(s)`)

    const productUrls = []
    for (const sm of productSitemaps) {
      // Sitemaps live on a CDN host with its own (permissive) robots.txt.
      const xml = await fetcher.text(sm)
      productUrls.push(...extractSitemapLocs(xml).filter((u) => u.includes('/p/')))
    }
    log.info(`  ${productUrls.length} product URLs discovered`)

    const byItem = new Map()
    let attempted = 0
    let failures = 0
    let lastError = null
    for (const item of catalog.items) {
      const candidates = shortlist(productUrls, item, candidatesPerItem)
      const products = []
      for (const candidate of candidates) {
        attempted += 1
        try {
          const data = await browser.evaluateOnPage(candidate.url, {
            waitFor: '.price, [class*="price-display"]',
            extract: extractFromPage,
          })
          const price = parsePrice(data?.priceText)
          if (price == null || data.soldOut) continue
          products.push({ name: cleanName(data.name || candidate.name), price, url: candidate.url })
        } catch (err) {
          failures += 1
          lastError = err
          log.warn(`  ${item.id}: ${candidate.url} — ${err.message}`)
        }
      }
      log.info(`  ${item.id}: ${products.length} priced candidate(s)`)
      byItem.set(item.id, products)
    }

    // Every page erroring means something broke (usually the browser), not
    // that the catalog is unstocked — surface it as a failure.
    if (attempted > 0 && failures === attempted) {
      throw new Error(`all ${failures} product pages failed — last error: ${lastError?.message}`)
    }
    return byItem
  },
}
