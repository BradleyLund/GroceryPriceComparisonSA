import { useMemo } from 'react'
import { STORES } from '../data/stores'
import type { BasketItem, Product } from '../types'
import type { StoreTotal } from '../utils/compare'
import {
  computeMixAndMatchTotal,
  computeStoreTotals,
  formatZAR,
  rankStoreTotals,
} from '../utils/compare'

interface ComparisonPanelProps {
  basket: BasketItem[]
  products: Product[]
}

function StoreCard({
  entry,
  isCheapest,
  maxTotal,
  cheapestTotal,
}: {
  entry: StoreTotal
  isCheapest: boolean
  maxTotal: number
  cheapestTotal: number
}) {
  const { store, total, missingItems, pricedCount, complete } = entry
  const barWidth = complete ? Math.max(6, (total / maxTotal) * 100) : 0
  const diff = total - cheapestTotal

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 ${
        isCheapest
          ? 'border-green-600 bg-green-50 dark:bg-green-950/30'
          : complete
            ? 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
            : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50'
      }`}
    >
      {isCheapest && (
        <span className="absolute right-3 top-3 rounded-full bg-green-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Cheapest
        </span>
      )}
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: store.color }}>
        {store.name}
      </p>

      {complete ? (
        <>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatZAR(total)}</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-1.5 rounded-full"
              style={{ width: `${barWidth}%`, backgroundColor: store.color }}
            />
          </div>
          {!isCheapest && diff > 0 && (
            <p className="mt-2 text-xs text-neutral-500">+{formatZAR(diff)} vs cheapest</p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-neutral-400 dark:text-neutral-500">
            {pricedCount === 0 ? 'No prices' : 'Partial'}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {pricedCount === 0
              ? 'No price data for this store.'
              : `Only ${pricedCount} of ${pricedCount + missingItems.length} items priced${
                  missingItems.length ? ` (${formatZAR(total)} so far)` : ''
                }.`}
          </p>
          <p className="mt-1 text-xs text-neutral-400">Not ranked — totals aren’t comparable.</p>
        </>
      )}
    </div>
  )
}

export function ComparisonPanel({ basket, products }: ComparisonPanelProps) {
  const { comparable, incomplete } = useMemo(
    () => rankStoreTotals(computeStoreTotals(basket, products, STORES)),
    [basket, products],
  )

  const mixTotal = useMemo(
    () => computeMixAndMatchTotal(basket, products, STORES),
    [basket, products],
  )

  if (basket.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Add items to your basket to see a price comparison across stores.
      </div>
    )
  }

  if (comparable.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        No store has a price for every item in this basket, so there’s nothing to compare yet. Try
        removing the items marked as unavailable.
      </div>
    )
  }

  const cheapest = comparable[0]
  const priciest = comparable[comparable.length - 1]
  const maxTotal = priciest.total || 1

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[...comparable, ...incomplete].map((entry) => (
          <StoreCard
            key={entry.store.id}
            entry={entry}
            isCheapest={entry.complete && entry.store.id === cheapest.store.id}
            maxTotal={maxTotal}
            cheapestTotal={cheapest.total}
          />
        ))}
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-neutral-600 dark:text-neutral-300">
          Buying each item at whichever store is cheapest for it ("mix &amp; match") would cost{' '}
          <span className="font-semibold text-green-700 dark:text-green-500">
            {formatZAR(mixTotal)}
          </span>
          .
        </p>
        {cheapest.total > mixTotal && (
          <p className="font-medium text-green-700 dark:text-green-500">
            Saves {formatZAR(cheapest.total - mixTotal)} vs one store
          </p>
        )}
      </div>

      {comparable.length > 1 && (
        <p className="text-xs text-neutral-500">
          Cheapest store ({cheapest.store.name}) is {formatZAR(priciest.total - cheapest.total)} less
          than the priciest ({priciest.store.name}) for this basket.
        </p>
      )}
    </div>
  )
}
