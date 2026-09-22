import type { Product } from '../types'
import { PRODUCTS as SAMPLE_PRODUCTS } from './products'

/** Shape of the file written by `npm run scrape` (scraper/src/index.mjs). */
interface ScrapedDataset {
  generatedAt: string
  currency: string
  storesScraped: string[]
  storeReports: Record<
    string,
    { status: 'ok' | 'failed' | 'unsupported'; matched?: number; total?: number; reason?: string; error?: string }
  >
  items: Array<{
    id: string
    prices: Record<string, number | null>
    sources?: Record<string, { name: string; url: string }>
  }>
}

/**
 * `src/data/prices.json` is generated and may not exist in a fresh checkout,
 * so it is imported via glob — a missing file yields an empty record rather
 * than a build error.
 */
const modules = import.meta.glob<{ default: ScrapedDataset }>('./prices.json', {
  eager: true,
})
const dataset: ScrapedDataset | null = Object.values(modules)[0]?.default ?? null

export interface PriceSource {
  name: string
  url: string
}

export interface PriceMeta {
  /** True when the app is showing scraped prices rather than the sample set. */
  isLive: boolean
  generatedAt: string | null
  storesScraped: string[]
  storeReports: ScrapedDataset['storeReports']
}

export const PRICE_META: PriceMeta = dataset
  ? {
      isLive: true,
      generatedAt: dataset.generatedAt,
      storesScraped: dataset.storesScraped,
      storeReports: dataset.storeReports,
    }
  : { isLive: false, generatedAt: null, storesScraped: [], storeReports: {} }

/** productId -> storeId -> which real product was priced. */
export const PRICE_SOURCES: Record<string, Record<string, PriceSource>> = {}

/**
 * When a scrape exists we use its prices *exclusively*, including its nulls.
 * Back-filling a gap with sample data would silently mix invented numbers into
 * a comparison the user reads as real.
 */
export const PRODUCTS: Product[] = (() => {
  if (!dataset) return SAMPLE_PRODUCTS

  const scraped = new Map(dataset.items.map((item) => [item.id, item]))
  return SAMPLE_PRODUCTS.map((product) => {
    const hit = scraped.get(product.id)
    if (!hit) return { ...product, prices: {} }
    if (hit.sources) PRICE_SOURCES[product.id] = hit.sources
    return { ...product, prices: hit.prices }
  })
})()
