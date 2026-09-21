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

## About the price data

⚠️ **The prices in `src/data/products.ts` are hand-curated sample/estimated
data for demonstration purposes — they are not a live feed.** There isn't a
public, free API for real-time South African supermarket pricing, and scraping
retailer sites directly would need ongoing maintenance and is against most
retailers' terms of use.

To make this app reflect real prices, replace the contents of
`src/data/products.ts` with real data (e.g. from a scraper you're authorized
to run, a retailer API/partnership, or manual price checks), keeping the same
shape:

```ts
interface Product {
  id: string
  name: string
  unit: string
  category: string
  prices: Record<string, number | null> // storeId -> price in ZAR, or null if not stocked
}
```

Store definitions (id, display name, brand color) live in `src/data/stores.ts`
— add or remove stores there and every component picks them up automatically.

## Project structure

```
src/
  data/          product & store datasets
  hooks/         useBasket – basket state + localStorage persistence
  utils/         price comparison calculations
  components/    ProductCatalog, BasketPanel, ComparisonPanel, PriceBreakdownTable
  App.tsx        page layout
```
