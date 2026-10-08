import type { Payload } from 'payload'
import { isUniqueViolation } from './activity'
import { STAGE_LABEL } from './workspace/labels'
import { OPPORTUNITY_STAGE, TERMINAL_STAGES } from './vocabulary'

/** OPP-1 stage configuration (collections/deal-stages.ts): label, order and enabled flag per fixed stage key. */
export type StageConfig = { key: string; label: string; order: number; enabled: boolean; terminal: boolean }

const terminal = (key: string) => (TERMINAL_STAGES as readonly string[]).includes(key)

/** Seeded defaults: the accepted stage order and wording, all enabled. Missing rows are created; existing rows are never overwritten. */
export async function ensureDealStages(payload: Payload): Promise<StageConfig[]> {
  const read = async () => (await payload.find({ collection: 'crm-deal-stages', limit: 100, depth: 0, pagination: false, overrideAccess: true })).docs as unknown as Array<Record<string, unknown>>
  let rows = await read()
  const have = new Set(rows.map((r) => String(r.key)))
  const missing = OPPORTUNITY_STAGE.filter((k) => !have.has(k))
  if (missing.length) {
    for (const key of missing) {
      try {
        await payload.create({
          collection: 'crm-deal-stages',
          data: { key, label: STAGE_LABEL[key]?.label ?? key, sort_order: OPPORTUNITY_STAGE.indexOf(key) * 10, enabled: true } as never,
          context: { crmServer: { source: 'SEED_DEFAULT' } },
          overrideAccess: true,
        })
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
      }
    }
    rows = await read()
  }
  return rows
    .map((r) => ({ key: String(r.key), label: String(r.label ?? r.key), order: Number(r.sort_order ?? 0), enabled: r.enabled !== false, terminal: terminal(String(r.key)) }))
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
}
