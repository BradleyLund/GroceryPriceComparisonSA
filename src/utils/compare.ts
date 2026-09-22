import type { BasketItem, Product, Store } from '../types'

export interface StoreTotal {
  store: Store
  total: number
  missingItems: Product[]
  /** Distinct basket lines this store could actually price. */
  pricedCount: number
  /**
   * True when the store priced every line in the basket. Only complete stores
   * are comparable: a store missing items has an artificially low total, and a
   * store with no data at all would otherwise total R0 and rank "cheapest".
   */
  complete: boolean
}

export interface BestPick {
  store: Store
  price: number
}

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
})

export function formatZAR(value: number): string {
  return currency.format(value)
}

export function computeStoreTotals(
  basket: BasketItem[],
  products: Product[],
  stores: Store[],
): StoreTotal[] {
  return stores.map((store) => {
    let total = 0
    let pricedCount = 0
    const missingItems: Product[] = []
    for (const item of basket) {
      const product = products.find((p) => p.id === item.productId)
      if (!product) continue
      const price = product.prices[store.id]
      if (price == null) {
        missingItems.push(product)
        continue
      }
      total += price * item.quantity
      pricedCount += 1
    }
    return { store, total, missingItems, pricedCount, complete: pricedCount > 0 && missingItems.length === 0 }
  })
}

export interface RankedTotals {
  /** Stores that priced the whole basket, cheapest first. */
  comparable: StoreTotal[]
  /** Stores missing at least one item, most complete first. */
  incomplete: StoreTotal[]
}

/**
 * Split totals into comparable and incomplete. Ranking only the complete
 * stores keeps a store with partial (or no) price data from winning on a
 * total that simply omits what it couldn't price.
 */
export function rankStoreTotals(totals: StoreTotal[]): RankedTotals {
  const comparable = totals.filter((t) => t.complete).sort((a, b) => a.total - b.total)
  const incomplete = totals
    .filter((t) => !t.complete)
    .sort((a, b) => b.pricedCount - a.pricedCount || a.store.name.localeCompare(b.store.name))
  return { comparable, incomplete }
}

export function cheapestFor(product: Product, stores: Store[]): BestPick | null {
  let best: BestPick | null = null
  for (const store of stores) {
    const price = product.prices[store.id]
    if (price == null) continue
    if (!best || price < best.price) {
      best = { store, price }
    }
  }
  return best
}

export function computeMixAndMatchTotal(
  basket: BasketItem[],
  products: Product[],
  stores: Store[],
): number {
  let total = 0
  for (const item of basket) {
    const product = products.find((p) => p.id === item.productId)
    if (!product) continue
    const best = cheapestFor(product, stores)
    if (best) total += best.price * item.quantity
  }
  return total
}
