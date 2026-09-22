/**
 * Scores a real store product against one of our generic catalog items.
 *
 * The catalog describes things like "White bread, 700g loaf". Stores sell
 * "SASKO Premium Slices White Bread 700g". Matching is keyword + size based
 * and deliberately conservative: it is far better to report "not found" than
 * to silently price a 2L milk as if it were 1L.
 */

import { isMultipack, normalizeText, parseSize, sizeSimilarity } from './normalize.mjs'

const MIN_SCORE = 0.55

/**
 * Word-boundary containment, so "butter" does not match "butternut" and
 * "oil" does not match "boiled". Phrases may span several words.
 */
export function hasPhrase(haystack, phrase) {
  const p = normalizeText(phrase)
  if (!p) return false
  return new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(haystack)
}

/**
 * Keyword-only half of the spec (no size check). Shared with the sitemap
 * shortlisting step so both stages agree on what "matches" means.
 */
export function matchesKeywords(text, spec) {
  // `noMultipack` items are quoted as a single container (a 2L bottle), so a
  // "6 x 2L" case is a different product even though the keywords all match.
  if (spec.noMultipack && isMultipack(text)) return false
  if ((spec.exclude ?? []).some((t) => hasPhrase(text, t))) return false
  if ((spec.include ?? []).some((t) => !hasPhrase(text, t))) return false
  if ((spec.any ?? []).some((group) => !group.some((t) => hasPhrase(text, t)))) return false
  return true
}

/**
 * @param {{name:string, price:number|null, size?:object|null}} product
 * @param {object} spec  catalog match spec: { include, any, exclude, size }
 * @returns {{score:number, reasons:string[]}|null} null when disqualified
 */
export function scoreProduct(product, spec) {
  const text = normalizeText(product.name)
  if (!text) return null
  if (!matchesKeywords(text, spec)) return null
  const reasons = [`kw:${(spec.include ?? []).length}+${(spec.any ?? []).length}`]

  // Size agreement carries most of the weight once keywords pass.
  const wantSize = spec.size ? parseSize(spec.size) : null
  const gotSize = product.size ?? parseSize(product.name)
  let sizeScore = 0.5 // neutral when we can't tell
  if (wantSize && gotSize) {
    const sim = sizeSimilarity(wantSize, gotSize)
    if (sim === 0) return null // wrong size is a wrong product
    sizeScore = sim
    reasons.push(`size:${sim}`)
  } else if (wantSize && !gotSize) {
    sizeScore = 0.35
    reasons.push('size:unknown')
  }

  // Prefer shorter names — they tend to be the plain staple rather than a
  // flavoured or gift-pack variant.
  const brevity = Math.max(0, 1 - Math.max(0, text.split(' ').length - 4) / 12)

  const score = 0.45 + 0.4 * sizeScore + 0.15 * brevity
  return score >= MIN_SCORE ? { score, reasons } : null
}

/**
 * Choose the best product for a catalog item.
 * Ties break toward the cheaper item, which keeps the comparison honest:
 * we quote each store's cheapest qualifying option for the same thing.
 */
export function pickBest(products, spec) {
  let best = null
  for (const product of products) {
    if (product.price == null) continue
    const scored = scoreProduct(product, spec)
    if (!scored) continue
    const candidate = { ...product, score: scored.score, reasons: scored.reasons }
    if (
      !best ||
      candidate.score > best.score + 0.02 ||
      (Math.abs(candidate.score - best.score) <= 0.02 && candidate.price < best.price)
    ) {
      best = candidate
    }
  }
  return best
}
