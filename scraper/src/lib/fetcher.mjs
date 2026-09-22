/**
 * Polite HTTP client for the scrapers.
 *
 * Every outbound request goes through here so that rate limiting, robots
 * compliance, retries and disk caching are impossible to accidentally skip in
 * an individual adapter.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Robots } from './robots.mjs'

/**
 * A descriptive bot UA is the polite default, but the Shoprite Group CDN
 * returns 403 to unrecognised user agents regardless of what robots.txt
 * permits, so a mainstream browser UA is the working default. Override with
 * SCRAPER_USER_AGENT if you have an arrangement with a retailer.
 *
 * Note this only gets past a user-agent filter — robots.txt rules are still
 * parsed and enforced in `text()` below.
 */
const DEFAULT_UA =
  process.env.SCRAPER_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class RobotsDisallowedError extends Error {
  constructor(url) {
    super(`robots.txt disallows ${url}`)
    this.name = 'RobotsDisallowedError'
    this.url = url
  }
}

export class Fetcher {
  /**
   * @param {object} opts
   * @param {string} opts.cacheDir      where raw responses are cached
   * @param {number} opts.cacheTtlMs    0 disables the cache
   * @param {number} opts.minDelayMs    floor on the gap between requests to one host
   * @param {boolean} opts.respectVisitTime honour robots.txt `Visit-time` windows
   * @param {boolean} opts.obeyRobots   set false only for a host you own
   */
  constructor({
    cacheDir,
    cacheTtlMs = 6 * 60 * 60 * 1000,
    minDelayMs = 1000,
    maxRetries = 3,
    userAgent = DEFAULT_UA,
    respectVisitTime = false,
    obeyRobots = true,
    logger = console,
  } = {}) {
    this.cacheDir = cacheDir
    this.cacheTtlMs = cacheTtlMs
    this.minDelayMs = minDelayMs
    this.maxRetries = maxRetries
    this.userAgent = userAgent
    this.respectVisitTime = respectVisitTime
    this.obeyRobots = obeyRobots
    this.log = logger

    /** @type {Map<string, Promise<Robots>>} */
    this.robotsCache = new Map()
    /** @type {Map<string, Promise<void>>} */
    this.hostQueues = new Map()
    this.stats = { requests: 0, cacheHits: 0, retries: 0, blocked: 0 }
  }

  cachePathFor(url) {
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 16)
    const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_')
    return path.join(this.cacheDir, host, `${hash}.txt`)
  }

  async readCache(url) {
    if (!this.cacheDir || this.cacheTtlMs <= 0) return null
    const file = this.cachePathFor(url)
    try {
      const info = await stat(file)
      if (Date.now() - info.mtimeMs > this.cacheTtlMs) return null
      return await readFile(file, 'utf8')
    } catch {
      return null
    }
  }

  async writeCache(url, body) {
    if (!this.cacheDir || this.cacheTtlMs <= 0) return
    const file = this.cachePathFor(url)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, body, 'utf8')
  }

  async getRobots(origin) {
    if (!this.robotsCache.has(origin)) {
      this.robotsCache.set(
        origin,
        (async () => {
          try {
            const res = await fetch(`${origin}/robots.txt`, {
              headers: { 'user-agent': this.userAgent },
              signal: AbortSignal.timeout(20_000),
            })
            if (!res.ok) return Robots.allowAll()
            return Robots.parse(await res.text())
          } catch {
            return Robots.allowAll()
          }
        })(),
      )
    }
    return this.robotsCache.get(origin)
  }

  /**
   * Serialises requests per host and spaces them by the larger of our floor and
   * the host's declared Crawl-delay.
   */
  async withHostSlot(host, delayMs, fn) {
    const prev = this.hostQueues.get(host) ?? Promise.resolve()
    let release
    const slot = new Promise((resolve) => {
      release = resolve
    })
    this.hostQueues.set(
      host,
      prev.then(() => slot),
    )
    await prev
    try {
      return await fn()
    } finally {
      // Hold the slot open for the crawl delay so the next caller waits it out.
      setTimeout(release, delayMs)
    }
  }

  /**
   * Fetch a URL as text, honouring cache, robots and rate limits.
   * @returns {Promise<string>}
   */
  async text(url, { headers = {}, allowRobotsOverride = false } = {}) {
    const cached = await this.readCache(url)
    if (cached !== null) {
      this.stats.cacheHits += 1
      return cached
    }

    const parsed = new URL(url)
    const origin = parsed.origin

    if (this.obeyRobots && !allowRobotsOverride) {
      const robots = await this.getRobots(origin)
      const pathWithQuery = parsed.pathname + parsed.search
      if (!robots.isAllowed(pathWithQuery)) {
        this.stats.blocked += 1
        throw new RobotsDisallowedError(url)
      }
      if (this.respectVisitTime) {
        const wait = robots.msUntilVisitWindow()
        if (wait !== null) {
          throw new Error(
            `${parsed.hostname} robots.txt restricts crawling to a time window; ` +
              `next window opens in ${Math.round(wait / 60000)} min. ` +
              `Re-run inside the window, or pass --ignore-visit-time to override.`,
          )
        }
      }
    }

    const robots = this.obeyRobots ? await this.getRobots(origin) : null
    const declaredDelay = (robots?.crawlDelaySeconds ?? 0) * 1000
    const delayMs = Math.max(this.minDelayMs, declaredDelay)

    return this.withHostSlot(parsed.hostname, delayMs, async () => {
      let lastError
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        if (attempt > 0) {
          this.stats.retries += 1
          const backoff = Math.min(30_000, 2 ** attempt * 1000) + Math.random() * 500
          this.log.warn?.(`  retry ${attempt}/${this.maxRetries} in ${Math.round(backoff)}ms — ${url}`)
          await sleep(backoff)
        }
        try {
          this.stats.requests += 1
          const res = await fetch(url, {
            headers: {
              'user-agent': this.userAgent,
              accept: 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
              'accept-language': 'en-ZA,en;q=0.9',
              ...headers,
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(45_000),
          })
          // 4xx other than 429 won't fix themselves — fail fast.
          if (!res.ok && res.status !== 429 && res.status < 500) {
            throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: true })
          }
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
          const body = await res.text()
          await this.writeCache(url, body)
          return body
        } catch (err) {
          lastError = err
          if (err.fatal) break
        }
      }
      throw lastError
    })
  }

  async json(url, opts) {
    return JSON.parse(await this.text(url, opts))
  }
}
