# Price scraper

Pulls real grocery prices from South African retailers and writes
`src/data/prices.json`, which the app prefers over the bundled sample data.

```bash
npm run scrape                        # every supported store
npm run scrape -- --stores=shoprite   # just one
npm run scrape -- --dry-run           # scrape and report, write nothing
npm run scrape -- --help
```

Runs **merge**: scraping one store keeps the prices already recorded for the
others, so you can refresh a single retailer or retry one that failed without
losing the rest. `--replace` discards them instead.

The browser-backed stores need Playwright, which is optional:

```bash
npm install --save-dev playwright
npx playwright install chromium
```

Without it, `--stores=shoprite,checkers` still works.

## What each retailer needs

| Store | Strategy | How it works |
|---|---|---|
| Shoprite | `http` | Product sitemap → product page → schema.org `Product` JSON-LD |
| Checkers | `http` | Same platform as Shoprite |
| Pick n Pay | `browser` | Product sitemap → page rendered in Chromium, price read from the DOM |
| Woolworths | `browser` | Food sitemap → category grids rendered in Chromium (one page yields dozens of products) |
| SPAR | `unsupported` | See below |

### Why SPAR is unsupported

SPAR South Africa is a voluntary-trading (franchise) group: every store is
independently owned and prices independently. `spar.co.za` is a corporate CMS
site with no national catalog or prices, and SPAR's online shopping is
per-store behind a store picker.

There is no single "SPAR price" to scrape, so the adapter reports itself as
unsupported and the app shows *no data* for SPAR rather than a fabricated
number. If you need SPAR pricing, pick one store's online shop and model it as
its own retailer (e.g. "SPAR Gardens").

### Why two stores need a browser

Pick n Pay serves an empty Angular shell and loads prices over XHR. Its
backing OCC API (`/pnphybris/v2/pnp/products/{code}`) requires a per-store
session context that isn't reproducible from outside — every store code
returns either "not configured on the BaseSite" or an internal error without
a real session. Woolworths is React-rendered *and* sits behind bot protection
that serves an instrumented shell to plain HTTP clients. For both, a rendered
page is the reliable source.

## Being a good citizen

`src/lib/fetcher.mjs` routes every request through one place so these can't be
skipped per-adapter:

- **robots.txt is parsed and enforced** — wildcards, longest-match
  Allow/Disallow precedence, `Crawl-delay`, and `Visit-time`. Rules differ
  sharply: Pick n Pay disallows search paths, asks for a 10-second crawl delay
  and declares a 04:00–08:45 UTC visit window; Woolworths disallows
  `/*searchterm`. **No adapter uses site search** — discovery is via the
  published sitemaps, which is both the allowed path and the stabler one.
- **Requests are serialised per host** and spaced by the larger of a 1.2s floor
  and the host's declared crawl delay.
- **Responses are cached on disk** (`scraper/.cache`, 6h TTL) so iterating on
  matching rules doesn't re-hit the retailers. `--no-cache` bypasses it.
- **Retries** use exponential backoff, and 4xx responses fail fast rather than
  hammering.

### Pick n Pay's visit window

PnP is the awkward one. Its robots.txt declares `Visit-time: 0400-0845` (UTC,
so 06:00–10:45 SAST), and the scraper enforces that by default — outside the
window a PnP run stops immediately with the time until it reopens. Combined
with its 10-second crawl delay, a full PnP pass takes a while, so in practice:

```bash
# inside the window, fewer candidates per item
npm run scrape -- --stores=pnp --candidates=3
```

`--ignore-visit-time` overrides the window if you need prices outside it. The
10s crawl delay still applies, and that's the directive that actually protects
the retailer, so leave it alone.

### A note on the user agent

The polite default would be a descriptive bot UA, but the Shoprite Group CDN
returns `403` to unrecognised user agents regardless of what its robots.txt
permits, so the default is a mainstream browser UA. This only gets past a
user-agent filter — the robots rules above are still parsed and obeyed. Set
`SCRAPER_USER_AGENT` to override.

Check each retailer's terms before running this at any volume. It's built for
personal, low-rate price comparison.

## How matching works

`catalog.json` maps each generic catalog item ("White bread, 700g loaf") to
real products. Store names are messy — `SASKO Premium Slices White Bread 700g`
— so each item declares:

```jsonc
{
  "id": "white-bread-700g",
  "size": "700g",
  "include": ["bread"],          // every term must appear
  "any": [["white"]],            // each group needs at least one hit
  "exclude": ["brown", "rolls"], // any hit disqualifies
  "noMultipack": true            // reject "6 x 2L" case packs
}
```

Matching is deliberately conservative — reporting "not found" beats pricing a
2L milk as if it were 1L:

- Terms match on **word boundaries**, so `butter` doesn't match `butternut`.
- **Sizes are parsed and converted** (`2.5kg` → 2500g, `6 x 500ml` → 3000ml),
  and a wrong-unit or badly-mismatched size disqualifies outright.
- Among qualifying products the **cheapest wins**, so each store is quoted its
  best comparable option.
- Out-of-stock listings are skipped — Shoprite reports those as `price: 0`,
  which would otherwise look like a free item.

Each matched price records the actual product name and URL in the dataset's
`sources`, so you can audit exactly what was priced.

### Tuning

If an item matches the wrong product, edit its rules in `catalog.json` and
re-run — the disk cache makes iteration fast. `--candidates=N` (default 8)
controls how many shortlisted products are checked per item; raise it when a
store has many out-of-stock listings.

## Output

`src/data/prices.json`:

```jsonc
{
  "generatedAt": "2026-09-22T11:40:00.000Z",
  "currency": "ZAR",
  "storesScraped": ["shoprite", "checkers"],
  "storeReports": { "shoprite": { "status": "ok", "matched": 31, "total": 36 } },
  "items": [
    {
      "id": "white-bread-700g",
      "prices": { "shoprite": 19.99, "checkers": 19.99 },
      "sources": {
        "shoprite": { "name": "Albany Superior White Bread 700g", "url": "https://..." }
      }
    }
  ]
}
```

A store with no match gets `null`, never a guessed price. The runner refuses
to overwrite the dataset if nothing matched at all.
