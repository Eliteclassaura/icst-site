/**
 * SHEET-SYNC-1: one RFQ → one sheet row. The columns follow the Typeform sheet the sales team already reads, plus a link.
 * Every cell is text; a cell that would read as a formula to a spreadsheet gets a leading apostrophe.
 */
export const HEADERS = ['email', 'first_name', 'last_name', 'company', 'interest', 'part', 'details', 'urgent', 'upload', 'phone', 'country', 'notes', 'Submitted At (America/Denver)', 'token', 'CRM link'] as const
export const COLUMNS = HEADERS.length
/** The column holding the token (the RFQ number), used to find a row that was already appended. */
export const TOKEN_COLUMN = 'N'
export const TAB_ZONE = 'America/Denver'

/** A leading = + - @ (or a tab / CR, which some programs treat as a lead-in) would be read as a formula: prefix an apostrophe. */
export const neutralise = (v: unknown): string => {
  const s = typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

const fmtDenver = (iso: unknown): string => {
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return ''
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TAB_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

type Doc = Record<string, unknown>
const text = (v: unknown): string => (typeof v === 'string' ? v : '')

export function buildRow(rfq: Doc, crmBase: string): string[] {
  const s = (rfq.submitted ?? {}) as Doc
  const o = (s.other_answers ?? {}) as Doc
  const part = [text(o.parts_part), text(o.parts_model)].filter(Boolean).join(' / ')
  const link = crmBase ? `${crmBase.replace(/\/+$/, '')}/crm/rfqs/${String(rfq.id)}/` : ''
  return [
    text(s.email),
    text(s.first_name),
    text(s.last_name),
    text(s.company),
    text(o.interest),
    part,
    text(s.message),
    text(o.urgent) || text(o.service_timing),
    '',
    text(s.phone),
    text(s.country_code),
    text(o.notes),
    fmtDenver(rfq.received_at ?? rfq.submitted_at),
    text(rfq.rfq_number),
    link,
  ].map(neutralise)
}
