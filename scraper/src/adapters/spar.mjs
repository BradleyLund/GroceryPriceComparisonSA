/**
 * SPAR adapter — deliberately unsupported.
 *
 * SPAR South Africa is a voluntary-trading (franchise) group: each store is
 * independently owned and sets its own shelf prices. www.spar.co.za is a
 * Kentico CMS corporate site with no national product catalog or prices, and
 * SPAR's online shopping is per-store, behind a store picker.
 *
 * There is therefore no single "SPAR price" to scrape. Rather than invent one
 * — which would quietly corrupt the comparison — this adapter reports itself
 * as unsupported, and the runner leaves SPAR's prices as null so the UI can
 * show "no data" instead of a fabricated number.
 *
 * To add SPAR, you'd need to pick a specific store's online shop and treat it
 * as its own retailer (e.g. "SPAR Gardens"), which is a product decision as
 * much as a technical one.
 */

export const spar = {
  id: 'spar',
  label: 'SPAR',
  strategy: 'unsupported',
  unsupportedReason:
    'SPAR stores are independently owned and price independently; there is no national online catalog to scrape. ' +
    'Pick a single SPAR store’s online shop and model it as its own retailer if you need SPAR pricing.',

  async collect({ catalog }) {
    const byItem = new Map()
    for (const item of catalog.items) byItem.set(item.id, [])
    return byItem
  },
}
