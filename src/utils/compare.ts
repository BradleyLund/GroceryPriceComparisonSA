import type { BasketItem, Product, Store } from '../types'

export interface StoreTotal {
  store: Store
  total: number
  missingItems: Product[]
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
    }
    return { store, total, missingItems }
  })
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
