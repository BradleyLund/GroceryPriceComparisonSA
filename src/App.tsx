import { BasketPanel } from './components/BasketPanel'
import { ComparisonPanel } from './components/ComparisonPanel'
import { PriceBreakdownTable } from './components/PriceBreakdownTable'
import { ProductCatalog } from './components/ProductCatalog'
import { DataProvenanceBanner } from './components/DataProvenanceBanner'
import { PRODUCTS } from './data/catalog'
import { useBasket } from './hooks/useBasket'

function App() {
  const { basket, increment, decrement, remove, clear } = useBasket()

  return (
    <div className="min-h-screen bg-[#f5f6f4] text-neutral-900 dark:bg-[#0f1210] dark:text-neutral-50">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="text-2xl font-bold sm:text-3xl">SA Grocery Price Comparison</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Build a basket and see which South African supermarket works out cheapest overall.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <DataProvenanceBanner />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2 lg:h-[70vh]">
            <ProductCatalog
              products={PRODUCTS}
              basket={basket}
              onIncrement={increment}
              onDecrement={decrement}
            />
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 lg:h-[70vh]">
            <BasketPanel
              basket={basket}
              products={PRODUCTS}
              onIncrement={increment}
              onDecrement={decrement}
              onRemove={remove}
              onClear={clear}
            />
          </section>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Price comparison</h2>
          <ComparisonPanel basket={basket} products={PRODUCTS} />
          <PriceBreakdownTable basket={basket} products={PRODUCTS} />
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-neutral-400">
        Built for comparing common grocery baskets across Checkers, Pick n Pay, Shoprite,
        Woolworths and Spar.
      </footer>
    </div>
  )
}

export default App
