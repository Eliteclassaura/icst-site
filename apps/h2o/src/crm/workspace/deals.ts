import type { Payload, Where } from 'payload'
import { isUniqueViolation } from '../activity'
import { ensureDealStages, type StageConfig } from '../dealStages'
import { crmUsers, nameMap } from './queries'
import { MOTION_LABEL } from './labels'
import { asUser, viewerCalendar, type CrmSession } from './session'
import { withRowLock } from './serialize'
import { businessDate, endOfLocalDate, quickDueDates, type BusinessCalendar } from './time'
import { isoDate, line, oneOf, relationshipId, type FieldErrors } from './validate'
import { CURRENCY_DIGITS, isCurrency } from '../currencies'
import { OFFICES, OFFICE_TIME_ZONE, officeCalendar, type Office } from '../offices'
import { officeSettings } from '../officeSettings'

/**
 * OPP-1 deals. A deal is a `crm-opportunities` record made from a qualified inquiry. Qualifying creates it once
 * (`qualify_key` is unique and the whole step runs under the inquiry's row lock), and every change afterwards is a
 * workspace write made as the user, so collection access and the opportunity hooks (stage reason, economics, audit)
 * stay the authority. Nothing here sends email or creates a send path.
 */

type Doc = Record<string, unknown>
const D = (x: unknown): Doc => x as Doc
const relId = (v: unknown): string | null => (v ? String(typeof v === 'object' ? D(v).id : v) : null)

export type DealOutcome =
  | { ok: true; message: string; id?: string }
  | { ok: false; code: string; message: string; fields?: FieldErrors }
const fail = (code: string, message: string, fields?: FieldErrors): DealOutcome => ({ ok: false, code, message, ...(fields ? { fields } : {}) })

/** What a deal's calendar dates mean: the deal's office zone (US = Denver, TH = Bangkok); a deal with no office uses the viewer's. */
export const dealZone = (office: unknown, fallback: string): string => (OFFICES.includes(office as Office) ? OFFICE_TIME_ZONE[office as Office] : fallback)
/**
 * The business calendar a deal's dates are read in (DATE-FIX-1): the deal's (or inquiry's) office zone with that office's
 * holidays. A record with no office falls back to the viewer's calendar, the same zone `dealZone` uses for it. Every deal
 * date default and quick control, on the page and on the server, comes from here and never from the viewer's own calendar.
 */
export async function dealCalendar(s: CrmSession, office: unknown): Promise<BusinessCalendar> {
  if (!OFFICES.includes(office as Office)) return viewerCalendar(s)
  return officeCalendar(office, await officeSettings(s.payload))
}

const ZONE_LABEL: Record<string, string> = { 'America/Denver': 'Denver time', 'Asia/Bangkok': 'Bangkok time' }
export const zoneLabel = (zone: string): string => ZONE_LABEL[zone] ?? zone.replace(/_/g, ' ')

/**
 * Value fields from a form. Blank means "not entered" (unknown, never zero). An amount needs a currency from the
 * ISO 4217 list, and has exactly the currency's own number of decimals at most (whole yen, cents, three-decimal
 * dinars): it is refused, never silently rounded. A genuine zero must be confirmed with the explicit box.
 */
export function dealValue(amount: unknown, currency: unknown, isZero: unknown = false): { ok: true; data: Doc } | { ok: false; fields: FieldErrors } {
  const raw = typeof amount === 'number' ? String(amount) : typeof amount === 'string' ? amount.trim() : ''
  const cur = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  const zero = isZero === true || isZero === 'on' || isZero === 'true' || isZero === '1'
  const fields: FieldErrors = {}
  let value: number | null = null
  if (raw) {
    const plain = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, '') : raw
    if (!/^\d+(\.\d+)?$/.test(plain) || plain.replace(/\.\d+$/, '').length > 11) fields.amount = 'Enter the amount as a number, for example 12500.50, or leave it blank if it is not known yet.'
    else value = Number(plain)
  }
  if (value !== null && !fields.amount) {
    if (value === 0 && !zero) fields.amount = 'A value of zero must be confirmed with the box below. Leave it blank if the value is not known.'
    else if (value > 0 && zero) fields.amount = 'The zero box is ticked, so the value must be blank or 0.'
  }
  if (zero && value === null) value = 0
  const known = value !== null && !fields.amount
  if (!known && !fields.amount && cur) fields.currency = 'Enter an amount to go with the currency, or clear the currency.'
  if (known) {
    if (!isCurrency(cur)) fields.currency = 'Choose a valid ISO currency code, such as USD or THB.'
    else {
      const digits = CURRENCY_DIGITS[cur]!
      const decimals = (raw.split('.')[1] ?? '').length
      if (decimals > digits) fields.amount = digits === 0 ? `${cur} has no decimals. Enter a whole amount.` : `${cur} has ${digits} decimal places at most.`
    }
  }
  if (Object.keys(fields).length) return { ok: false, fields }
  if (known) return { ok: true, data: { amount: value, amount_status: 'KNOWN', currency: cur, source_record_explicit_zero: value === 0 } }
  return { ok: true, data: { amount: null, amount_status: 'NOT_ENTERED', currency: null, source_record_explicit_zero: false } }
}

/** A due date (yyyy-mm-dd) is the end of that calendar day in `zone`, the deal's business zone. */
export function dueOf(v: unknown, zone: string): string | null {
  const d = isoDate(v)
  return d ? (endOfLocalDate(d, zone)?.toISOString() ?? null) : null
}

// ─────────────────────────────────────────────────────────────── stages

export type { StageConfig }
export { ensureDealStages }

/** Stage keys a person may move a deal into: enabled stages (the deal's current stage is always allowed). */
export const selectableStages = (stages: StageConfig[], current?: string | null) => stages.filter((x) => x.enabled || x.key === current)

/** Where a freshly qualified deal starts: QUALIFIED when enabled, else the first enabled open stage. */
export const startStage = (stages: StageConfig[]): string | null =>
  stages.find((x) => x.key === 'QUALIFIED' && x.enabled && !x.terminal)?.key ?? stages.find((x) => x.enabled && !x.terminal)?.key ?? null

// ─────────────────────────────────────────────────────────────── qualify → deal

export type QualifyInput = {
  rfqId: unknown
  motion: unknown
  expectedUpdatedAt?: unknown
  ownerId?: unknown
  stage?: unknown
  amount?: unknown
  currency?: unknown
  expectedClose?: unknown
  nextStep?: unknown
  nextDue?: unknown
  amountIsZero?: unknown
}

const MOTIONS = ['NEW_TOWER', 'REBUILD_REPLACEMENT', 'REPAIR', 'UPGRADE_RETROFIT', 'MAINTENANCE_INSPECTION', 'PARTS', 'OTHER_APPROVED'] as const
export const DEFAULT_NEXT_STEP = 'Contact the customer about this inquiry'

/**
 * Qualify an inquiry and create its one deal, in one transaction. Idempotent: qualifying again (a second click, a
 * second tab, a retry) returns the existing deal and creates nothing. The inquiry must be in review with an account.
 */
export async function qualifyWithDeal(s: CrmSession, input: QualifyInput, defaults: { now?: Date } = {}): Promise<DealOutcome> {
  const motion = oneOf(input.motion, MOTIONS)
  const rid = relationshipId(input.rfqId)
  if (!rid.ok || !rid.id) return fail('INVALID_ID', 'That record reference is not valid.')
  const fields: FieldErrors = {}
  if (!motion) fields.motion = 'Choose the commercial motion.'
  const stages = await ensureDealStages(s.payload)
  const stage = input.stage === undefined || input.stage === '' ? startStage(stages) : (stages.find((x) => x.key === input.stage && x.enabled && !x.terminal)?.key ?? null)
  if (!stage) fields.stage = 'Choose an open stage.'
  const people = await crmUsers(s)
  const ownerRaw = input.ownerId === undefined || input.ownerId === '' ? null : relationshipId(input.ownerId)
  if (ownerRaw && (!ownerRaw.ok || !ownerRaw.id || !people.some((p) => p.id === ownerRaw.id))) fields.ownerId = 'Choose a CRM user as the owner.'
  const value = dealValue(input.amount, input.currency, input.amountIsZero)
  if (!value.ok) Object.assign(fields, value.fields)
  const closeRaw = input.expectedClose
  const close = closeRaw === undefined || closeRaw === '' ? null : isoDate(closeRaw)
  if (closeRaw !== undefined && closeRaw !== '' && !close) fields.expectedClose = 'Choose a valid date.'
  const nextStep = input.nextStep === undefined || input.nextStep === '' ? DEFAULT_NEXT_STEP : line(input.nextStep, 160)
  if (!nextStep) fields.nextStep = 'Say what happens next.'
  // The due date is a calendar date; it becomes the end of that day in the deal's own business zone once the inquiry's office is known.
  const dueDate = input.nextDue === undefined || input.nextDue === '' ? null : isoDate(input.nextDue)
  if (input.nextDue !== undefined && input.nextDue !== '' && !dueDate) fields.nextDue = 'Choose a valid date.'
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', fields)
  try {
    return await withRowLock(s, 'crm-rfqs', rid.id, async (req) => {
      const opts = { depth: 0, req, ...asUser(s) }
      let rfq: Doc
      try {
        rfq = D(await s.payload.findByID({ collection: 'crm-rfqs', id: rid.id!, ...opts }))
      } catch {
        return fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
      }
      const key = `qualify:${rid.id}`
      const had = await s.payload.find({ collection: 'crm-opportunities', where: { qualify_key: { equals: key } }, limit: 1, ...opts })
      const existing = had.docs[0] ? String(had.docs[0].id) : relId(rfq.opportunity)
      if (existing) return { ok: true, message: 'Already qualified. This is the existing deal.', id: existing } as DealOutcome
      if (typeof input.expectedUpdatedAt === 'string' && input.expectedUpdatedAt && String(rfq.updatedAt) !== input.expectedUpdatedAt)
        return fail('STALE', 'This inquiry changed while you were working. Review the latest version before applying your change.')
      if (String(rfq.status) !== 'IN_REVIEW') return fail('INVALID_TRANSITION', 'Start the review before qualifying.')
      const accountId = relId(rfq.account)
      if (!accountId) return fail('RFQ_QUALIFIED_WITHOUT_ACCOUNT', 'Link an account before qualifying.')
      const account = D(await s.payload.findByID({ collection: 'crm-accounts', id: accountId, ...opts }))
      const ownerId = ownerRaw?.ok && ownerRaw.id ? ownerRaw.id : (relId(rfq.assignee) ?? s.userId)
      // No date given: the next business day of the inquiry's own office, not of the person qualifying it.
      const due = dueOf(dueDate ?? quickDueDates(defaults.now ?? new Date(), await dealCalendar(s, rfq.office)).tomorrow, dealZone(rfq.office, s.timeZone))
      if (!due) return fail('VALIDATION', 'Some values need attention.', { nextDue: 'Choose a valid date.' })
      const deal = await s.payload.create({
        collection: 'crm-opportunities',
        data: {
          name: `${String(account.canonical_name ?? 'Account')} · ${MOTION_LABEL[motion!] ?? motion}`.slice(0, 200),
          account: accountId,
          site: relId(rfq.site),
          motion,
          stage,
          owner: ownerId,
          office: OFFICES.includes(rfq.office as Office) ? rfq.office : null,
          origin_rfq: rid.id,
          next_step: nextStep,
          next_step_due_at: due,
          expected_decision_date: close,
          stage_change_reason: 'Qualified from inquiry',
          ...(value.ok ? value.data : {}),
          // The deal is made by a person, so its provenance stays a manual entry even though the key needs server context.
          provenance: { source_system: 'MANUAL_ENTRY', first_seen_at: new Date().toISOString() },
        } as never,
        context: { crmServer: { qualify_key: key } },
        ...opts,
      })
      await s.payload.update({
        collection: 'crm-rfqs',
        id: rid.id!,
        data: { status: 'QUALIFIED', motion, qualification_state: 'COMPLETE', opportunity: String(deal.id) } as never,
        ...opts,
      })
      return { ok: true, message: 'Qualified. The deal is ready to work.', id: String(deal.id) } as DealOutcome
    })
  } catch (err) {
    // Two requests can both pass the lock only if the lock is bypassed; the unique key is the last line.
    if (isUniqueViolation(err)) {
      const again = await s.payload.find({ collection: 'crm-opportunities', where: { qualify_key: { equals: `qualify:${rid.id}` } }, limit: 1, depth: 0, ...asUser(s) })
      if (again.docs[0]) return { ok: true, message: 'Already qualified. This is the existing deal.', id: String(again.docs[0].id) }
    }
    return mapError(err)
  }
}

function mapError(err: unknown): DealOutcome {
  const e = err as { status?: number; message?: string; data?: { code?: string; errors?: Array<{ path?: string; message?: string }> } }
  if (e?.data?.code) return fail(e.data.code, String(e.message ?? '').replace(/^\[[A-Z_]+\]\s*/, '') || 'The change was refused.')
  if (e?.status === 403) return fail('FORBIDDEN', 'You don’t have permission to make this change.')
  if (e?.status === 404) return fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
  if (Array.isArray(e?.data?.errors) && e.data.errors.length) {
    const fields: FieldErrors = {}
    for (const x of e.data.errors) if (x.path) fields[x.path] = x.message ?? 'Invalid value'
    return fail('VALIDATION', 'Some values need attention.', fields)
  }
  return fail('ERROR', 'The change could not be saved. Nothing was changed.')
}

// ─────────────────────────────────────────────────────────────── edit + stage

class Stale extends Error {}

async function writeDeal(s: CrmSession, dealId: string, expected: unknown, build: (current: Doc) => Doc | DealOutcome): Promise<DealOutcome> {
  // OPP-1.1: an edit must say which version of the deal it was made from, so it can never silently overwrite a newer one.
  if (typeof expected !== 'string' || !expected.trim())
    return fail('EXPECTED_UPDATED_AT_REQUIRED', 'Reload the deal and try again. This change did not say which version of the deal it was made from.')
  try {
    return await withRowLock(s, 'crm-opportunities', dealId, async (req) => {
      const opts = { depth: 0, req, ...asUser(s) }
      const now = D(await s.payload.findByID({ collection: 'crm-opportunities', id: dealId, ...opts }))
      if (String(now.updatedAt) !== expected) throw new Stale()
      const data = build(now)
      if ('ok' in data && (data as DealOutcome).ok === false) return data as DealOutcome
      await s.payload.update({ collection: 'crm-opportunities', id: dealId, data: data as never, ...opts })
      return { ok: true, message: 'Saved.', id: dealId } as DealOutcome
    })
  } catch (err) {
    if (err instanceof Stale) return fail('STALE', 'This deal changed while you were working. Review the latest version before applying your change.')
    return mapError(err)
  }
}

export type EditDealInput = {
  dealId: unknown
  expectedUpdatedAt?: unknown
  ownerId?: unknown
  amount?: unknown
  currency?: unknown
  expectedClose?: unknown
  nextStep?: unknown
  nextDue?: unknown
  amountIsZero?: unknown
}

/** Edit owner, value, expected close and the next action. An open deal always keeps a next action with a date. */
export async function editDeal(s: CrmSession, input: EditDealInput): Promise<DealOutcome> {
  const rid = relationshipId(input.dealId)
  if (!rid.ok || !rid.id) return fail('INVALID_ID', 'That record reference is not valid.')
  const fields: FieldErrors = {}
  const people = await crmUsers(s)
  const owner = relationshipId(input.ownerId)
  if (!owner.ok || !owner.id || !people.some((p) => p.id === owner.id)) fields.ownerId = 'Choose a CRM user as the owner.'
  const value = dealValue(input.amount, input.currency, input.amountIsZero)
  if (!value.ok) Object.assign(fields, value.fields)
  const close = input.expectedClose === undefined || input.expectedClose === '' ? null : isoDate(input.expectedClose)
  if (input.expectedClose !== undefined && input.expectedClose !== '' && !close) fields.expectedClose = 'Choose a valid date.'
  return writeDeal(s, rid.id, input.expectedUpdatedAt, (cur) => {
    const terminal = ['WON', 'LOST', 'CANCELLED'].includes(String(cur.stage))
    // OPP-1.1: a closed deal has no next action. Nothing about it is read, required or invented; only an open deal is held to one.
    const nextStep = terminal ? null : line(input.nextStep, 160)
    const due = terminal ? null : dueOf(input.nextDue, dealZone(cur.office, s.timeZone))
    if (!terminal) {
      if (!nextStep) fields.nextStep = 'An open deal needs a next action.'
      if (!due) fields.nextDue = 'Choose when it is due.'
    }
    if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', fields)
    return {
      owner: owner.ok ? owner.id : null,
      expected_decision_date: close,
      ...(value.ok ? value.data : {}),
      ...(terminal ? {} : { next_step: nextStep, next_step_due_at: due }),
    }
  })
}

/** Move a deal to another stage. A reason is required (the opportunity hook enforces it and audits the move). */
export async function moveDealStage(
  s: CrmSession,
  input: { dealId: unknown; stage: unknown; reason: unknown; expectedUpdatedAt?: unknown; nextStep?: unknown; nextDue?: unknown },
): Promise<DealOutcome> {
  const rid = relationshipId(input.dealId)
  if (!rid.ok || !rid.id) return fail('INVALID_ID', 'That record reference is not valid.')
  const stages = await ensureDealStages(s.payload)
  const reason = line(input.reason, 240)
  const fields: FieldErrors = {}
  const target = stages.find((x) => x.key === input.stage)
  if (!target) fields.stage = 'Choose a stage.'
  if (!reason) fields.reason = 'Say what moved this deal.'
  return writeDeal(s, rid.id, input.expectedUpdatedAt, (cur) => {
    if (target && !target.enabled && target.key !== cur.stage) fields.stage = 'That stage is switched off.'
    if (target && target.key === cur.stage) fields.stage = 'The deal is already in that stage.'
    const data: Doc = { stage: target?.key, stage_change_reason: reason }
    if (target?.terminal) {
      data.next_step = null
      data.next_step_due_at = null
    } else {
      const step = input.nextStep ? line(input.nextStep, 160) : line(cur.next_step, 160)
      const due = input.nextDue ? dueOf(input.nextDue, dealZone(cur.office, s.timeZone)) : cur.next_step_due_at ? String(cur.next_step_due_at) : null
      if (!step) fields.nextStep = 'An open deal needs a next action.'
      if (!due) fields.nextDue = 'Choose when it is due.'
      data.next_step = step
      data.next_step_due_at = due
    }
    if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', fields)
    return data
  })
}

// ─────────────────────────────────────────────────────────────── reads

export type DealRow = {
  id: string
  name: string
  stage: string
  accountId: string | null
  accountName: string | null
  ownerId: string | null
  ownerName: string | null
  office: string | null
  nextStep: string | null
  nextDue: string | null
  /** The due date as a calendar date in the deal's business zone: what a form pre-fills and what a person reads. */
  nextDueDate: string | null
  zone: string
  zoneLabel: string
  overdue: boolean
  expectedClose: string | null
  value: string | null
  originRfqId: string | null
}

export type DealFilter = { owner: 'me' | string | null; stage: string | null; office: Office | null; closed: boolean }

const TERMINAL = ['WON', 'LOST', 'CANCELLED']

function dealWhere(s: CrmSession, f: DealFilter, stageFilter?: string): Where {
  const and: Where[] = []
  if (f.owner === 'me') and.push({ owner: { equals: s.userId } })
  else if (f.owner) and.push({ owner: { equals: f.owner } })
  if (f.office) and.push({ office: { equals: f.office } })
  const stage = stageFilter ?? f.stage
  if (stage) and.push({ stage: { equals: stage } })
  else if (!f.closed) and.push({ stage: { not_in: TERMINAL } })
  return and.length ? { and } : {}
}

async function hydrate(s: CrmSession, docs: Doc[], now: Date): Promise<DealRow[]> {
  const people = nameMap(await crmUsers(s))
  const accIds = [...new Set(docs.map((o) => relId(o.account)).filter(Boolean))] as string[]
  const accs = new Map<string, string>()
  for (let i = 0; i < accIds.length; i += 100) {
    const res = await s.payload.find({ collection: 'crm-accounts', where: { id: { in: accIds.slice(i, i + 100) } }, depth: 0, limit: 100, pagination: false, ...asUser(s) })
    for (const a of res.docs) accs.set(String(a.id), String(D(a).canonical_name ?? ''))
  }
  return docs.map((o) => {
    const due = o.next_step_due_at ? new Date(String(o.next_step_due_at)) : null
    const open = !TERMINAL.includes(String(o.stage))
    const owner = relId(o.owner)
    const zone = dealZone(o.office, s.timeZone)
    const dueOk = open && due && !Number.isNaN(due.getTime())
    return {
      id: String(o.id),
      name: String(o.name ?? ''),
      stage: String(o.stage ?? ''),
      accountId: relId(o.account),
      accountName: accs.get(String(relId(o.account))) ?? null,
      ownerId: owner,
      ownerName: owner ? (people.get(owner) ?? 'CRM user') : null,
      office: (o.office as string) ?? null,
      nextStep: open ? ((o.next_step as string) || null) : null,
      nextDue: dueOk ? due.toISOString() : null,
      nextDueDate: dueOk ? businessDate(due, zone) : null,
      zone,
      zoneLabel: zoneLabel(zone),
      overdue: Boolean(open && due && due < now),
      expectedClose: o.expected_decision_date ? String(o.expected_decision_date).slice(0, 10) : null,
      value: o.amount_status === 'KNOWN' && typeof o.amount_display === 'string' && o.amount_display ? o.amount_display : null,
      originRfqId: relId(o.origin_rfq),
    }
  })
}

export const DEALS_PAGE_SIZE = 25

/** One page of deals. The total always matches the filter; every page is reachable. Overdue next actions first. */
export async function loadDeals(s: CrmSession, f: DealFilter, page: number, now: Date = new Date()) {
  const res = await s.payload.find({
    collection: 'crm-opportunities',
    where: dealWhere(s, f),
    sort: ['next_step_due_at', 'name'] as never,
    page: Math.max(1, page),
    limit: DEALS_PAGE_SIZE,
    depth: 0,
    ...asUser(s),
  })
  return { total: res.totalDocs, pages: res.totalPages, page: res.page ?? 1, rows: await hydrate(s, res.docs as unknown as Doc[], now) }
}

export const BOARD_COLUMN_SIZE = 10

/** Board: every configured stage with its true count; the first cards inline, the rest through the list view. */
export async function loadBoard(s: CrmSession, f: DealFilter, now: Date = new Date()) {
  const stages = (await ensureDealStages(s.payload)).filter((x) => (f.closed || !x.terminal) && (!f.stage || x.key === f.stage))
  return Promise.all(
    stages.map(async (st) => {
      const res = await s.payload.find({
        collection: 'crm-opportunities',
        where: dealWhere(s, f, st.key),
        sort: ['next_step_due_at', 'name'] as never,
        limit: BOARD_COLUMN_SIZE,
        depth: 0,
        ...asUser(s),
      })
      return { stage: st, count: res.totalDocs, rows: await hydrate(s, res.docs as unknown as Doc[], now) }
    }),
  )
}

export type DealDetail = {
  deal: Doc
  row: DealRow
  stages: StageConfig[]
  people: Array<{ id: string; name: string }>
  origin: { id: string; number: string; contactId: string | null; contactName: string | null } | null
  activity: Array<{ id: string; summary: string; at: string; type: string }>
  activityTotal: number
}

export async function loadDeal(s: CrmSession, dealId: string, now: Date = new Date()): Promise<DealDetail | null> {
  const rid = relationshipId(dealId)
  if (!rid.ok || !rid.id) return null
  let deal: Doc
  try {
    deal = D(await s.payload.findByID({ collection: 'crm-opportunities', id: rid.id, depth: 0, ...asUser(s) }))
  } catch {
    return null
  }
  const [row] = await hydrate(s, [deal], now)
  const people = await crmUsers(s)
  const originId = relId(deal.origin_rfq)
  let origin: DealDetail['origin'] = null
  if (originId) {
    try {
      const r = D(await s.payload.findByID({ collection: 'crm-rfqs', id: originId, depth: 0, ...asUser(s) }))
      const cid = relId(r.contact)
      let cname: string | null = null
      if (cid) {
        try {
          const c = D(await s.payload.findByID({ collection: 'crm-contacts', id: cid, depth: 0, ...asUser(s) }))
          cname = String(c.display_name ?? c.full_name ?? c.name ?? '') || null
        } catch {
          cname = null
        }
      }
      origin = { id: originId, number: String(r.rfq_number ?? ''), contactId: cid, contactName: cname }
    } catch {
      origin = null
    }
  }
  const act = await s.payload.find({
    collection: 'crm-activities',
    where: { opportunity: { equals: rid.id } },
    sort: '-occurred_at',
    limit: 30,
    depth: 0,
    ...asUser(s),
  })
  return {
    deal,
    row: row!,
    stages: await ensureDealStages(s.payload),
    people,
    origin,
    activity: (act.docs as unknown as Doc[]).map((a) => ({ id: String(a.id), summary: String(a.summary ?? ''), at: String(a.occurred_at ?? ''), type: String(a.type ?? '') })),
    activityTotal: act.totalDocs,
  }
}

export type { Payload }
