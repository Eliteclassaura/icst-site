import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { readEmailConfig, readInboundConfig } from '../../email/config'
import { ersSettings } from '../ers/settings'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { parseCsv, type Mapping } from './csv'
import { applyImport, cutByField, planImport, undoRun, type Summary } from './engine'

/**
 * IMPORT-CLI-1: the operator path for a contact import with no browser (Commander, Phase P: the site is private and
 * sending is off). The same engine, plan, approval token and audit as the admin import page — nothing new decides
 * anything about a row.
 *
 *   dry   verify the file's SHA-256, plan it as the named admin, print the counts and the approval token; writes nothing
 *   apply verify again, refuse unless email sending, the Revenue Engine and inbound mail are all OFF, apply with the
 *         token (the engine re-plans and refuses on any difference), then prove nothing was queued or enrolled
 *   undo  archive every batch of this file (the import page's undo; archive-only)
 *
 * Output is counts, batch ids, the file hash and codes only: never a name, an address, a phone or a row value.
 */

/** The legacy load (CRM_LEGACY_IMPORT_SIGNOFF_REPORT_2026-10-05 §3, CT sign-off): file column → CRM field. */
export const LEGACY_COLUMNS = { email: 'email', first_name: 'first_name', last_name: 'last_name', phone: 'primary_phone', mobile_phone: 'mobile_phone', company: 'company_name' } as const
/**
 * §6 options: accounts from corporate domains, owner-attested with source and basis. Owner ruling 2026-10-08 (via CT):
 * the few over-long cells left after the name-link rule are cut to their field limit, by explicit choice, bound into the
 * approval and recorded by field.
 */
export const LEGACY_OPTIONS = {
  createAccounts: true,
  attested: true,
  source: 'email-IQ export 2026-07-14',
  basis: 'owner-attested existing customers (2026-10-05)',
  truncateOversize: true,
} as const

export class OperatorError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'OperatorError'
  }
}

export const sha256Hex = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/** The file, verified against the hash the operator was given (refused on any difference). */
export function verifiedText(bytes: Buffer, expectedSha: string): string {
  if (!/^[0-9a-f]{64}$/.test(expectedSha)) throw new OperatorError('SHA_ARGUMENT_INVALID')
  if (sha256Hex(bytes) !== expectedSha) throw new OperatorError('SHA_MISMATCH')
  return bytes.toString('utf8')
}

/** Column indexes for the signed-off mapping; a missing column refuses (the code names the column, never a value). */
export function legacyMapping(text: string): Mapping {
  const csv = parseCsv(text)
  if (!csv.ok) throw new OperatorError(`CSV_${csv.code ?? 'UNREADABLE'}`)
  const norm = csv.header.map((h) => h.trim().toLowerCase())
  const m: Mapping = {}
  for (const [field, column] of Object.entries(LEGACY_COLUMNS)) {
    const i = norm.indexOf(column)
    if (i < 0) throw new OperatorError(`COLUMN_MISSING_${column.toUpperCase()}`)
    m[field as keyof Mapping] = i
  }
  return m
}

/** The admin the run is recorded as. A CLI run has no browser sign-in: it runs as this named admin, on the server. */
export async function operatorSession(payload: Payload, email: string): Promise<CrmSession> {
  const found = await payload.find({ collection: 'users', where: { email: { equals: email.trim().toLowerCase() } }, limit: 1, depth: 0, overrideAccess: true })
  const s = found.docs[0] ? crmSessionFor(payload, found.docs[0]) : null
  if (!s || !s.isAdmin) throw new OperatorError('NOT_AN_ADMIN')
  return s
}

/** Email sending, the Revenue Engine and inbound mail must all be OFF before an apply. */
export async function sendingOff(payload: Payload, env: NodeJS.ProcessEnv = process.env): Promise<{ ok: boolean; mode: string; engine: boolean; inbound: boolean }> {
  const mode = readEmailConfig(env).mode
  const engine = (await ersSettings(payload)).enabled
  const inbound = readInboundConfig(env).enabled
  return { ok: mode === 'off' && !engine && !inbound, mode, engine, inbound }
}

/** What could make an import reach anyone: sequence enrollments and outgoing email rows. */
export async function reachCounts(payload: Payload): Promise<{ enrollments: number; outbox: number }> {
  const [e, o] = await Promise.all([
    payload.count({ collection: 'crm-enrollments' as never, overrideAccess: true }),
    payload.count({ collection: 'crm-email-outbox', overrideAccess: true }),
  ])
  return { enrollments: e.totalDocs, outbox: o.totalDocs }
}

export type DryResult = { sha256: string; rows: number; summary: Summary; cutByField: Record<string, number>; blocked: boolean; approval: string | null }
export async function dryRun(payload: Payload, bytes: Buffer, expectedSha: string, adminEmail: string): Promise<DryResult> {
  const text = verifiedText(bytes, expectedSha)
  const s = await operatorSession(payload, adminEmail)
  const out = await planImport(s, text, legacyMapping(text), LEGACY_OPTIONS)
  if ('error' in out) throw new OperatorError(`PLAN_${out.error.code}`)
  return { sha256: out.plan.sha256, rows: out.plan.rows.length, summary: out.plan.summary, cutByField: cutByField(out.plan), blocked: out.plan.blocked, approval: out.plan.approval }
}

export type ApplyOutcome = { sha256: string; batchIds: string[]; summary: Summary; failed: Array<{ row: number; code: string }>; before: { enrollments: number; outbox: number }; after: { enrollments: number; outbox: number } }
export async function apply(payload: Payload, bytes: Buffer, expectedSha: string, adminEmail: string, approval: string, env: NodeJS.ProcessEnv = process.env, note: string | null = null): Promise<ApplyOutcome> {
  const text = verifiedText(bytes, expectedSha)
  const s = await operatorSession(payload, adminEmail)
  const off = await sendingOff(payload, env)
  if (!off.ok) throw new OperatorError(`SENDING_NOT_OFF${off.mode !== 'off' ? '_EMAIL' : ''}${off.engine ? '_ENGINE' : ''}${off.inbound ? '_INBOUND' : ''}`)
  const before = await reachCounts(payload)
  // PROD-IMPORT-1 N1: every batch and its audit say it ran from the operator CLI, with the operator's note
  const r = await applyImport(s, text, legacyMapping(text), LEGACY_OPTIONS, approval, undefined, { via: 'operator-cli', note })
  if (!r.ok) throw new OperatorError(r.code)
  if (r.stopped) throw new OperatorError(`STOPPED_${r.stopped.code}_AT_ROW_${r.stopped.fromRow}`)
  const after = await reachCounts(payload)
  // the import never reaches anyone: not one enrollment, not one queued email
  if (after.enrollments !== before.enrollments || after.outbox !== before.outbox) throw new OperatorError('IMPORT_QUEUED_OR_ENROLLED')
  return { sha256: expectedSha, batchIds: r.batchIds, summary: r.summary, failed: r.failed, before, after }
}

export async function undo(payload: Payload, expectedSha: string, adminEmail: string, note: string) {
  const s = await operatorSession(payload, adminEmail)
  const r = await undoRun(s, { sha: expectedSha, note })
  if (!r.ok) throw new OperatorError(r.code)
  return r
}
