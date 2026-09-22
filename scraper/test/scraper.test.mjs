import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test, { describe } from 'node:test'
import { fileURLToPath } from 'node:url'

import { Robots } from '../src/lib/robots.mjs'
import { isMultipack, parsePrice, parseSize, sizeSimilarity } from '../src/lib/normalize.mjs'
import { hasPhrase, matchesKeywords, pickBest } from '../src/lib/match.mjs'
import { extractJsonLd, findProductNode, extractSitemapLocs } from '../src/lib/html.mjs'
import { slugToName } from '../src/adapters/shoprite-group.mjs'
import { selectCategories } from '../src/adapters/woolworths.mjs'

const CATALOG = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog.json'), 'utf8'),
)

describe('robots.txt', () => {
  // Reproduces the real rules from each retailer.
  const pnp = Robots.parse(
    ['User-agent: *', 'Disallow: */search/', 'Disallow: */cart', 'Crawl-delay: 10', 'Visit-time: 0400-0845'].join('\n'),
  )

  test('blocks disallowed paths and allows the rest', () => {
    assert.equal(pnp.isAllowed('/en/search/milk'), false)
    assert.equal(pnp.isAllowed('/some-product/p/000000000000654899_EA'), true)
  })

  test('reads crawl-delay', () => {
    assert.equal(pnp.crawlDelaySeconds, 10)
  })

  test('honours the visit-time window', () => {
    assert.equal(pnp.msUntilVisitWindow(new Date(Date.UTC(2026, 8, 22, 5, 0))), null)
    assert.ok(pnp.msUntilVisitWindow(new Date(Date.UTC(2026, 8, 22, 11, 0))) > 0)
  })

  test('longest match wins over an earlier broader rule', () => {
    const r = Robots.parse(['User-agent: *', 'Disallow: /a/', 'Allow: /a/b/'].join('\n'))
    assert.equal(r.isAllowed('/a/x'), false)
    assert.equal(r.isAllowed('/a/b/x'), true)
  })

  test('wildcards and end-anchors', () => {
    const r = Robots.parse(['User-agent: *', 'Disallow: /*searchterm', 'Disallow: /x$'].join('\n'))
    assert.equal(r.isAllowed('/cat?searchterm=milk'), false)
    assert.equal(r.isAllowed('/browse/food'), true)
    assert.equal(r.isAllowed('/x'), false)
    assert.equal(r.isAllowed('/xy'), true)
  })

  test('an empty Disallow does not block everything', () => {
    const r = Robots.parse(['User-agent: *', 'Disallow:'].join('\n'))
    assert.equal(r.isAllowed('/anything'), true)
  })

  test('a named group beats the wildcard group', () => {
    const r = Robots.parse(
      ['User-agent: *', 'Disallow: /', 'User-agent: sagrocerybot', 'Disallow: /private'].join('\n'),
    )
    assert.equal(r.isAllowed('/public'), true)
    assert.equal(r.isAllowed('/private'), false)
  })
})

describe('price parsing', () => {
  test('handles SA formats', () => {
    assert.equal(parsePrice('R 19,99'), 19.99)
    assert.equal(parsePrice('R19.99'), 19.99)
    assert.equal(parsePrice('1 299,00'), 1299)
    assert.equal(parsePrice(19.99), 19.99)
  })

  test('rejects non-prices and zero', () => {
    // Shoprite reports unavailable products as price 0 — never a real price.
    assert.equal(parsePrice(0), null)
    assert.equal(parsePrice('R0.00'), null)
    assert.equal(parsePrice(''), null)
    assert.equal(parsePrice(null), null)
  })
})

describe('size parsing', () => {
  test('parses masses, volumes and counts', () => {
    assert.deepEqual(parseSize('700g loaf'), { kind: 'mass', amount: 700, base: 'g' })
    assert.deepEqual(parseSize('2.5kg'), { kind: 'mass', amount: 2500, base: 'g' })
    assert.deepEqual(parseSize('2 L'), { kind: 'volume', amount: 2000, base: 'ml' })
    assert.deepEqual(parseSize('18 pack'), { kind: 'count', amount: 18, base: 'count' })
    assert.deepEqual(parseSize('80s'), { kind: 'count', amount: 80, base: 'count' })
  })

  test('multiplies multipacks out', () => {
    assert.deepEqual(parseSize('6 x 500ml'), { kind: 'volume', amount: 3000, base: 'ml' })
    assert.deepEqual(parseSize('3 x 150g'), { kind: 'mass', amount: 450, base: 'g' })
  })

  test('similarity compares across units but not across kinds', () => {
    assert.equal(sizeSimilarity(parseSize('1kg'), parseSize('1000g')), 1)
    assert.equal(sizeSimilarity(parseSize('1L'), parseSize('2L')), 0.2)
    assert.equal(sizeSimilarity(parseSize('18 pack'), parseSize('1kg')), 0)
  })

  test('detects multipacks', () => {
    assert.equal(isMultipack('Coca-Cola 6 x 2L'), true)
    assert.equal(isMultipack('Coca-Cola 2L'), false)
  })
})

describe('keyword matching', () => {
  test('respects word boundaries', () => {
    assert.equal(hasPhrase('bonnita salted butter 500g', 'butter'), true)
    assert.equal(hasPhrase('butternut cubes 500g', 'butter'), false)
    assert.equal(hasPhrase('cani buttermilk rusks 500g', 'butter'), false)
  })

  test('include / any / exclude combine correctly', () => {
    const spec = { include: ['bread'], any: [['white']], exclude: ['rolls'] }
    assert.equal(matchesKeywords('albany superior white bread 700g', spec), true)
    assert.equal(matchesKeywords('albany brown bread 700g', spec), false) // no `any` hit
    assert.equal(matchesKeywords('white bread rolls 6 pack', spec), false) // excluded
  })

  test('noMultipack rejects case packs', () => {
    const spec = { include: ['coca cola'], noMultipack: true }
    assert.equal(matchesKeywords('coca cola soft drink 2l', spec), true)
    assert.equal(matchesKeywords('coca cola soft drink 6 x 2l', spec), false)
  })
})

describe('pickBest', () => {
  const spec = CATALOG.items.find((i) => i.id === 'full-cream-milk-1l')

  test('prefers the cheapest qualifying product', () => {
    const best = pickBest(
      [
        { name: 'Clover Full Cream Milk 1L', price: 24.99 },
        { name: 'Alfalfa Full Cream Milk 1L', price: 21.99 },
      ],
      spec,
    )
    assert.equal(best.price, 21.99)
  })

  test('rejects the wrong size outright rather than mispricing it', () => {
    const best = pickBest([{ name: 'Clover Full Cream Milk 2L', price: 19.99 }], spec)
    assert.equal(best, null)
  })

  test('rejects excluded variants even when cheaper', () => {
    const best = pickBest(
      [
        { name: 'Clover Low Fat Milk 1L', price: 5.0 },
        { name: 'Clover Full Cream Milk 1L', price: 24.99 },
      ],
      spec,
    )
    assert.equal(best.name, 'Clover Full Cream Milk 1L')
  })

  test('ignores products without a usable price', () => {
    assert.equal(pickBest([{ name: 'Clover Full Cream Milk 1L', price: null }], spec), null)
  })
})

describe('html helpers', () => {
  test('extracts a Product node and its price', () => {
    const html = `
      <script type="application/ld+json">
        {"@context":"https://schema.org/","@type":"Product","name":"SASKO White Bread 700g",
         "offers":{"@type":"Offer","price":19.99,"priceCurrency":"ZAR"}}
      </script>
      <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`
    const node = findProductNode(extractJsonLd(html))
    assert.equal(node.name, 'SASKO White Bread 700g')
    assert.equal(parsePrice(node.offers.price), 19.99)
  })

  test('finds a Product inside an @graph', () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebPage"},{"@type":"Product","name":"X"}]}</script>`
    assert.equal(findProductNode(extractJsonLd(html)).name, 'X')
  })

  test('skips malformed JSON-LD instead of throwing', () => {
    assert.deepEqual(extractJsonLd('<script type="application/ld+json">{oops</script>'), [])
  })

  test('reads sitemap locs', () => {
    const xml = '<urlset><url><loc>https://a/b?x=1&amp;y=2</loc></url></urlset>'
    assert.deepEqual(extractSitemapLocs(xml), ['https://a/b?x=1&y=2'])
  })
})

describe('shoprite slug parsing', () => {
  test('strips the SKU suffix', () => {
    assert.equal(
      slugToName('https://www.shoprite.co.za/product/sasko-premium-slices-white-bread-700g-10241929EA'),
      'sasko premium slices white bread 700g',
    )
  })

  test('restores decimals that the slug flattened', () => {
    // "cake-flour-2-5kg" means 2.5kg, not 5kg.
    const name = slugToName('https://www.shoprite.co.za/product/snowflake-cake-wheat-flour-2-5kg-123EA')
    assert.match(name, /2\.5kg/)
    assert.deepEqual(parseSize(name), { kind: 'mass', amount: 2500, base: 'g' })
  })
})

describe('woolworths category selection', () => {
  const catalog = {
    items: [{ id: 'sugar-2kg', include: ['sugar'], any: [['white']], categoryHints: ['sugar'] }],
  }
  const urls = [
    'https://www.woolworths.co.za/browse/food-south-africa/pantry/sugar-flour-baking/sugar',
    'https://www.woolworths.co.za/browse/food-south-africa/promotions/save-r20/sugar',
    'https://www.woolworths.co.za/browse/food-south-africa/beverages/wine/pink-white-wine',
  ]

  test('matches on the leaf segment, not anywhere in the path', () => {
    const chosen = selectCategories(urls, catalog, 3)
    // "white" appears in the wine URL but only as an `any` term, which must
    // never select a category on its own.
    assert.equal([...chosen.keys()].some((u) => u.includes('wine')), false)
  })

  test('prefers the permanent aisle over a promotions page', () => {
    const chosen = selectCategories(urls, catalog, 1)
    const picked = [...chosen.keys()][0]
    assert.match(picked, /pantry\/sugar-flour-baking\/sugar$/)
  })

  test('records which items each category serves', () => {
    const chosen = selectCategories(urls, catalog, 1)
    assert.deepEqual([...chosen.values()][0], new Set(['sugar-2kg']))
  })
})

describe('catalog.json', () => {
  test('every item has an id and match rules', () => {
    for (const item of CATALOG.items) {
      assert.ok(item.id, 'item missing id')
      assert.ok(
        (item.include?.length ?? 0) + (item.any?.length ?? 0) > 0,
        `${item.id} has no include/any terms`,
      )
    }
  })

  test('ids are unique', () => {
    const ids = CATALOG.items.map((i) => i.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  test('declared sizes are parseable', () => {
    for (const item of CATALOG.items) {
      if (!item.size) continue
      assert.ok(parseSize(item.size), `${item.id}: unparseable size ${item.size}`)
    }
  })
})
