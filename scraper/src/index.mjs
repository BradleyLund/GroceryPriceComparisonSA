#!/usr/bin/env node
/**
 * Grocery price scraper CLI.
 *
 *   npm run scrape                          # every supported store
 *   npm run scrape -- --stores=shoprite     # just one
 *   npm run scrape -- --dry-run             # scrape but don't write the dataset
 *   npm run scrape -- --headed              # watch the browser stores work
 *
 * Writes src/data/prices.json, which the app prefers over the bundled sample
 * data. Stores that yield nothing keep a null price rather than a guess.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ADAPTERS, ALL_STORE_IDS } from './adapters/index.mjs'
import { BrowserSession } from './lib/browser.mjs'
import { Fetcher } from './lib/fetcher.mjs'
import { pickBest } from './lib/match.mjs'
import { roundCents } from './lib/normalize.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRAPER_DIR = path.resolve(HERE, '..')
const PROJECT_DIR = path.resolve(SCRAPER_DIR, '..')
const OUTPUT_FILE = path.join(PROJECT_DIR, 'src', 'data', 'prices.json')

function parseArgs(argv) {
  const args = {
    stores: ALL_STORE_IDS,
    dryRun: false,
    headed: false,
    candidatesPerItem: 8,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    ignoreVisitTime: false,
    replace: false,
    verbose: false,
  }
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--headed') args.headed = true
    else if (arg === '--verbose') args.verbose = true
    else if (arg === '--ignore-visit-time') args.ignoreVisitTime = true
    else if (arg === '--no-cache') args.cacheTtlMs = 0
    else if (arg === '--replace') args.replace = true
    else if (arg.startsWith('--stores=')) {
      args.stores = arg
        .slice('--stores='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (arg.startsWith('--candidates=')) {
      args.candidatesPerItem = Math.max(1, Number(arg.split("=")[1]) || 8)
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

const HELP = `
Grocery price scraper

Usage: npm run scrape -- [options]

  --stores=a,b            Stores to scrape (default: all)
                          Available: ${ALL_STORE_IDS.join(', ')}
  --candidates=N          Product pages to try per catalog item (default: 8)
  --dry-run               Scrape and report, but don't write src/data/prices.json
  --headed                Run the browser stores visibly
  --no-cache              Ignore the on-disk response cache
  --replace               Discard prices for stores not in this run
                          (default: keep them)
  --ignore-visit-time     Skip robots.txt Visit-time enforcement (use sparingly)
  --verbose               Per-candidate logging
  -h, --help              Show this
`

function makeLogger(verbose) {
  return {
    info: (msg) => console.log(msg),
    warn: (msg) => (verbose ? console.warn(msg) : undefined),
    error: (msg) => console.error(msg),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }

  const unknown = args.stores.filter((s) => !ADAPTERS[s])
  if (unknown.length) {
    throw new Error(`Unknown store(s): ${unknown.join(', ')}. Available: ${ALL_STORE_IDS.join(', ')}`)
  }

  const log = makeLogger(args.verbose)
  const catalog = JSON.parse(await readFile(path.join(SCRAPER_DIR, 'catalog.json'), 'utf8'))

  const fetcher = new Fetcher({
    cacheDir: path.join(SCRAPER_DIR, '.cache'),
    cacheTtlMs: args.cacheTtlMs,
    minDelayMs: 1200,
    respectVisitTime: !args.ignoreVisitTime,
    logger: log,
  })

  const needsBrowser = args.stores.some((s) => ADAPTERS[s].strategy === 'browser')
  const browser = needsBrowser ? new BrowserSession({ headless: !args.headed, logger: log }) : null

  /** storeId -> { itemId -> {price, name, url} } */
  const results = {}
  /** Per-store run report for the dataset's provenance block. */
  const storeReports = {}

  try {
    for (const storeId of args.stores) {
      const adapter = ADAPTERS[storeId]
      console.log(`\n=== ${adapter.label} (${adapter.strategy}) ===`)

      if (adapter.strategy === 'unsupported') {
        console.log(`  skipped — ${adapter.unsupportedReason}`)
        storeReports[storeId] = { status: 'unsupported', reason: adapter.unsupportedReason, matched: 0 }
        results[storeId] = {}
        continue
      }

      const startedAt = Date.now()
      try {
        // Page loads are requests too — apply the store's declared crawl delay
        // to the browser as well as to the HTTP fetcher.
        if (adapter.strategy === 'browser' && adapter.origin) {
          const robots = await fetcher.getRobots(adapter.origin)
          const delay = robots.crawlDelaySeconds
          if (delay) log.info(`  honouring robots.txt crawl-delay of ${delay}s`)
          browser.setCrawlDelay(delay)
        }

        const byItem = await adapter.collect({
          fetcher,
          browser,
          catalog,
          log,
          candidatesPerItem: args.candidatesPerItem,
        })

        const matches = {}
        let matched = 0
        for (const item of catalog.items) {
          const best = pickBest(byItem.get(item.id) ?? [], item)
          if (!best) continue
          matches[item.id] = {
            price: roundCents(best.price),
            name: best.name,
            url: best.url,
          }
          matched += 1
        }
        results[storeId] = matches
        storeReports[storeId] = {
          status: 'ok',
          matched,
          total: catalog.items.length,
          durationSec: Math.round((Date.now() - startedAt) / 1000),
        }
        console.log(`  matched ${matched}/${catalog.items.length} items`)
      } catch (err) {
        console.error(`  FAILED: ${err.message}`)
        results[storeId] = {}
        storeReports[storeId] = { status: 'failed', error: err.message, matched: 0 }
      }
    }
  } finally {
    await browser?.close()
  }

  console.log(
    `\nHTTP: ${fetcher.stats.requests} requests, ${fetcher.stats.cacheHits} cache hits, ` +
      `${fetcher.stats.retries} retries, ${fetcher.stats.blocked} robots-blocked`,
  )

  // Scraping one store shouldn't discard another's prices, so results are
  // merged over any existing dataset unless --replace is passed. That makes
  // it practical to re-run a single store (or retry a failed one) on its own.
  let existing = null
  if (!args.replace) {
    try {
      existing = JSON.parse(await readFile(OUTPUT_FILE, 'utf8'))
    } catch {
      // No dataset yet — this run is the first.
    }
  }

  const previousItems = new Map((existing?.items ?? []).map((i) => [i.id, i]))
  const carriedStores = (existing?.storesScraped ?? []).filter((s) => !args.stores.includes(s))
  const scrapedStores = [...new Set([...carriedStores, ...args.stores])]

  // Every catalog item gets a row; a store with no match gets null, which the
  // UI renders as "not available" rather than a price.
  const items = catalog.items.map((item) => {
    const prior = previousItems.get(item.id)
    const prices = {}
    const sources = {}
    for (const storeId of carriedStores) {
      prices[storeId] = prior?.prices?.[storeId] ?? null
      const priorSource = prior?.sources?.[storeId]
      if (priorSource) sources[storeId] = priorSource
    }
    for (const storeId of args.stores) {
      const hit = results[storeId]?.[item.id]
      prices[storeId] = hit ? hit.price : null
      if (hit) sources[storeId] = { name: hit.name, url: hit.url }
    }
    return { id: item.id, prices, sources }
  })

  const dataset = {
    generatedAt: new Date().toISOString(),
    currency: 'ZAR',
    storesScraped: scrapedStores,
    storeReports: { ...(existing?.storeReports ?? {}), ...storeReports },
    items,
  }
  if (carriedStores.length) {
    console.log(`Kept existing prices for: ${carriedStores.join(', ')} (pass --replace to discard)`)
  }

  const totalMatched = Object.values(storeReports).reduce((n, r) => n + (r.matched ?? 0), 0)
  console.log(`Matched ${totalMatched} store/item price(s) across ${scrapedStores.length} store(s).`)

  if (args.dryRun) {
    console.log('\n--dry-run: not writing src/data/prices.json')
    return
  }
  if (totalMatched === 0) {
    console.error('\nNothing matched — refusing to overwrite src/data/prices.json with an empty dataset.')
    process.exitCode = 1
    return
  }

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true })
  await writeFile(OUTPUT_FILE, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(`\nWrote ${path.relative(PROJECT_DIR, OUTPUT_FILE)}`)
}

main().catch((err) => {
  console.error(`\n${err.stack ?? err.message}`)
  process.exitCode = 1
})
