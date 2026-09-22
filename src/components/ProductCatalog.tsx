import { useMemo, useState } from 'react'
import { STORES } from '../data/stores'
import type { BasketItem, Product } from '../types'
import { cheapestFor, formatZAR } from '../utils/compare'
import { QuantityStepper } from './QuantityStepper'

interface ProductCatalogProps {
  products: Product[]
  basket: BasketItem[]
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
}

export function ProductCatalog({
  products,
  basket,
  onIncrement,
  onDecrement,
}: ProductCatalogProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('All')

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.category)))],
    [products],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      const matchesQuery = q === '' || p.name.toLowerCase().includes(q)
      const matchesCategory = category === 'All' || p.category === category
      return matchesQuery && matchesCategory
    })
  }, [products, query, category])

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const product of filtered) {
      const list = map.get(product.category) ?? []
      list.push(product)
      map.set(product.category, list)
    }
    return map
  }, [filtered])

  const quantityFor = (productId: string) =>
    basket.find((item) => item.productId === productId)?.quantity ?? 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search groceries…"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-green-600 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                category === c
                  ? 'border-green-700 bg-green-700 text-white'
                  : 'border-neutral-300 text-neutral-600 hover:border-green-600 hover:text-green-700 dark:border-neutral-700 dark:text-neutral-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">No items match your search.</p>
        )}
        {Array.from(grouped.entries()).map(([cat, items]) => (
          <div key={cat} className="py-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {cat}
            </h3>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {items.map((product) => {
                const best = cheapestFor(product, STORES)
                return (
                  <li key={product.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-neutral-500">
                        {product.unit}
                        {best ? (
                          <>
                            {' · from '}
                            <span className="font-semibold text-green-700 dark:text-green-500">
                              {formatZAR(best.price)}
                            </span>
                            {` at ${best.store.name}`}
                          </>
                        ) : (
                          // Without this the row looks like any other, and
                          // adding it quietly makes every store uncomparable.
                          <span className="text-amber-600 dark:text-amber-500">
                            {' · no price data'}
                          </span>
                        )}
                      </p>
                    </div>
                    <QuantityStepper
                      quantity={quantityFor(product.id)}
                      onIncrement={() => onIncrement(product.id)}
                      onDecrement={() => onDecrement(product.id)}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
