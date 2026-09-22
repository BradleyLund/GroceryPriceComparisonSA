/**
 * Text, size and price normalisation shared by every adapter.
 *
 * Store product names are messy ("SASKO Premium Slices White Bread 700g",
 * "Woolworths Full Cream Milk 2 L"), so everything is reduced to a comparable
 * shape before matching against our generic catalog.
 */

/**
 * Tidy a product name for display.
 *
 * Some retailer pages declare UTF-8 but emit Latin-1 bytes for symbols like
 * "®", which decode to U+FFFD and would otherwise be stored and shown as "�"
 * (e.g. "Pink Lady� Apples").
 */
export function cleanName(s) {
  return String(s ?? '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9.%'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(s) {
  return normalizeText(s).split(' ').filter(Boolean)
}

/**
 * Parse a price out of a string like "R 19,99", "R19.99", "1 299,00".
 * SA sites use both comma and dot as the decimal separator.
 */
export function parsePrice(input) {
  // Zero is never a real price — Shoprite reports unavailable products as
  // `price: 0`, which must not become a free item in the basket.
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : null
  if (!input) return null
  const cleaned = String(input)
    .replace(/[Rr]\s*/g, ' ')
    .replace(/ /g, ' ')
    .trim()
  const m = cleaned.match(/(\d{1,3}(?:[ ,.]\d{3})*|\d+)(?:[.,](\d{1,2}))?/)
  if (!m) return null
  const whole = m[1].replace(/[ ,.]/g, '')
  const frac = m[2] ?? '0'
  const value = Number(`${whole}.${frac.padEnd(2, '0')}`)
  return Number.isFinite(value) && value > 0 ? value : null
}

const UNIT_ALIASES = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  ml: 'ml',
  l: 'l',
  litre: 'l',
  liter: 'l',
  litres: 'l',
}

/** Convert a quantity+unit to a canonical base unit (grams or millilitres). */
function toBase(value, unit) {
  switch (unit) {
    case 'g':
      return { amount: value, base: 'g' }
    case 'kg':
      return { amount: value * 1000, base: 'g' }
    case 'ml':
      return { amount: value, base: 'ml' }
    case 'l':
      return { amount: value * 1000, base: 'ml' }
    default:
      return null
  }
}

/**
 * Extract a size from a product name or unit label.
 * Handles "700g", "2.5 kg", "1 L", "6 x 500ml", "18 pack", "9s", "80s".
 * @returns {{kind:'mass'|'volume'|'count', amount:number, base:string}|null}
 */
export function parseSize(input) {
  const text = normalizeText(input)
  if (!text) return null

  // Multipacks: "6 x 500ml" -> 3000ml
  const multi = text.match(/(\d+)\s*[x*]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litres?|grams?)\b/)
  if (multi) {
    const unit = UNIT_ALIASES[multi[3]]
    const conv = toBase(Number(multi[2]), unit)
    if (conv) {
      return {
        kind: conv.base === 'g' ? 'mass' : 'volume',
        amount: conv.amount * Number(multi[1]),
        base: conv.base,
      }
    }
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litres?|liters?|grams?)\b/)
  if (single) {
    const unit = UNIT_ALIASES[single[2]]
    const conv = toBase(Number(single[1]), unit)
    if (conv) {
      return { kind: conv.base === 'g' ? 'mass' : 'volume', amount: conv.amount, base: conv.base }
    }
  }

  // Counts: "18 pack", "pack of 18", "18s", "18 ea"
  const packOf = text.match(/pack\s+of\s+(\d+)/)
  if (packOf) return { kind: 'count', amount: Number(packOf[1]), base: 'count' }

  const count = text.match(/(\d+)\s*(?:pack|pk|s|ea|each|units?|rolls?|bags?|tablets?)\b/)
  if (count) return { kind: 'count', amount: Number(count[1]), base: 'count' }

  return null
}

/**
 * How close two sizes are, 0..1. Different kinds (mass vs count) score 0.
 * A 10% tolerance still scores highly — "1kg" vs "1.05kg" is the same shop.
 */
export function sizeSimilarity(a, b) {
  if (!a || !b) return null
  if (a.base !== b.base) return 0
  if (a.amount === 0 || b.amount === 0) return 0
  const ratio = Math.min(a.amount, b.amount) / Math.max(a.amount, b.amount)
  if (ratio >= 0.9) return 1
  if (ratio >= 0.75) return 0.6
  if (ratio >= 0.5) return 0.2
  return 0
}

/**
 * True for names like "6 x 330ml" or "4x100g" — a case/value pack rather than
 * the single container our catalog quotes.
 */
export function isMultipack(input) {
  return /\b\d+\s*[x*]\s*\d/.test(normalizeText(input))
}

/** Round to cents. */
export function roundCents(n) {
  return Math.round(n * 100) / 100
}
