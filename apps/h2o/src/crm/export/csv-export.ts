import { createHash } from 'node:crypto'
import type { Where } from 'payload'
import { writeCrmAudit } from '../audit'
import { accountsWhere, contactsWhere, contactName, parseAccountsParams, parseContactsParams } from '../workspace/directory'
import { CONTACT_FUNCTION_LABEL, RELATIONSHIP_LABEL, RFQ_STATUS_LABEL, SOURCE_LABEL, MOTION_LABEL, label } from '../workspace/labels'
import { inboxWhere, parseInboxParams, crmUsers, nameMap } from '../workspace/queries'
import { asUser, type CrmSession } from '../workspace/session'
import { countryName } from '../countries'
import { INQUIRY_TYPE_LABEL, type InquiryType } from '../inquiry-type'
import { emailKey } from '../normalize'
import { activeFromLedger, type LedgerRow } from '../suppression'

/**
 * Wave 1 W1-4 export (owner decision 2026-10-05): **admin-only, audited**, of the list the admin is looking at.
 *
 *   - Exactly the list's own filter (the same `where` builders as the screen) and its search term (from the
 *     list-search cookie, never the URL).
 *   - Columns come from a fixed allowlist per list; the admin picks a subset. Contacts and inquiries always carry a
 *     "Do not contact" column, so a suppressed person is marked in every export.
 *   - Spreadsheet formula injection is neutralised: a cell starting with = + - @ TAB or CR is prefixed with '.
 *   - Rows are streamed page by page, never stored on the server.
 *   - CSV-FIX-1 (review R2-09): the matches are counted first. Above the cap the export is refused (and audited), never
 *     cut short; otherwise every match is exported. A run that ends short of the count is recorded as PARTIAL.
 *   - One audit row per export: who, when, which list, a hash of the filter (not the filter or term itself), the
 *     columns, requested and exported row counts and the status (COMPLETE, PARTIAL, FAILED or REFUSED). No values.
 *   - An export is the list on screen with the chosen columns. It is not a backup of the CRM.
 */

export const EXPORT_LISTS = ['contacts', 'accounts', 'inbox'] as const
export type ExportList = (typeof EXPORT_LISTS)[number]
export const MAX_EXPORT_ROWS = 50_000
/** The cap in force: `MAX_EXPORT_ROWS`, or lower when `H2O_EXPORT_MAX_ROWS` says so (it can never raise it). */
export const exportCap = () => {
  const env = Math.floor(Number(process.env.H2O_EXPORT_MAX_ROWS))
  return env > 0 ? Math.min(env, MAX_EXPORT_ROWS) : MAX_EXPORT_ROWS
}
export type ExportStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'REFUSED'

type Doc = Record<string, unknown>
const D = (x: unknown): Doc => x as Doc
const id = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : typeof v === 'object' ? String(D(v).id ?? '') || null : String(v))

export const EXPORT_COLUMNS: Record<ExportList, Array<{ key: string; label: string }>> = {
  contacts: [
    { key: 'name', label: 'Name' },
    { key: 'first_name', label: 'First name' },
    { key: 'last_name', label: 'Last name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'title', label: 'Title' },
    { key: 'function', label: 'Function' },
    { key: 'account', label: 'Account' },
    { key: 'owner', label: 'Owner' },
    { key: 'source', label: 'Source' },
    { key: 'created', label: 'Created' },
  ],
  accounts: [
    { key: 'name', label: 'Account' },
    { key: 'domains', label: 'Domains' },
    { key: 'relationship', label: 'Relationship' },
    { key: 'owner', label: 'Owner' },
    { key: 'industry', label: 'Industry' },
    { key: 'name_from_domain', label: 'Name from domain' },
    { key: 'created', label: 'Created' },
  ],
  inbox: [
    { key: 'rfq_number', label: 'RFQ number' },
    { key: 'received', label: 'Received' },
    { key: 'status', label: 'Status' },
    { key: 'company', label: 'Company' },
    { key: 'contact', label: 'Contact' },
    { key: 'email', label: 'Email' },
    { key: 'owner', label: 'Owner' },
    { key: 'type', label: 'Type' },
    { key: 'country', label: 'Country' },
    { key: 'country_source', label: 'Country source' },
    { key: 'motion', label: 'Motion' },
    { key: 'source', label: 'Source' },
  ],
}

/** The column every contact/inquiry export carries, whatever was picked. */
const DNC = { key: 'do_not_contact', label: 'Do not contact' }

/** Neutralise spreadsheet formulas, then quote for CSV. */
export function csvCell(v: unknown): string {
  let t = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
export const csvLine = (cells: unknown[]) => `${cells.map(csvCell).join(',')}\r\n`

/** Validated columns for a list, in allowlist order; unknown keys are dropped; none → all. */
export function pickColumns(list: ExportList, raw: string | null): Array<{ key: string; label: string }> {
  const wanted = new Set((raw ?? '').split(',').map((x) => x.trim()).filter(Boolean))
  const cols = EXPORT_COLUMNS[list].filter((c) => wanted.size === 0 || wanted.has(c.key))
  return list === 'accounts' ? cols : [...cols, DNC]
}

export function exportWhere(s: CrmSession, list: ExportList, sp: Record<string, string | string[] | undefined>, term: string | null): Promise<Where> | Where {
  if (list === 'accounts') return accountsWhere(s, parseAccountsParams(sp), term)
  if (list === 'contacts') return contactsWhere(s, parseContactsParams(sp), term)
  return inboxWhere(s, { ...parseInboxParams(sp), q: term }, new Date())
}

export const filterHash = (list: ExportList, sp: Record<string, string | string[] | undefined>, term: string | null) =>
  createHash('sha256').update(JSON.stringify({ list, sp: Object.entries(sp).filter(([k]) => k !== 'cols').sort(), term })).digest('hex').slice(0, 16)

const COLLECTION: Record<ExportList, 'crm-contacts' | 'crm-accounts' | 'crm-rfqs'> = { contacts: 'crm-contacts', accounts: 'crm-accounts', inbox: 'crm-rfqs' }
/** A byte-order mark so spreadsheet apps read the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff)
const SORT: Record<ExportList, string> = { contacts: 'display_name', accounts: 'canonical_name', inbox: '-received_at' }

/**
 * CSV-FIX-1 (review R2-09): active do-not-contact per match key, reading every ledger row for the page's keys (not a
 * fixed first page of them), so the "Do not contact" column is right for every exported row.
 */
async function activeSuppressions(s: CrmSession, keys: string[]): Promise<Map<string, LedgerRow[]>> {
  const out = new Map<string, LedgerRow[]>()
  if (keys.length === 0) return out
  const res = await s.payload.find({ collection: 'crm-suppressions', where: { email_match_key: { in: keys } }, depth: 0, pagination: false, ...asUser(s) })
  const grouped = new Map<string, LedgerRow[]>()
  for (const r of res.docs as unknown as Array<LedgerRow & { email_match_key: string }>) grouped.set(r.email_match_key, [...(grouped.get(r.email_match_key) ?? []), r])
  for (const [k, rows] of grouped) out.set(k, activeFromLedger(rows))
  return out
}

export type PreparedExport = { where: Where; requested: number; allowed: number }

/** CSV-FIX-1 (review R2-09): the list's filter and how many rows match it, before anything is downloaded. */
export async function prepareExport(s: CrmSession, list: ExportList, sp: Record<string, string | string[] | undefined>, term: string | null): Promise<PreparedExport> {
  if (!s.isAdmin) throw new Error('FORBIDDEN')
  const where = await exportWhere(s, list, sp, term)
  const requested = (await s.payload.count({ collection: COLLECTION[list], where, ...asUser(s) })).totalDocs
  return { where, requested, allowed: exportCap() }
}

const auditExport = (
  s: CrmSession,
  list: ExportList,
  sp: Record<string, string | string[] | undefined>,
  term: string | null,
  columns: Array<{ key: string; label: string }>,
  r: { requested: number; exported: number; allowed: number; status: ExportStatus },
) =>
  writeCrmAudit({ payload: s.payload, user: s.user } as never, {
    action: 'export',
    collection: COLLECTION[list],
    docId: `export:${list}`,
    changedKeys: columns.map((c) => c.key),
    detail: {
      event: 'EXPORT',
      list,
      filterHash: filterHash(list, sp, term),
      searchApplied: Boolean(term),
      columns: columns.map((c) => c.key),
      requested: r.requested,
      rowCount: r.exported,
      allowed: r.allowed,
      status: r.status,
      complete: r.status === 'COMPLETE',
    },
  })

/** The words shown (and returned by the route) when a list is over the cap. */
export const overCapMessage = (requested: number, allowed: number) =>
  `This list has ${requested.toLocaleString('en-US')} rows. An export can hold at most ${allowed.toLocaleString('en-US')}. Narrow the filters or search, then export in parts.`

/** CSV-FIX-1 (review R2-09): an over-cap request is refused before any row is read, and the refusal is audited. */
export async function refuseExport(s: CrmSession, list: ExportList, sp: Record<string, string | string[] | undefined>, term: string | null, columns: Array<{ key: string; label: string }>, prep: PreparedExport) {
  await auditExport(s, list, sp, term, columns, { requested: prep.requested, exported: 0, allowed: prep.allowed, status: 'REFUSED' })
  return { ok: false as const, code: 'TOO_MANY_ROWS', requested: prep.requested, allowed: prep.allowed, message: overCapMessage(prep.requested, prep.allowed) }
}

/**
 * Stream an export as CSV text chunks. Admin only (the caller also checks). Writes the audit row at the end (or
 * when the stream is cancelled or fails, marked PARTIAL or FAILED). CSV-FIX-1 (review R2-09): the caller passes the
 * prepared count; a list over the cap is refused here too. A run that stops at the cap with rows left, or ends with
 * fewer rows than were counted, is PARTIAL, never complete.
 */
export async function* exportRows(
  s: CrmSession,
  list: ExportList,
  sp: Record<string, string | string[] | undefined>,
  term: string | null,
  columns: Array<{ key: string; label: string }>,
  prepared?: PreparedExport,
): AsyncGenerator<string> {
  if (!s.isAdmin) throw new Error('FORBIDDEN')
  const prep = prepared ?? (await prepareExport(s, list, sp, term))
  if (prep.requested > prep.allowed) {
    await refuseExport(s, list, sp, term, columns, prep)
    throw new Error('TOO_MANY_ROWS')
  }
  const { where, allowed } = prep
  const names = nameMap(await crmUsers(s))
  let rows = 0
  // PARTIAL until the run proves otherwise: a download cancelled mid-stream ends here without reaching either branch.
  const run: { status: ExportStatus } = { status: 'PARTIAL' }
  let more = false
  try {
    yield `${BOM}${csvLine(columns.map((c) => c.label))}`
    for (let page = 1; rows < allowed; page++) {
      const res = await s.payload.find({ collection: COLLECTION[list], where, sort: SORT[list], depth: 0, limit: 200, page, ...asUser(s) })
      const docs = res.docs as unknown as Doc[]
      if (docs.length === 0) break
      // Lookups for this page: account names, contacts (for inquiries), suppressions.
      const accIds = [...new Set(docs.map((d) => id(d.account)).filter(Boolean))] as string[]
      const conIds = list === 'inbox' ? ([...new Set(docs.map((d) => id(d.contact)).filter(Boolean))] as string[]) : []
      const [accs, cons] = await Promise.all([
        accIds.length ? s.payload.find({ collection: 'crm-accounts', where: { id: { in: accIds } }, depth: 0, limit: accIds.length, ...asUser(s) }) : null,
        conIds.length ? s.payload.find({ collection: 'crm-contacts', where: { id: { in: conIds } }, depth: 0, limit: conIds.length, ...asUser(s) }) : null,
      ])
      const accName = new Map((accs?.docs ?? []).map((a) => [String(a.id), String(D(a).canonical_name ?? '')]))
      const conById = new Map((cons?.docs ?? []).map((c) => [String(c.id), c as unknown as Doc]))
      // CSV-FIX-1 (review R2-09): an inquiry without a linked contact uses the submitted address's match key (as the
      // ledger does), so its "Do not contact" mark is not missed.
      const keyOf = (d: Doc): string | undefined =>
        list === 'contacts'
          ? (d.email_match_key as string)
          : ((conById.get(String(id(d.contact)))?.email_match_key as string) ?? emailKey(D(d.submitted).email)?.matchKey)
      const dnc = list === 'accounts' ? new Map<string, LedgerRow[]>() : await activeSuppressions(s, [...new Set(docs.map(keyOf).filter(Boolean))] as string[])
      let out = ''
      for (const [i, d] of docs.entries()) {
        const owner = id(d.owner ?? d.assignee)
        const value = (key: string): unknown => {
          switch (`${list}:${key}`) {
            case 'contacts:name': return contactName(d)
            case 'contacts:first_name': return d.first_name
            case 'contacts:last_name': return d.last_name
            case 'contacts:email': return d.email
            case 'contacts:phone': return ((d.phones as Doc[] | undefined) ?? []).map((p) => p.number_raw).join('; ')
            case 'contacts:title': return d.title
            case 'contacts:function': return label(CONTACT_FUNCTION_LABEL, d.contact_function)
            case 'contacts:account': return accName.get(String(id(d.account))) ?? ''
            case 'contacts:source':
            case 'accounts:source': return label(SOURCE_LABEL, D(d.provenance).source_system)
            case 'contacts:created':
            case 'accounts:created': return String(d.createdAt ?? '').slice(0, 10)
            case 'accounts:name': return d.canonical_name
            case 'accounts:domains': return ((d.domains as Doc[] | undefined) ?? []).map((x) => x.domain).join('; ')
            case 'accounts:relationship': return label(RELATIONSHIP_LABEL, d.relationship_state)
            case 'accounts:industry': return d.industry
            case 'accounts:name_from_domain': return d.name_from_domain ? 'Yes' : ''
            case 'inbox:rfq_number': return d.rfq_number
            case 'inbox:received': return String(d.received_at ?? '').slice(0, 16).replace('T', ' ')
            case 'inbox:status': return RFQ_STATUS_LABEL[String(d.status)]?.label ?? 'Unknown'
            case 'inbox:company': return accName.get(String(id(d.account))) ?? D(d.submitted).company
            case 'inbox:contact': {
              const c = conById.get(String(id(d.contact)))
              return c ? contactName(c) : [D(d.submitted).first_name, D(d.submitted).last_name].filter(Boolean).join(' ')
            }
            case 'inbox:email': return conById.get(String(id(d.contact)))?.email ?? D(d.submitted).email
            case 'inbox:motion': return d.motion ? MOTION_LABEL[String(d.motion)] : ''
            case 'inbox:type': return INQUIRY_TYPE_LABEL[String(d.inquiry_type ?? 'UNKNOWN') as InquiryType] ?? ''
            case 'inbox:country': return d.country_code ? (countryName(String(d.country_code)) ?? d.country_code) : 'Unknown'
            case 'inbox:country_source': return String(d.country_source ?? 'UNKNOWN').replaceAll('_', ' ').toLowerCase()
            case 'inbox:source': return label(SOURCE_LABEL, d.source_system)
            default:
              if (key === 'owner') return owner ? (names.get(owner) ?? 'CRM user') : ''
              if (key === 'do_not_contact') {
                const k = keyOf(d)
                return k && (dnc.get(k)?.length ?? 0) > 0 ? 'Do not contact' : ''
              }
              return ''
          }
        }
        out += csvLine(columns.map((c) => value(c.key)))
        rows++
        if (rows >= allowed) {
          more = i < docs.length - 1 || res.hasNextPage
          break
        }
      }
      yield out
      if (!res.hasNextPage || more) break
    }
    run.status = more || rows < prep.requested ? 'PARTIAL' : 'COMPLETE'
  } catch (err) {
    run.status = 'FAILED'
    throw err
  } finally {
    await auditExport(s, list, sp, term, columns, { requested: prep.requested, exported: rows, allowed, status: run.status })
  }
}
