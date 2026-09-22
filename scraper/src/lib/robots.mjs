/**
 * Minimal but faithful robots.txt parser.
 *
 * Supports the directives that actually matter across the five SA retailers:
 * User-agent grouping, Allow/Disallow (with `*` wildcards and `$` anchoring),
 * Crawl-delay, and PnP's unusual Visit-time window.
 *
 * Longest-match-wins between Allow and Disallow, per the de-facto standard.
 */

export const AGENT_TOKEN = 'sagrocerybot'

function patternToRegExp(pattern) {
  let anchoredEnd = false
  let p = pattern
  if (p.endsWith('$')) {
    anchoredEnd = true
    p = p.slice(0, -1)
  }
  // Escape regex metacharacters except `*`, which robots.txt uses as a wildcard.
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + escaped + (anchoredEnd ? '$' : ''))
}

function parseVisitTime(value) {
  const m = value.match(/(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})/)
  if (!m) return null
  return {
    startMinutes: Number(m[1]) * 60 + Number(m[2]),
    endMinutes: Number(m[3]) * 60 + Number(m[4]),
  }
}

export function parseRobots(text) {
  const groups = []
  let current = null
  let lastLineWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group of rules.
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null, visitTime: null }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastLineWasAgent = true
      continue
    }

    lastLineWasAgent = false
    if (!current) continue

    if (field === 'disallow' || field === 'allow') {
      // An empty Disallow means "allow everything" — skip it rather than
      // building a pattern that matches every path.
      if (value === '') continue
      current.rules.push({ allow: field === 'allow', path: value, re: patternToRegExp(value) })
    } else if (field === 'crawl-delay') {
      const n = Number(value)
      if (Number.isFinite(n)) current.crawlDelay = n
    } else if (field === 'visit-time') {
      current.visitTime = parseVisitTime(value)
    }
  }

  return groups
}

/** Pick the group for our agent, else the wildcard group, else nothing. */
function selectGroup(groups, agent) {
  const named = groups.find((g) => g.agents.includes(agent))
  if (named) return named
  return groups.find((g) => g.agents.includes('*')) ?? null
}

export class Robots {
  constructor(groups, agent = AGENT_TOKEN) {
    this.group = selectGroup(groups, agent)
  }

  static parse(text, agent = AGENT_TOKEN) {
    return new Robots(parseRobots(text), agent)
  }

  /** Permissive fallback for when robots.txt is missing or unfetchable. */
  static allowAll() {
    return new Robots([], AGENT_TOKEN)
  }

  isAllowed(pathWithQuery) {
    if (!this.group) return true
    let best = null
    for (const rule of this.group.rules) {
      if (!rule.re.test(pathWithQuery)) continue
      // Longest matching pattern wins; Allow beats Disallow on an exact tie.
      if (
        !best ||
        rule.path.length > best.path.length ||
        (rule.path.length === best.path.length && rule.allow)
      ) {
        best = rule
      }
    }
    return best ? best.allow : true
  }

  get crawlDelaySeconds() {
    return this.group?.crawlDelay ?? null
  }

  /**
   * PnP declares `Visit-time: 0400-0845` (UTC). Returns null when we're inside
   * the window (or none is declared), otherwise the ms until it opens.
   */
  msUntilVisitWindow(now = new Date()) {
    const vt = this.group?.visitTime
    if (!vt) return null
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
    const { startMinutes, endMinutes } = vt
    const inside =
      startMinutes <= endMinutes
        ? mins >= startMinutes && mins < endMinutes
        : mins >= startMinutes || mins < endMinutes // window wraps midnight
    if (inside) return null
    let delta = startMinutes - mins
    if (delta < 0) delta += 24 * 60
    return delta * 60 * 1000
  }
}
