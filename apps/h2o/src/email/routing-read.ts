import type { Payload } from 'payload'
import { DEFAULT_SALES_ADDRESS, readEmailConfig, resolveSalesAddress as resolveSalesAddressEnv, type EmailConfig } from './config'
import { dedupeAddresses } from './routing-parse'

/**
 * ALERTS-1: reading the stored routing (the `crm-email-routing` global) and resolving it with the environment
 * fallbacks. Kept apart from the save/test service (routing.ts) so the RFQ notification code can import it without an
 * import cycle. An empty setting means "use the server's default", so a fresh database behaves exactly as before.
 */
type Doc = Record<string, unknown>
const SLUG = 'crm-email-routing' as never
const TTL_MS = 15_000
const sys = { overrideAccess: true as const, depth: 0 }

export type RoutingValues = { alerts_us: string[]; alerts_th: string[]; alerts_cc: string[]; sales_address: string | null }
export const EMPTY_ROUTING: RoutingValues = { alerts_us: [], alerts_th: [], alerts_cc: [], sales_address: null }

let cached: { at: number; value: RoutingValues } | null = null
export const invalidateRouting = () => {
  cached = null
}

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
export function routingFromDoc(doc: unknown): RoutingValues {
  const d = (doc ?? {}) as Doc
  const sa = typeof d.sales_address === 'string' && d.sales_address.trim() ? d.sales_address.trim() : null
  return { alerts_us: listOf(d.alerts_us), alerts_th: listOf(d.alerts_th), alerts_cc: listOf(d.alerts_cc), sales_address: sa }
}

/** The stored routing (short cache). A failed read means "no settings": the environment defaults apply, and it is logged by code. */
export async function readRouting(payload: Payload, now = Date.now()): Promise<RoutingValues> {
  if (cached && now - cached.at < TTL_MS) return cached.value
  try {
    const doc = await payload.findGlobal({ slug: SLUG, ...sys })
    cached = { at: now, value: routingFromDoc(doc) }
  } catch (err) {
    payload.logger.error({ code: 'CRM_EMAIL_ROUTING_READ_FAILED', errName: (err as Error)?.name })
    return EMPTY_ROUTING
  }
  return cached.value
}

export type AlertRecipients = { everyone: string[]; extras: string[]; all: string[]; source: 'setting' | 'default' }

/**
 * Who gets the new-quote alert (one email, everyone in To): the "everyone" list (`alerts_cc`; empty → the server default
 * H2O_SALES_ALERT_TO) plus the extra recipients of the RFQ's office, deduplicated. An unknown office counts as US.
 */
export async function resolveAlertRecipients(payload: Payload, office: unknown, cfg: Pick<EmailConfig, 'salesAlertTo'> = readEmailConfig()): Promise<AlertRecipients> {
  const r = await readRouting(payload)
  const everyone = r.alerts_cc.length > 0 ? r.alerts_cc : cfg.salesAlertTo
  const extras = office === 'TH' ? r.alerts_th : r.alerts_us
  return { everyone, extras, all: dedupeAddresses([everyone, extras]), source: r.alerts_cc.length > 0 ? 'setting' : 'default' }
}

/** The public sales address: the setting, else H2O_RFQ_SALES_EMAIL, else the client's default sales address. */
export async function resolveSalesAddressLive(payload: Payload, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const r = await readRouting(payload)
  return r.sales_address ?? resolveSalesAddressEnv(env)
}

/** What the settings page shows: the stored values, what is in effect, and where each comes from. */
export async function routingView(payload: Payload, env: NodeJS.ProcessEnv = process.env) {
  const stored = routingFromDoc(await payload.findGlobal({ slug: SLUG, ...sys }).catch(() => ({})))
  const cfg = readEmailConfig(env)
  const everyone = stored.alerts_cc.length ? stored.alerts_cc : cfg.salesAlertTo
  return {
    stored,
    effective: {
      everyone,
      us: stored.alerts_us,
      th: stored.alerts_th,
      sales: stored.sales_address ?? resolveSalesAddressEnv(env),
    },
    usingDefault: { everyone: stored.alerts_cc.length === 0, sales: stored.sales_address === null },
    defaultSales: DEFAULT_SALES_ADDRESS,
    defaultAlerts: cfg.salesAlertTo,
  }
}
