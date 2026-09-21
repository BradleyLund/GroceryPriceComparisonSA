import { useState } from 'react'
import { STORES } from '../data/stores'
import type { BasketItem, Product } from '../types'
import { cheapestFor, formatZAR } from '../utils/compare'

interface PriceBreakdownTableProps {
  basket: BasketItem[]
  products: Product[]
}

export function PriceBreakdownTable({ basket, products }: PriceBreakdownTableProps) {
  const [open, setOpen] = useState(false)

  const rows = basket
    .map((item) => ({ item, product: products.find((p) => p.id === item.productId) }))
    .filter((x): x is { item: BasketItem; product: Product } => Boolean(x.product))

  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-sm font-medium"
      >
        Item-by-item price breakdown
        <span className="text-neutral-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4 text-center">Qty</th>
                {STORES.map((store) => (
                  <th key={store.id} className="py-2 pr-4 text-right">
                    {store.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, product }) => {
                const best = cheapestFor(product, STORES)
                return (
                  <tr
                    key={product.id}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
                  >
                    <td className="py-2 pr-4">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-neutral-500">{product.unit}</p>
                    </td>
                    <td className="py-2 pr-4 text-center tabular-nums">{item.quantity}</td>
                    {STORES.map((store) => {
                      const price = product.prices[store.id]
                      const isBest = best && store.id === best.store.id
                      return (
                        <td
                          key={store.id}
                          className={`py-2 pr-4 text-right tabular-nums ${
                            isBest
                              ? 'font-semibold text-green-700 dark:text-green-500'
                              : 'text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {price == null ? '—' : formatZAR(price)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
