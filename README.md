# SA Grocery Price Comparison

A web app for comparing the total cost of a grocery basket across major South
African supermarkets — Checkers, Pick n Pay, Shoprite, Woolworths and Spar.

Build a basket from a searchable catalog of common grocery items, and instantly
see:

- The total cost of your exact basket at each store, cheapest highlighted.
- How much you'd save buying everything from the cheapest single store vs. the
  most expensive one.
- What the basket would cost "mix & match" — buying each item from whichever
  store is cheapest for it — versus sticking to one store.
- A full item-by-item price breakdown table across all stores.

Your basket persists in the browser (`localStorage`), so it survives a page
refresh.

## Running it

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a production build
in `dist/`, and `npm run lint` runs oxlint.

## Tech stack

- React + TypeScript, built with Vite
- Tailwind CSS v4 for styling
- No backend — everything runs client-side against the bundled dataset

## Price data

By default the app ships with hand-curated **sample** prices in
`src/data/products.ts`, and says so in a banner.

To use **real prices**, run the scraper:

```bash
npm run scrape
```

It writes `src/data/prices.json`, which the app automatically prefers over the
sample data, and the banner switches to showing when the scrape ran and which
stores returned prices.

| Store | Source |
|---|---|
| Shoprite, Checkers | schema.org JSON-LD on product pages (plain HTTP) |
| Pick n Pay, Woolworths | rendered in headless Chromium (needs Playwright) |
| SPAR | not available — franchise stores price independently, so there is no national catalog to scrape |

Playwright is optional; without it, scrape the HTTP-only stores:

```bash
npm install --save-dev playwright && npx playwright install chromium  # for PnP + Woolworths
npm run scrape -- --stores=shoprite,checkers                          # or skip them
```

The scraper parses and obeys each retailer's `robots.txt` (including Pick n
Pay's crawl delay and visit window), never uses site search, rate-limits per
host, and caches responses locally. A store it can't price gets `null` rather
than a guessed number. See **[`scraper/README.md`](scraper/README.md)** for how
matching works, how to tune it, and the per-retailer details.

⚠️ Scraped prices are a guide, not a quote — retailer prices change often and
vary by store and region. Check each retailer's terms before running this at
any volume.

## Project structure

```
src/
  data/          products.ts (sample set), prices.json (generated), catalog.ts (merges them)
  hooks/         useBasket – basket state + localStorage persistence
  utils/         price comparison calculations
  components/    ProductCatalog, BasketPanel, ComparisonPanel, PriceBreakdownTable
  App.tsx        page layout
scraper/
  catalog.json   match rules: generic item -> real store products
  src/lib/       robots.txt parsing, polite fetching, normalisation, matching
  src/adapters/  one module per retailer
  src/index.mjs  CLI entry point
```
