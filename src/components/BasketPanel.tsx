import type { BasketItem, Product } from '../types'
import { QuantityStepper } from './QuantityStepper'

interface BasketPanelProps {
  basket: BasketItem[]
  products: Product[]
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
  onClear: () => void
}

export function BasketPanel({
  basket,
  products,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
}: BasketPanelProps) {
  const items = basket
    .map((item) => ({ item, product: products.find((p) => p.id === item.productId) }))
    .filter((x): x is { item: BasketItem; product: Product } => Boolean(x.product))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Your basket {items.length > 0 && `(${items.length})`}
        </h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-neutral-500 hover:text-red-600"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            Add items from the catalog to build your basket.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {items.map(({ item, product }) => (
              <li key={item.productId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-neutral-500">{product.unit}</p>
                </div>
                <div className="flex items-center gap-3">
                  <QuantityStepper
                    quantity={item.quantity}
                    onIncrement={() => onIncrement(product.id)}
                    onDecrement={() => onDecrement(product.id)}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(product.id)}
                    aria-label={`Remove ${product.name}`}
                    className="text-neutral-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
