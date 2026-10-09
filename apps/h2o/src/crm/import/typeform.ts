import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'
import { safeUploadUrl } from '../collections/historical-inquiries'
import { RFQ_NUMBER_PATTERN } from '../ids'
import { emailKey } from '../normalize'
import { wallClockToUtc } from '../workspace/time'
import { cpLength, cpSlice } from '../workspace/validate'
import { parseCsv, type Mapping } from './csv'
import { applyImport, nameHasLink, planImport, undoRun, type Summary } from './engine'
import { OperatorError, operatorSession, reachCounts, sendingOff, verifiedText } from './operator'

/**
 * IMPORT-TYPEFORM-1 (owner, CT 2026-10-08): the Typeform leads sheet — real quote requests received before the CRM —
 * loaded as contacts plus ONE past quote request per response. Post-launch: one full run right after the DNS switch
 * (it also covers the last leads before it); a later run of a newer download adds only new responses.
 *
 *   contacts   the same engine, rules and approval as every import (dedupe by email key, fill-empty, accounts from
 *              corporate domains, link-in-name spam rule, cuts by explicit choice), from the most recent response of
 *              each address. Not owner-attested: these are inquiries, not confirmed customers.
 *   requests   `crm-historical-inquiries` only — never `crm-rfqs`, so no RFQ hook, task, alert or acknowledgement runs
 *              (nothing here imports notify). One per Typeform token, UNIQUE in the database: create-or-skip; a token
 *              seen before with different content is reported (CONFLICT) and left as it is.
 *   safety     sending, the Revenue Engine and inbound must be off; 0 enrollments and 0 outgoing email, proven by
 *              before/after counts; output is counts and codes only; the upload link is stored as text (https on the
 *              Typeform host) and never fetched or printed.
 */
/** The token prefix SHEET-SYNC-1.1 gives website rows (CRM-B, sheets/row.ts WEB_TOKEN_PREFIX). */
export const WEB_TOKEN_PREFIX = 'web-'
export const TYPEFORM_ZONE = 'America/Denver' // the sheet's time zone (owner, CT 2026-10-08)
export const TYPEFORM_COLUMNS = {
  email: /what is your email address/i,
  first_name: /your first name/i,
  last_name: /your last name/i,
  company: /what company are you with/i,
  interest: /what are you interested in/i,
  part: /what part are you interested in/i,
  details: /please provide any information/i,
  urgent: /urgent part quote request/i,
  upload: /upload any relevant files/i,
  phone: /your phone number/i,
  country: /country of destination/i,
  notes: /anything else you.d like us to know/i,
  submitted_at: /^submitted at$/i,
  token: /^token$/i,
} as const
type Col = keyof typeof TYPEFORM_COLUMNS
export const INQUIRY_LIMITS = { interest: 500, part: 200, details: 4000, destination_country: 120, notes: 4000 } as const
type InquiryField = keyof typeof INQUIRY_LIMITS

export function typeformColumns(header: string[]): Record<Col, number> {
  const norm = header.map((h) => h.trim())
  const out = {} as Record<Col, number>
  for (const [k, re] of Object.entries(TYPEFORM_COLUMNS) as Array<[Col, RegExp]>) {
    const hits = norm.flatMap((h, i) => (re.test(h) ? [i] : []))
    if (hits.length !== 1) throw new OperatorError(`TF_COLUMN_${hits.length ? 'AMBIGUOUS' : 'MISSING'}_${k.toUpperCase()}`)
    out[k] = hits[0]!
  }
  return out
}

/** "M/D/YYYY H:MM:SS" (the sheet's format) in the sheet's zone → UTC ISO; null if it is not that shape or impossible. */
export function submittedAtUtc(raw: string, zone: string = TYPEFORM_ZONE): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const d = wallClockToUtc(Number(m[3]), Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5]), Number(m[6]), zone)
  return d ? d.toISOString() : null
}
const urgency = (v: string): 'YES' | 'NO' | 'UNKNOWN' => (/^\s*yes\s*$/i.test(v) ? 'YES' : /^\s*no\s*$/i.test(v) ? 'NO' : 'UNKNOWN')
const text = (v: string | undefined) => {
  const t = (v ?? '').replace(/\r\n?/g, '\n').trim()
  return t ? t : null
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const csvCell = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`

export type InquiryAction = 'NEW' | 'UNCHANGED' | 'CONFLICT' | 'SKIP'
export type PlannedInquiry = {
  row: number
  token: string
  action: InquiryAction
  code: string | null
  emailKey: string | null
  contentSha: string
  submittedAt: string | null
  values: Record<InquiryField, string | null> & { urgent: 'YES' | 'NO' | 'UNKNOWN'; upload_url: string | null }
  cut: InquiryField[]
}
export type TypeformPlan = {
  fileSha: string
  rows: number
  contactsText: string
  contactMapping: Mapping
  contactPlan: { summary: Summary; blocked: boolean; approval: string | null; sha256: string }
  inquiries: PlannedInquiry[]
  counts: Record<string, number>
  approval: string | null
}
/** Contacts: not owner-attested (inquiries, not confirmed customers); accounts from corporate domains; cuts recorded. */
export const TYPEFORM_CONTACT_OPTIONS = { createAccounts: true, attested: false, source: 'Typeform leads (quote requests)', basis: null, truncateOversize: true } as const
const CONTACT_MAPPING: Mapping = { email: 0, first_name: 1, last_name: 2, company: 3, phone: 4 }

const FALLBACK_KEY = randomBytes(32)
const approvalKey = () => (process.env.PAYLOAD_SECRET ? `crm-typeform-approval:${process.env.PAYLOAD_SECRET}` : FALLBACK_KEY)
function planApproval(userId: string, p: Omit<TypeformPlan, 'approval'>): string | null {
  if (!p.contactPlan.approval) return null
  const inq = createHash('sha256')
  for (const q of p.inquiries) inq.update(`${q.row}|${q.token}|${q.action}|${q.code ?? ''}|${q.contentSha}|${q.cut.join(',')}\n`)
  return createHmac('sha256', approvalKey()).update(JSON.stringify({ v: 'tf1', userId, fileSha: p.fileSha, contacts: p.contactPlan.approval, inquiries: inq.digest('hex') })).digest('hex')
}

export async function planTypeform(payload: Payload, bytes: Buffer, expectedSha: string, adminEmail: string): Promise<TypeformPlan> {
  const textIn = verifiedText(bytes, expectedSha)
  const s = await operatorSession(payload, adminEmail)
  const csv = parseCsv(textIn)
  if (!csv.ok) throw new OperatorError(`CSV_${csv.code ?? 'UNREADABLE'}`)
  const c = typeformColumns(csv.header)
  const m: Mapping = { email: c.email, first_name: c.first_name, last_name: c.last_name }
  const counts: Record<string, number> = {}
  const inc = (k: string) => (counts[k] = (counts[k] ?? 0) + 1)

  // The contact of each address from its most recent response (fill-empty applies to contacts already in the CRM).
  const latest = new Map<string, { at: string; r: string[] }>()
  // A token seen earlier in the file is the same response again: it is skipped, and it adds no contact either.
  const seenTokens = new Set<string>()
  const inquiries: PlannedInquiry[] = csv.rows.map((r, i) => {
    const token = (r[c.token] ?? '').trim()
    const key = emailKey(r[c.email])
    const submittedAt = submittedAtUtc(r[c.submitted_at] ?? '')
    const cut: InquiryField[] = []
    const capped = (f: InquiryField, v: string | undefined) => {
      const t = text(v)
      // PROD-IMPORT-1 N3: caps count code points, and a cut never splits a character
      if (t && cpLength(t) > INQUIRY_LIMITS[f]) {
        cut.push(f)
        return cpSlice(t, INQUIRY_LIMITS[f])
      }
      return t
    }
    const rawUpload = text(r[c.upload])
    const values = {
      interest: capped('interest', r[c.interest]),
      part: capped('part', r[c.part]),
      details: capped('details', r[c.details]),
      destination_country: capped('destination_country', r[c.country]),
      notes: capped('notes', r[c.notes]),
      urgent: urgency(r[c.urgent] ?? ''),
      upload_url: safeUploadUrl(rawUpload),
    }
    if (rawUpload && !values.upload_url) inc('uploadLinkRefused')
    if (values.upload_url) inc('uploadLinks')
    const contentSha = sha(JSON.stringify({ key: key?.matchKey ?? null, at: submittedAt, ...values, first: text(r[c.first_name]), last: text(r[c.last_name]), company: text(r[c.company]), phone: text(r[c.phone]) }))
    const base: PlannedInquiry = { row: i + 1, token, action: 'NEW', code: null, emailKey: key?.matchKey ?? null, contentSha, submittedAt, values, cut }
    const skip = (code: string) => ({ ...base, action: 'SKIP' as const, code })
    // Website RFQs appended to the same sheet by the CRM are already RFQs in the CRM: never imported as past requests
    // (and they add no contact). SHEET-SYNC-1 writes the RFQ number as the token; SHEET-SYNC-1.1 writes
    // `web-<submission uuid>` (CRM-B's WEB_TOKEN_PREFIX in sheets/row.ts, confirmed 2026-10-08).
    if (token.startsWith(WEB_TOKEN_PREFIX) || RFQ_NUMBER_PATTERN.test(token)) return skip('TF_WEBSITE_ROW')
    if (!/^[A-Za-z0-9]{8,64}$/.test(token)) return skip('TF_TOKEN_INVALID')
    if (!key) return skip('TF_EMAIL_INVALID')
    if (!submittedAt) return skip('TF_SUBMITTED_AT_INVALID')
    if (seenTokens.has(token)) return skip('TF_TOKEN_REPEATED_IN_FILE')
    seenTokens.add(token)
    if (nameHasLink(r, m)) inc('linkInName')
    const prev = latest.get(key.matchKey)
    if (!prev || prev.at < submittedAt) latest.set(key.matchKey, { at: submittedAt, r })
    return base
  })

  // Contacts through the engine (the same plan, rules and approval as the import page).
  const header = 'email,first_name,last_name,company,phone'
  const contactsText = [header, ...[...latest.values()].map(({ r }) => [r[c.email], r[c.first_name], r[c.last_name], r[c.company], r[c.phone]].map((v) => csvCell(text(v))).join(','))].join('\n') + '\n'
  const planned = await planImport(s, contactsText, CONTACT_MAPPING, TYPEFORM_CONTACT_OPTIONS)
  if ('error' in planned) throw new OperatorError(`PLAN_${planned.error.code}`)
  const outcomeByKey = new Map<string, string>()
  for (const row of planned.plan.rows) {
    const k = row.email ? emailKey(row.email)?.matchKey : null
    if (k) outcomeByKey.set(k, row.outcome)
  }
  // A request whose contact is not imported (spam rule, invalid) is not imported either.
  for (const q of inquiries) {
    if (q.action !== 'NEW' || !q.emailKey) continue
    const o = outcomeByKey.get(q.emailKey)
    if (o === 'SKIP' || o === 'REJECT') Object.assign(q, { action: 'SKIP', code: o === 'SKIP' ? 'TF_CONTACT_SKIPPED' : 'TF_CONTACT_REJECTED' })
  }
  // Tokens already in the CRM: the same content is UNCHANGED; different content is a CONFLICT (reported, left as is).
  const want = inquiries.filter((q) => q.action === 'NEW').map((q) => q.token)
  for (let i = 0; i < want.length; i += 500) {
    const found = await payload.find({ collection: 'crm-historical-inquiries' as never, where: { typeform_token: { in: want.slice(i, i + 500) } } as never, limit: 500, depth: 0, overrideAccess: true, select: { typeform_token: true, content_sha256: true } as never })
    const have = new Map((found.docs as unknown as Array<{ typeform_token: string; content_sha256: string }>).map((d) => [d.typeform_token, d.content_sha256]))
    for (const q of inquiries) {
      const h = have.get(q.token)
      if (q.action === 'NEW' && h !== undefined) Object.assign(q, h === q.contentSha ? { action: 'UNCHANGED' } : { action: 'CONFLICT', code: 'TF_TOKEN_CONTENT_DIFFERS' })
    }
  }
  for (const q of inquiries) {
    inc(`inquiries${q.action[0]}${q.action.slice(1).toLowerCase()}`)
    if (q.code) inc(q.code)
    for (const f of q.cut) if (q.action === 'NEW') inc(`cut_${f}`)
  }
  counts.rows = csv.rows.length
  counts.uniqueAddresses = latest.size
  const body = {
    fileSha: verifiedSha(bytes),
    rows: csv.rows.length,
    contactsText,
    contactMapping: CONTACT_MAPPING,
    contactPlan: { summary: planned.plan.summary, blocked: planned.plan.blocked, approval: planned.plan.approval, sha256: planned.plan.sha256 },
    inquiries,
    counts,
  }
  return { ...body, approval: planApproval(s.userId, body) }
}
const verifiedSha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/** What a dry run prints: counts, codes and the approval token only. */
export function typeformDryOutput(p: TypeformPlan) {
  return { sha256: p.fileSha, rows: p.rows, contacts: p.contactPlan.summary, inquiries: p.counts, blocked: p.contactPlan.blocked, approval: p.approval }
}

const same = (a: string, b: string | null) => !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export async function applyTypeform(payload: Payload, bytes: Buffer, expectedSha: string, adminEmail: string, approval: string, env: NodeJS.ProcessEnv = process.env, note: string | null = null) {
  const s = await operatorSession(payload, adminEmail)
  const off = await sendingOff(payload, env)
  if (!off.ok) throw new OperatorError(`SENDING_NOT_OFF${off.mode !== 'off' ? '_EMAIL' : ''}${off.engine ? '_ENGINE' : ''}${off.inbound ? '_INBOUND' : ''}`)
  const plan = await planTypeform(payload, bytes, expectedSha, adminEmail)
  if (!same(approval, plan.approval)) throw new OperatorError('STALE_DRY_RUN')
  const before = await reachCounts(payload)
  // PROD-IMPORT-1 N1 parity: the contact batches and their audit say the run came from the operator CLI, with its note
  const contacts = await applyImport(s, plan.contactsText, plan.contactMapping, TYPEFORM_CONTACT_OPTIONS, plan.contactPlan.approval, undefined, { via: 'operator-cli', note })
  if (!contacts.ok) throw new OperatorError(contacts.code)
  if (contacts.stopped) throw new OperatorError(`STOPPED_${contacts.stopped.code}_AT_ROW_${contacts.stopped.fromRow}`)
  // the contact (and its account) of each address, after the contact import
  const keys = [...new Set(plan.inquiries.filter((q) => q.action === 'NEW').map((q) => q.emailKey!))]
  const byKey = new Map<string, { id: string; account: string | null }>()
  for (let i = 0; i < keys.length; i += 500) {
    const found = await payload.find({ collection: 'crm-contacts', where: { email_match_key: { in: keys.slice(i, i + 500) } }, limit: 500, depth: 0, overrideAccess: true, select: { email_match_key: true, account: true } as never })
    for (const d of found.docs as unknown as Array<{ id: string | number; email_match_key: string; account?: string | number | { id: string } | null }>)
      byKey.set(d.email_match_key, { id: String(d.id), account: d.account == null ? null : typeof d.account === 'object' ? String(d.account.id) : String(d.account) })
  }
  const result = { created: 0, unchanged: 0, conflicts: 0, skipped: 0, failed: [] as Array<{ row: number; code: string }> }
  for (const q of plan.inquiries) {
    if (q.action === 'UNCHANGED') result.unchanged++
    if (q.action === 'CONFLICT') result.conflicts++
    if (q.action === 'SKIP') result.skipped++
    if (q.action !== 'NEW') continue
    const contact = byKey.get(q.emailKey!)
    if (!contact) {
      result.failed.push({ row: q.row, code: 'TF_CONTACT_NOT_FOUND' })
      continue
    }
    try {
      await payload.create({
        collection: 'crm-historical-inquiries' as never,
        data: {
          contact: contact.id,
          account: contact.account,
          source: 'TYPEFORM_LEGACY',
          state: 'HISTORICAL_CLOSED_UNKNOWN',
          record_state: 'ACTIVE',
          typeform_token: q.token,
          content_sha256: q.contentSha,
          submitted_at: q.submittedAt,
          submitted_zone: TYPEFORM_ZONE,
          ...q.values,
          cut_fields: q.cut.length ? q.cut : null,
          file_sha256: plan.fileSha,
          import_batch: contacts.batchIds[0] ?? null,
        } as never,
        context: { crmServer: {} },
        depth: 0,
        overrideAccess: true,
      })
      result.created++
    } catch {
      // the UNIQUE token: a concurrent run created it first — re-read and classify, never overwrite
      const again = await payload.find({ collection: 'crm-historical-inquiries' as never, where: { typeform_token: { equals: q.token } } as never, limit: 1, depth: 0, overrideAccess: true, select: { content_sha256: true } as never })
      const h = (again.docs[0] as unknown as { content_sha256?: string } | undefined)?.content_sha256
      if (h === q.contentSha) result.unchanged++
      else if (h) result.conflicts++
      else result.failed.push({ row: q.row, code: 'TF_INQUIRY_WRITE_FAILED' })
    }
  }
  const after = await reachCounts(payload)
  if (after.enrollments !== before.enrollments || after.outbox !== before.outbox) throw new OperatorError('IMPORT_QUEUED_OR_ENROLLED')
  return { sha256: plan.fileSha, contacts: { batchIds: contacts.batchIds, summary: contacts.summary, failed: contacts.failed }, inquiries: result, before, after }
}

/** Undo (archive-only): this file's past requests become ARCHIVED, and the contact batches of this run are undone. */
export async function undoTypeform(payload: Payload, bytes: Buffer, expectedSha: string, adminEmail: string, note: string) {
  const s = await operatorSession(payload, adminEmail)
  const plan = await planTypeform(payload, bytes, expectedSha, adminEmail)
  const res = await payload.update({ collection: 'crm-historical-inquiries' as never, where: { and: [{ file_sha256: { equals: plan.fileSha } }, { record_state: { equals: 'ACTIVE' } }] } as never, data: { record_state: 'ARCHIVED' } as never, depth: 0, overrideAccess: true, context: { crmServer: {} } })
  const contacts = await undoRun(s, { sha: plan.contactPlan.sha256, note })
  if (!contacts.ok) throw new OperatorError(contacts.code)
  return { ok: true as const, inquiriesArchived: (res.docs ?? []).length, contacts: contacts.message }
}
