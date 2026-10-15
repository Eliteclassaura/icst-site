import type { Payload } from 'payload'
import { ensureTemplates } from '../crm/settings/templates'
import type { ClientConfig } from './index'

/**
 * ICST CRM seed pack (post-migrate, after the identity step). Everything here is idempotent and never overwrites an admin's work:
 *   - the reply templates T1–T6 (and the sequence templates) are created from `SEED_TEMPLATES`, which are all UNAPPROVED, so nothing can
 *     be sent until this client's owner approves its own wording; T1 (the automatic acknowledgement) is also off by environment default;
 *   - the country routing rows the owner listed are added to the office settings (missing ones only), each pointing at the office the
 *     manifest's routing says (for a one-office client, that office);
 *   - business hours, holidays, signature, tenant and sender come from the manifest through H3, H4 and the identity step.
 */
/** The countries ICST's owner named for the visible routing list (plan WP-26). Others still route by the manifest rule. */
export const SEED_ROUTING_COUNTRIES = ['TH', 'IN', 'US', 'GB', 'PH', 'MY', 'SG'] as const

export type RoutingRow = { country_code: string; office: string }
/** The rows to add: every listed country that has no override yet, routed where the manifest rule sends it. Pure. */
export function routingRowsToAdd(c: Pick<ClientConfig, 'officeKeyForCountry'>, existing: ReadonlyArray<{ country_code?: unknown }>, countries: readonly string[] = SEED_ROUTING_COUNTRIES): RoutingRow[] {
  const have = new Set(existing.map((r) => String(r.country_code ?? '').trim().toUpperCase()))
  return countries.filter((code) => !have.has(code)).map((code) => ({ country_code: code, office: c.officeKeyForCountry(code) }))
}

export type SeedPackReport = { routingRowsAdded: number; templatesEnsured: true }
export async function applySeedPack(payload: Payload, c: ClientConfig): Promise<SeedPackReport> {
  await ensureTemplates(payload)
  const doc = (await payload.findGlobal({ slug: 'crm-office-settings' as never, depth: 0, overrideAccess: true })) as unknown as { routing_overrides?: Array<Record<string, unknown>> }
  const existing = doc.routing_overrides ?? []
  const add = routingRowsToAdd(c, existing)
  if (add.length > 0) {
    await payload.updateGlobal({
      slug: 'crm-office-settings' as never,
      data: { routing_overrides: [...existing.map(({ id: _id, ...r }) => r), ...add] } as never,
      overrideAccess: true,
    })
  }
  return { routingRowsAdded: add.length, templatesEnsured: true }
}
