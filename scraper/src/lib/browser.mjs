/**
 * Lazy Playwright wrapper.
 *
 * Pick n Pay and Woolworths render prices client-side (and Woolworths sits
 * behind bot protection that rejects plain HTTP), so those two adapters need a
 * real browser. Playwright is an optional dependency: the HTTP-only stores
 * still scrape fine without it installed.
 */

let chromiumPromise = null

async function loadChromium() {
  if (!chromiumPromise) {
    chromiumPromise = import('playwright')
      .then((m) => m.chromium)
      .catch(() => {
        throw new Error(
          'Playwright is required for the Pick n Pay and Woolworths adapters.\n' +
            'Install it with:  npm install --save-dev playwright && npx playwright install chromium\n' +
            'Or scrape only the HTTP stores:  npm run scrape -- --stores=shoprite,checkers',
        )
      })
  }
  return chromiumPromise
}

export class BrowserSession {
  constructor({ headless = true, minDelayMs = 1500, logger = console } = {}) {
    this.headless = headless
    this.baseDelayMs = minDelayMs
    this.minDelayMs = minDelayMs
    this.log = logger
    this.browser = null
    this.context = null
    this.lastRequestAt = 0
  }

  /**
   * Page loads are requests too, so they must respect the same Crawl-delay as
   * the HTTP fetcher. The runner calls this with the value from the store's
   * robots.txt before handing the session to an adapter.
   */
  setCrawlDelay(seconds) {
    this.minDelayMs = Math.max(this.baseDelayMs, (seconds ?? 0) * 1000)
  }

  async start() {
    if (this.browser) return
    const chromium = await loadChromium()
    this.browser = await chromium.launch({ headless: this.headless })
    this.context = await this.browser.newContext({
      locale: 'en-ZA',
      timezoneId: 'Africa/Johannesburg',
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    })
    // Images and fonts are pure cost for a price scrape.
    await this.context.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (type === 'image' || type === 'font' || type === 'media') return route.abort()
      return route.continue()
    })
  }

  async throttle() {
    const wait = this.lastRequestAt + this.minDelayMs - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequestAt = Date.now()
  }

  /**
   * Open `url`, wait for `waitFor` to appear, and run `extract` in the page.
   * @returns {Promise<any>} whatever `extract` returns
   */
  async evaluateOnPage(
    url,
    { waitFor, waitForFunction, extract, timeout = 45_000, settleMs = 1200, waitTimeout = 15_000 },
  ) {
    await this.start()
    await this.throttle()
    const page = await this.context.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
      // A predicate is the better wait when the content has no stable selector
      // to key off — waiting on a selector that can never match just burns the
      // full timeout on every page.
      if (waitForFunction) {
        try {
          await page.waitForFunction(waitForFunction, null, { timeout: waitTimeout })
        } catch {
          // Fall through — extract() decides whether the page was usable.
        }
      } else if (waitFor) {
        try {
          await page.waitForSelector(waitFor, { timeout: waitTimeout })
        } catch {
          // Fall through — extract() decides whether the page was usable.
        }
      }
      if (settleMs) await page.waitForTimeout(settleMs)
      return await page.evaluate(extract)
    } finally {
      await page.close()
    }
  }

  async close() {
    await this.context?.close().catch(() => {})
    await this.browser?.close().catch(() => {})
    this.browser = null
    this.context = null
  }
}
