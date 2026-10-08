import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { isWebsiteSource } from '../crm/vocabulary'
import { readSheetsConfig, type SheetsConfig } from './config'
import { appendRow, SheetsError, tokenPresent, type FetchLike } from './google'
import { buildRow } from './row'

/**
 * SHEET-SYNC-1: append every new website RFQ to a Google Sheet, without ever getting in the RFQ's way.
 *
 * The RFQ is committed first and knows nothing about the sheet. A job tick (the runner's intake-sweep tick) then
 *   1. finds website RFQs created since the feature was first switched on (a cursor in `crm_sheet_state`; nothing from
 *      before is back-filled) and queues one row each in `crm_sheet_appends`, keyed by the RFQ id (one row per RFQ, ever);
 *   2. claims due rows atomically (a lease and an owner token fence a slow worker) and appends them. A retry first
 *      looks for the RFQ number in the token column, so a row written just before a crash is not written twice;
 *   3. on failure waits 2^attempts minutes (≤ 1 h) and tries again; after MAX_ATTEMPTS the row is FAILED and shows in the
 *      admin overview ("Needs attention") until an admin presses "Try again".
 * Not an email kind and not gated by the email outbox. Logs carry codes and counts only: no addresses, no key, no
 * response bodies. With the environment unset the whole thing is off.
 */
type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle
const sys = { overrideAccess: true as const, depth: 0 }
export const MAX_ATTEMPTS = 8
export const LEASE_MS = 2 * 60_000
export const BATCH = 10
export const QUEUE_BATCH = 100
export const backoffMs = (attempts: number): number => Math.min(2 ** attempts, 60) * 60_000

export type SyncDeps = { fetch?: FetchLike; now?: Date; cfg?: SheetsConfig }
export type SyncResult = { enabled: boolean; queued: number; appended: number; alreadyThere: number; retrying: number; failed: number }
const OFF: SyncResult = { enabled: false, queued: 0, appended: 0, alreadyThere: 0, retrying: 0, failed: 0 }

async function state(payload: Payload, key: string): Promise<string | null> {
  const r = await db(payload).execute(sql`SELECT value FROM crm_sheet_state WHERE key = ${key}`)
  return (r.rows ?? [])[0] ? String(r.rows![0]!.value) : null
}
const setState = (payload: Payload, key: string, value: string) =>
  db(payload).execute(sql`INSERT INTO crm_sheet_state (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`)

/** Step 1: queue website RFQs created since the cursor. Returns how many rows were queued. */
export async function queueNewRfqs(payload: Payload, now: Date): Promise<number> {
  await db(payload).execute(sql`INSERT INTO crm_sheet_state (key, value) VALUES ('enabled_since', ${now.toISOString()}) ON CONFLICT (key) DO NOTHING`)
  const cursor = (await state(payload, 'cursor')) ?? (await state(payload, 'enabled_since')) ?? now.toISOString()
  const res = await payload.find({ collection: 'crm-rfqs', where: { createdAt: { greater_than_equal: cursor } }, sort: 'createdAt', limit: QUEUE_BATCH, select: { source_system: true, createdAt: true }, ...sys })
  let queued = 0
  let last = cursor
  for (const d of res.docs as unknown as Array<{ id: string | number; source_system?: string; createdAt?: string }>) {
    if (d.createdAt && d.createdAt > last) last = d.createdAt
    if (!isWebsiteSource(d.source_system)) continue
    const r = await db(payload).execute(sql`INSERT INTO crm_sheet_appends (inquiry_id, state, next_attempt_at) VALUES (${String(d.id)}, 'PENDING', ${now.toISOString()}) ON CONFLICT (inquiry_id) DO NOTHING RETURNING inquiry_id`)
    queued += (r.rows ?? []).length
  }
  if (last !== cursor) await setState(payload, 'cursor', last)
  return queued
}

type Claimed = { inquiry_id: string; attempts: number; owner: string }

async function claim(payload: Payload, now: Date): Promise<Claimed[]> {
  const owner = randomUUID()
  const r = await db(payload).execute(sql`
    UPDATE crm_sheet_appends SET state = 'SENDING', lease_owner = ${owner}, lease_until = ${new Date(now.getTime() + LEASE_MS).toISOString()}::timestamptz, attempts = attempts + 1
     WHERE inquiry_id IN (
       SELECT inquiry_id FROM crm_sheet_appends
        WHERE (state = 'PENDING' AND next_attempt_at <= ${now.toISOString()}::timestamptz)
           OR (state = 'SENDING' AND lease_until < ${now.toISOString()}::timestamptz)
        ORDER BY created_at ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
 RETURNING inquiry_id, attempts`)
  return (r.rows ?? []).map((x) => ({ inquiry_id: String(x.inquiry_id), attempts: Number(x.attempts), owner }))
}

const finish = (payload: Payload, c: Claimed, set: ReturnType<typeof sql>) => db(payload).execute(sql`UPDATE crm_sheet_appends SET ${set}, lease_owner = NULL, lease_until = NULL WHERE inquiry_id = ${c.inquiry_id} AND lease_owner = ${c.owner}`)

export async function syncSheets(payload: Payload, deps: SyncDeps = {}): Promise<SyncResult> {
  const cfg = deps.cfg ?? readSheetsConfig()
  if (!cfg.enabled) return OFF
  const now = deps.now ?? new Date()
  const f: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init))
  const out: SyncResult = { ...OFF, enabled: true }
  try {
    out.queued = await queueNewRfqs(payload, now)
  } catch {
    payload.logger.error({ code: 'SHEETS_QUEUE_FAILED' })
  }
  const base = (process.env.NEXT_PUBLIC_SERVER_URL ?? '').trim()
  for (const c of await claim(payload, now)) {
    try {
      const rfq = (await payload.findByID({ collection: 'crm-rfqs', id: c.inquiry_id, ...sys }).catch(() => null)) as Record<string, unknown> | null
      if (!rfq) {
        await finish(payload, c, sql`state = 'SKIPPED', last_error_code = 'RFQ_MISSING'`)
        continue
      }
      const row = buildRow(rfq, base)
      // A retry (or a row whose worker died after writing) first checks the sheet: never write the same RFQ twice.
      if (c.attempts > 1 && (await tokenPresent(cfg, f, now, String(rfq.rfq_number ?? '')))) {
        await finish(payload, c, sql`state = 'SENT', appended_at = ${now.toISOString()}::timestamptz, last_error_code = NULL`)
        out.alreadyThere++
        continue
      }
      await appendRow(cfg, f, now, row)
      await finish(payload, c, sql`state = 'SENT', appended_at = ${now.toISOString()}::timestamptz, last_error_code = NULL`)
      out.appended++
    } catch (err) {
      const code = err instanceof SheetsError ? err.code : 'SHEETS_UNEXPECTED'
      const dead = c.attempts >= MAX_ATTEMPTS
      await finish(payload, c, dead ? sql`state = 'FAILED', last_error_code = ${code}` : sql`state = 'PENDING', last_error_code = ${code}, next_attempt_at = ${new Date(now.getTime() + backoffMs(c.attempts)).toISOString()}::timestamptz`).catch(() => undefined)
      if (dead) out.failed++
      else out.retrying++
      payload.logger.warn({ code: 'SHEETS_APPEND_FAILED', reason: code, attempts: c.attempts, final: dead })
    }
  }
  return out
}

export type SheetStats = { failed: number; pending: number }
/** For the admin overview: rows that need a person (FAILED) and rows still on their way. */
export async function sheetStats(payload: Payload): Promise<SheetStats> {
  const r = await db(payload).execute(sql`SELECT count(*) FILTER (WHERE state = 'FAILED')::int AS failed, count(*) FILTER (WHERE state IN ('PENDING','SENDING'))::int AS pending FROM crm_sheet_appends`)
  const x = (r.rows ?? [])[0] ?? {}
  return { failed: Number(x.failed ?? 0), pending: Number(x.pending ?? 0) }
}

export type SheetRow = { inquiryId: string; state: string; attempts: number; code: string | null; createdAt: string }
export async function listSheetRows(payload: Payload, limit = 100): Promise<SheetRow[]> {
  const r = await db(payload).execute(sql`SELECT inquiry_id, state, attempts, last_error_code, created_at FROM crm_sheet_appends WHERE state <> 'SENT' ORDER BY (state = 'FAILED') DESC, created_at DESC LIMIT ${limit}`)
  return (r.rows ?? []).map((x) => ({ inquiryId: String(x.inquiry_id), state: String(x.state), attempts: Number(x.attempts), code: x.last_error_code ? String(x.last_error_code) : null, createdAt: new Date(String(x.created_at)).toISOString() }))
}

/** "Try again": FAILED rows go back to the queue with a clean count. */
export async function retryFailed(payload: Payload, now = new Date()): Promise<number> {
  const r = await db(payload).execute(sql`UPDATE crm_sheet_appends SET state = 'PENDING', attempts = 0, next_attempt_at = ${now.toISOString()}::timestamptz WHERE state = 'FAILED' RETURNING inquiry_id`)
  return (r.rows ?? []).length
}
