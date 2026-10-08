/**
 * Wave 1 W1-3 CSV reading — pure and shared by the browser (column mapping) and the server (dry run, apply).
 *
 * RFC 4180: comma-separated, `"`-quoted fields with `""` escapes, embedded commas and line breaks inside quotes,
 * CRLF or LF rows. A UTF-8 byte-order mark is stripped. Limits are enforced here so neither side can be handed an
 * oversized file: 5 MB of text, 20,000 data rows per file (written as batches of at most 2,000 rows, each undoable on
 * its own), 60 columns. CSV-FIX-1 (review R2-08): a cell longer than 2,000 characters is kept whole and listed in
 * `longCells`; the import plan reports it and only an explicit choice cuts it (never a silent slice here).
 */

export const MAX_BYTES = 5 * 1024 * 1024
/** PROD-IMPORT-1 N3: a cell's length in Unicode code points (as Postgres counts characters), not UTF-16 units. */
const cpLength = (s: string): number => {
  let n = 0
  for (const _ of s) n++
  return n
}
export const MAX_ROWS = 20000
/** Rows per applied batch (audit D1: import in batches of ≤ 2,000). */
export const BATCH_ROWS = 2000
export const MAX_COLUMNS = 60
export const MAX_CELL = 2000

/** A data cell longer than `MAX_CELL` (row is 1-based, as in the import plan; column is zero-based). */
export type LongCell = { row: number; column: number; length: number }

export type CsvResult =
  | { ok: true; header: string[]; rows: string[][]; longCells: LongCell[] }
  | { ok: false; code: 'TOO_LARGE' | 'EMPTY' | 'NO_HEADER' | 'TOO_MANY_ROWS' | 'TOO_MANY_COLUMNS' | 'UNTERMINATED_QUOTE' | 'NOT_TEXT'; message: string }

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function parseCsv(input: string): CsvResult {
  if (typeof input !== 'string') return { ok: false, code: 'NOT_TEXT', message: 'The file could not be read as text.' }
  if (byteLength(input) > MAX_BYTES) return { ok: false, code: 'TOO_LARGE', message: 'The file is larger than 5 MB. Split it and import it in parts.' }
  // A NUL byte means a binary file (e.g. an XLSX saved with a .csv name), not UTF-8 text.
  if (input.includes('\u0000')) return { ok: false, code: 'NOT_TEXT', message: 'This is not a UTF-8 CSV file. Save it as "CSV UTF-8" and try again.' }
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    pushCell()
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
    row = []
  }
  while (i < text.length) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') {
      quoted = true
      i++
    } else if (ch === ',') {
      pushCell()
      i++
    } else if (ch === '\r' || ch === '\n') {
      pushRow()
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1
      if (rows.length > MAX_ROWS + 1) return { ok: false, code: 'TOO_MANY_ROWS', message: `A file can hold at most ${MAX_ROWS} rows. Split it and import it in parts.` }
    } else {
      cell += ch
      i++
    }
  }
  if (quoted) return { ok: false, code: 'UNTERMINATED_QUOTE', message: 'A quoted value is never closed. Check the file was saved as CSV.' }
  if (cell !== '' || row.length) pushRow()
  if (rows.length === 0) return { ok: false, code: 'EMPTY', message: 'The file is empty.' }
  const header = rows[0]!.map((h) => h.replace(/\s+/g, ' ').trim())
  if (header.every((h) => h === '')) return { ok: false, code: 'NO_HEADER', message: 'The first row must name the columns.' }
  if (header.length > MAX_COLUMNS) return { ok: false, code: 'TOO_MANY_COLUMNS', message: `The file has more than ${MAX_COLUMNS} columns.` }
  const data = rows.slice(1)
  if (data.length > MAX_ROWS) return { ok: false, code: 'TOO_MANY_ROWS', message: `A file can hold at most ${MAX_ROWS} rows. Split it and import it in parts.` }
  const longCells: LongCell[] = []
  data.forEach((r, i) => r.forEach((c, column) => c.length > MAX_CELL && cpLength(c) > MAX_CELL && longCells.push({ row: i + 1, column, length: cpLength(c) })))
  return { ok: true, header, rows: data, longCells }
}

/**
 * Import fields (audit D2 allowlist). Anything not listed cannot be mapped. `do_not_contact` is a suppression
 * instruction, not a contact field; `notes` becomes a note on the contact.
 */
export const IMPORT_FIELDS = [
  'email',
  'first_name',
  'last_name',
  'full_name',
  'phone',
  'mobile_phone',
  'title',
  'company',
  'website',
  'country',
  'owner',
  'notes',
  'source_ref',
  'do_not_contact',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  email: 'Email (required)',
  first_name: 'First name',
  last_name: 'Last name',
  full_name: 'Full name (split into first/last)',
  phone: 'Phone (primary)',
  mobile_phone: 'Mobile phone',
  title: 'Job title',
  company: 'Company',
  website: 'Company website / domain',
  country: 'Country (2-letter code)',
  owner: 'Owner (CRM user email or name)',
  notes: 'Notes',
  source_ref: 'Source reference (id in the old system)',
  do_not_contact: 'Do not contact (yes/no)',
}

/** Mapping: target field → zero-based column index. */
export type Mapping = Partial<Record<ImportField, number>>

const GUESS: Array<[ImportField, RegExp]> = [
  ['email', /^e-?mail( address)?$/i],
  ['first_name', /^first( ?name)?$|^given ?name$/i],
  ['last_name', /^last( ?name)?$|^surname$|^family ?name$/i],
  ['full_name', /^(full ?)?name$|^contact( name)?$/i],
  ['mobile_phone', /mobile|cell/i],
  ['phone', /^(primary |work |office |main )?_?phone|^tel/i],
  ['title', /^(job )?title$|^position$|^role$/i],
  ['company', /^company( name)?$|^organi[sz]ation$|^account( name)?$/i],
  ['website', /website|domain|url/i],
  ['country', /^country( code)?$/i],
  ['owner', /^owner$|^(account|sales) ?(owner|rep)$/i],
  ['notes', /^notes?$|^comments?$/i],
  ['source_ref', /^(legacy |source |old |record )?id$|^source ?ref/i],
  ['do_not_contact', /do ?not ?contact|dnc|opt.?out|unsubscribed/i],
]

/** Suggest a mapping from header names (each column and each field used at most once). */
export function guessMapping(header: string[]): Mapping {
  const out: Mapping = {}
  const used = new Set<number>()
  for (const [field, re] of GUESS)
    header.forEach((h, i) => {
      if (out[field] === undefined && !used.has(i) && re.test(h.replace(/[_-]+/g, ' ').trim())) {
        out[field] = i
        used.add(i)
      }
    })
  return out
}

/** Validate a mapping from the client: known fields, in-range distinct columns, and an email column. */
export function validateMapping(raw: unknown, columns: number): { ok: true; mapping: Mapping } | { ok: false; message: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Map the columns first.' }
  const out: Mapping = {}
  const used = new Set<number>()
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(IMPORT_FIELDS as readonly string[]).includes(k)) return { ok: false, message: 'The mapping names a field that cannot be imported.' }
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n >= columns) return { ok: false, message: 'The mapping points at a column the file does not have.' }
    if (used.has(n)) return { ok: false, message: 'Each column can be mapped to one field only.' }
    used.add(n)
    out[k as ImportField] = n
  }
  if (out.email === undefined) return { ok: false, message: 'Map a column to Email: it is how contacts are matched.' }
  if (out.full_name !== undefined && (out.first_name !== undefined || out.last_name !== undefined))
    return { ok: false, message: 'Map either Full name or First/Last name, not both.' }
  return { ok: true, mapping: out }
}

/**
 * Placeholder values exports use for "nothing" ("NA", "N/A", "none", "-", "0"…). They are treated as empty, never
 * stored as data (profiling the legacy file found "no" in 26,492 phone cells and 12,428 company cells).
 */
const PLACEHOLDER = /^(n\/?a|na|no|none|null|nil|unknown|tbd|-+|\.|0+|not applicable|n\.a\.)$/i
export const isPlaceholder = (v: string | null | undefined): boolean => typeof v === 'string' && PLACEHOLDER.test(v.trim())

/** Name suffixes that belong with the last name ("Smith Jr", "Lee PE"). */
const SUFFIX = /^(jr|sr|ii|iii|iv|v|pe|p\.e|phd|ph\.d|md|esq|cpa)\.?$/i
/** CJK, Thai and other scripts written without spaces between given and family name: never split. */
const NO_SPLIT_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u

export type NameSplit = { first: string | null; last: string | null; how: 'SPLIT' | 'SPLIT_SUFFIX' | 'SINGLE_WORD' | 'SCRIPT_NOT_SPLIT' | 'COMMA' | 'EMPTY' }

/**
 * Split a full name held in one column (CT conditions, 2026-10-05): the last word becomes the last name, with a
 * trailing suffix kept with it ("John A Smith Jr" → "John A" / "Smith Jr"); a single word stays a first name; names
 * in CJK or Thai script are never split; "Last, First" splits at the comma.
 */
export function splitName(full: string | null): NameSplit {
  const t = (full ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return { first: null, last: null, how: 'EMPTY' }
  if (NO_SPLIT_SCRIPT.test(t)) return { first: t, last: null, how: 'SCRIPT_NOT_SPLIT' }
  if (t.includes(',')) {
    const [last, first] = t.split(',', 2).map((x) => x.trim())
    if (first && last && !SUFFIX.test(first)) return { first, last, how: 'COMMA' }
  }
  const parts = t.split(' ')
  if (parts.length === 1) return { first: parts[0]!, last: null, how: 'SINGLE_WORD' }
  let cut = parts.length - 1
  if (SUFFIX.test(parts[cut]!.replace(/,$/, '')) && cut >= 2) cut--
  if (cut === 0) return { first: t, last: null, how: 'SINGLE_WORD' }
  const last = parts.slice(cut).join(' ').replace(/,(?=\s)/, '')
  return { first: parts.slice(0, cut).join(' '), last, how: cut < parts.length - 1 ? 'SPLIT_SUFFIX' : 'SPLIT' }
}

export type PhoneResult = { kind: 'E164'; value: string } | { kind: 'DROPPED'; why: string }

/**
 * Phone normalisation (CT ruling 2026-10-05, §8.4 — narrow): stored only as E.164.
 *   - "+…" with 8–15 digits → "+digits" (an extension is kept as " ext N");
 *   - exactly 11 digits starting with 1, or exactly 10 digits whose area code and exchange both start with 2–9
 *     (a valid North American number) → "+1…" (the file has no country column; ICS is a US business);
 *   - spreadsheet scientific notation ("9.17E+11") has lost digits: dropped, never reconstructed;
 *   - anything else is dropped and counted.
 */
export function normalizePhone(raw: string): PhoneResult {
  // CSV-FIX-1 (review R2-08): an export protects "+…" from spreadsheet formulas as "'+…"; one leading apostrophe
  // before a phone character is that protection, not part of the number, so an exported phone re-imports.
  const v = raw.trim().replace(/^'(?=[+\d(])/, '')
  if (/^\d(\.\d+)?e\+?\d+$/i.test(v)) return { kind: 'DROPPED', why: 'spreadsheet scientific notation, digits lost' }
  if (!/^[+\d\s().-]+((\s*(ext\.?|x)\s*)\d{1,6})?$/i.test(v)) return { kind: 'DROPPED', why: 'not a phone number' }
  const ext = v.match(/(?:\s*(?:ext\.?|x)\s*)(\d{1,6})$/i)?.[1]
  const main = v.replace(/(\s*(ext\.?|x)\s*)\d{1,6}$/i, '')
  const digits = main.replace(/\D/g, '')
  const tail = ext ? ` ext ${ext}` : ''
  if (main.trim().startsWith('+')) {
    if (digits.length >= 8 && digits.length <= 15) return { kind: 'E164', value: `+${digits}${tail}` }
    return { kind: 'DROPPED', why: 'wrong number of digits' }
  }
  if (/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return { kind: 'E164', value: `+1${digits}${tail}` }
  if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return { kind: 'E164', value: `+${digits}${tail}` }
  return { kind: 'DROPPED', why: 'no country code and not a valid North American number' }
}

/**
 * E1.3 R1 AR-007: generic/shared inboxes ("info@", "sales@", "purchasing@"…) are not a named person. An import loads
 * them but opens an identity review and does not link them to an account. Trailing digits are ignored ("sales2@").
 */
const GENERIC_LOCAL = /^(info|sales|admin|office|contact|contacts|purchasing|procurement|purchase|buyer|buying|accounts|accounting|ap|ar|billing|invoices?|support|service|services|hr|maintenance|engineering|orders?|enquir(y|ies)|inquir(y|ies)|hello|team|webmaster|noreply|no-reply|plant|operations|ops|reception|mail|marketing|customerservice|customer\.service|helpdesk|it|quotes?|rfq|projects?|general)$/i
export const isGenericInbox = (email: string | null | undefined): boolean => {
  const local = (email ?? '').split('@')[0] ?? ''
  return GENERIC_LOCAL.test(local.replace(/[0-9]+$/, ''))
}
