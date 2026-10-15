import { sql } from '@payloadcms/db-postgres'
import { identityOf } from '../email/client-identity'
import type { ClientConfig } from './index'

/**
 * KIT-0 post-migrate identity step. The migrations are the same SQL for every client, and a few of them bake a company's
 * identity into a fresh database: column DEFAULTs (the Revenue Engine signature signer and sales address, the `tenant` column of
 * suppressions and intake events) and one inserted row (the standard email signature). Run once after `payload migrate`, this step
 * rewrites them from the client's manifest. It needs no knowledge of the old values: it reads each column's current default from
 * the database, sets the new default, and changes only the rows that still hold the old default (nothing an admin typed). The
 * standard signature row is rewritten only while it is still the untouched seed row (`updated_at = created_at`).
 * Idempotent: a second run changes nothing. Pure planning and one executor; the executor is Payload's drizzle (or a fake in tests).
 */
export type Exec = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }
export type BakedColumn = { table: string; column: string; value: string; why: string }
export type StepReport = {
  columns: Array<{ table: string; column: string; state: 'missing' | 'unchanged' | 'rewritten'; rowsUpdated: number }>
  signatureRowsUpdated: number
}

/** The columns the migrations bake a company value into, with the client's value for each. */
export function bakedColumns(c: ClientConfig): BakedColumn[] {
  const id = identityOf(c)
  return [
    { table: 'crm_ers_settings', column: 'signature_signer', value: id.signature.name, why: 'Revenue Engine signature signer' },
    { table: 'crm_ers_settings', column: 'signature_email', value: id.salesAddress, why: 'Revenue Engine signature address (the sales address)' },
    { table: 'crm_suppressions', column: 'tenant', value: c.tenantKey, why: 'tenant key written to suppression rows' },
    { table: 'crm_intake_events', column: 'tenant', value: c.tenantKey, why: 'tenant key written to intake events' },
  ]
}
/** The standard email signature text the client's rows start with. */
export const standardSignatureText = (c: ClientConfig): string => {
  const id = identityOf(c)
  return [id.signature.name, ...id.signature.lines].join('\n')
}

/** `'it''s'::character varying` → `it's`; null when the default is not a plain string literal. */
export function parseDefault(d: string | null | undefined): string | null {
  if (typeof d !== 'string') return null
  const m = /^'((?:[^']|'')*)'(?:::[\w\s."[\]]+)?$/.exec(d.trim())
  return m ? m[1]!.replace(/''/g, "'") : null
}
/** A string as an SQL literal for DDL (a DEFAULT cannot take a parameter): quotes doubled; control characters and absurd lengths refused. */
export function quoteLiteral(v: string): string {
  // eslint-disable-next-line no-control-regex
  if (v.length === 0 || v.length > 300 || /[\u0000-\u001f\u007f\\]/.test(v)) throw new Error('identity value is empty, too long, or contains a control character or backslash')
  return `'${v.replace(/'/g, "''")}'`
}
const rows = (r: unknown): Array<Record<string, unknown>> => ((r as { rows?: Array<Record<string, unknown>> } | null)?.rows ?? []) as Array<Record<string, unknown>>
const count = (r: unknown): number => Number((r as { rowCount?: number } | null)?.rowCount ?? 0)

export async function applyIdentityStep(db: Exec, c: ClientConfig): Promise<StepReport> {
  const report: StepReport = { columns: [], signatureRowsUpdated: 0 }
  for (const b of bakedColumns(c)) {
    const found = rows(await db.execute(sql`SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${b.table} AND column_name = ${b.column}`))
    if (found.length === 0) {
      report.columns.push({ table: b.table, column: b.column, state: 'missing', rowsUpdated: 0 })
      continue
    }
    const old = parseDefault(found[0]!.column_default as string | null)
    if (old === b.value) {
      report.columns.push({ table: b.table, column: b.column, state: 'unchanged', rowsUpdated: 0 })
      continue
    }
    await db.execute(sql.raw(`ALTER TABLE "${b.table}" ALTER COLUMN "${b.column}" SET DEFAULT ${quoteLiteral(b.value)}`))
    let updated = 0
    if (old !== null) updated = count(await db.execute(sql`UPDATE ${sql.raw(`"${b.table}"`)} SET ${sql.raw(`"${b.column}"`)} = ${b.value} WHERE ${sql.raw(`"${b.column}"`)} = ${old}`))
    report.columns.push({ table: b.table, column: b.column, state: 'rewritten', rowsUpdated: updated })
  }
  const text = standardSignatureText(c)
  report.signatureRowsUpdated = count(await db.execute(sql`UPDATE crm_signatures SET standard_text = ${text} WHERE standard_text <> ${text} AND updated_at = created_at`))
  return report
}
