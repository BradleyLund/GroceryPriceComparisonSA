import { checkers, shoprite } from './shoprite-group.mjs'
import { pnp } from './pnp.mjs'
import { spar } from './spar.mjs'
import { woolworths } from './woolworths.mjs'

/** Keyed by the store ids used in src/data/stores.ts. */
export const ADAPTERS = { checkers, pnp, shoprite, woolworths, spar }

export const ALL_STORE_IDS = Object.keys(ADAPTERS)
