import { PRICE_META } from '../data/catalog'
import { STORES } from '../data/stores'

const dateFormat = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * The dataset is baked in at build time, so its age is fixed for the life of
 * the page — computed once at module scope rather than on every render.
 */
const AGE_HOURS = PRICE_META.generatedAt
  ? (Date.now() - new Date(PRICE_META.generatedAt).getTime()) / 3_600_000
  : null

function formatAge(hours: number): string {
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * Tells the user exactly where the numbers came from: sample data, or a
 * scrape (with its age and which stores actually returned prices).
 */
export function DataProvenanceBanner() {
  if (!PRICE_META.isLive) {
    return (
      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        Prices are illustrative sample data, not a live price feed. Run{' '}
        <code className="rounded bg-amber-100 px-1 py-0.5 font-mono dark:bg-amber-900/60">
          npm run scrape
        </code>{' '}
        to pull real prices from the retailers — see the README.
      </div>
    )
  }

  const generatedAt = PRICE_META.generatedAt
  const reports = PRICE_META.storeReports
  const covered = STORES.filter((s) => (reports[s.id]?.matched ?? 0) > 0)
  const missing = STORES.filter((s) => (reports[s.id]?.matched ?? 0) === 0)
  const stale = AGE_HOURS !== null && AGE_HOURS > 48

  return (
    <div
      className={`mb-3 rounded-lg border px-4 py-2 text-xs ${
        stale
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
          : 'border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
      }`}
    >
      <p>
        <span className="font-semibold">Scraped prices</span>
        {generatedAt && AGE_HOURS !== null && (
          <>
            {' '}
            — collected {formatAge(AGE_HOURS)} ({dateFormat.format(new Date(generatedAt))})
            {stale && ' · may be out of date'}
          </>
        )}
        . Retailer prices change often and can differ by store and region; treat these as a guide,
        not a quote.
      </p>
      <p className="mt-1 opacity-80">
        Priced from: {covered.map((s) => s.name).join(', ') || 'none'}
        {missing.length > 0 && (
          <>
            {' · '}no data:{' '}
            {missing
              .map((s) => {
                const reason = reports[s.id]
                return reason?.status === 'unsupported' ? `${s.name} (not available)` : s.name
              })
              .join(', ')}
          </>
        )}
      </p>
    </div>
  )
}
