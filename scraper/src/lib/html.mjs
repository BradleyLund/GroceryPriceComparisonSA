/** Small HTML/XML helpers — enough to avoid pulling in a DOM library. */

/** Extract and parse every <script type="application/ld+json"> block. */
export function extractJsonLd(html) {
  const out = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim())
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      // Malformed block — skip it rather than failing the whole page.
    }
  }
  return out
}

/** Find the first schema.org Product node, including inside @graph wrappers. */
export function findProductNode(nodes) {
  const queue = [...nodes]
  while (queue.length) {
    const node = queue.shift()
    if (!node || typeof node !== 'object') continue
    if (node['@type'] === 'Product') return node
    if (Array.isArray(node['@graph'])) queue.push(...node['@graph'])
  }
  return null
}

/** Pull <loc> values out of a sitemap or sitemap index. */
export function extractSitemapLocs(xml) {
  const out = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi
  let m
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].replace(/&amp;/g, '&'))
  }
  return out
}

/** Decode the handful of XML/HTML entities that show up in product names. */
export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
}
