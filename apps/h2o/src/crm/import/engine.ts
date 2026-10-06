import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { freemem } from 'node:os'
import type { Where } from 'payload'
import { writeCrmAudit } from '../audit'
import { openIdentityReview } from '../identity'
import { companyKey, emailKey, isConsumerDomain, nameKey, normalizeWebDomain, registrableLabel } from '../normalize'
import { activeFromLedger, type LedgerRow } from '../suppression'
import { asUser, type CrmSession } from '../workspace/session'
import { line } from '../workspace/validate'
import { VERIFIED_DOMAIN_STATUSES } from '../vocabulary'
import { countryFromEmailDomain, countryFromPhone } from '../countries'
import { addressQualityOf, ownEmailDomains, spamPatternOf, type AddressQuality } from '../address-quality'
import { BATCH_ROWS, isGenericInbox, isPlaceholder, normalizePhone, parseCsv, splitName, validateMapping, type ImportField, type Mapping } from './csv'

/**
 * Wave 1 W1-3 contact import: plan (dry run), apply, undo. Admin-only (checked here and by the route).
 *
 * Owner decisions (2026-10-05): **fill-empty only** — an existing value is never overwritten; uncertain identity goes
 * to identity review; a batch can be undone (archived, never deleted); suppression is honoured; free-mail domains
 * never create or match an account.
 *
 *   - Contacts match on the email match key. Accounts match on a **verified** domain only. A company *name* never
 *     links anything: an equal name, or a domain whose rows disagree on the company, opens an identity review.
 *   - "Accounts from corporate domains" (an explicit option) creates one account per corporate email domain in the
 *     file that matches nothing, named from the file's company hint (else the domain).
 *   - "Owner-attested customers" (an explicit option with a recorded source and basis) records the attestation on the
 *     batch, on each record's provenance and as `relationship_basis = OWNER_ATTESTED_BATCH` (+ batch id). Per E1.3 and
 *     the CT ruling it is not a verification: new accounts are CANDIDATE, contacts keep relationship evidence UNKNOWN.
 *   - The dry run writes nothing. Apply re-plans the same file and refuses unless the plan equals the dry run the
 *     admin approved, then writes in batches of at most 2,000 rows, each its own undoable batch.
 *   - Created records carry `provenance.source_system = LEGACY_IMPORT` and `import_batch_id`; contacts keep
 *     `marketing_eligibility = UNKNOWN` (missing consent is not opt-in, so nothing here makes anyone emailable).
 *   - Nothing here logs a value. Failures are reported by row number and code.
 */

type Doc = Record<string, unknown>
const D = (x: unknown): Doc => x as Doc
const relId = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : typeof v === 'object' ? String(D(v).id ?? '') || null : String(v))

export type ImportOptions = {
  /** Create accounts from corporate email domains that match no existing account. */
  createAccounts: boolean
  /** The owner attests every row is an existing/past customer (needs `source` and `basis`). */
  attested: boolean
  /** Where the file came from, e.g. "email-IQ export 2026-07-14". Recorded on the batch. No personal data. */
  source: string | null
  /** Why the records may be held/treated as customers, e.g. "owner-attested existing customers (2026-10-05)". */
  basis: string | null
}
export const DEFAULT_OPTIONS: ImportOptions = { createAccounts: false, attested: false, source: null, basis: null }
export function parseOptions(raw: unknown): ImportOptions {
  const o = raw && typeof raw === 'object' ? D(raw) : {}
  return {
    createAccounts: o.createAccounts === true,
    attested: o.attested === true,
    source: line(o.source, 160),
    basis: line(o.basis, 240),
  }
}

export type RowOutcome = 'CREATE' | 'FILL' | 'UNCHANGED' | 'REVIEW' | 'SKIP' | 'REJECT'
export type AccountAction = 'LINK_VERIFIED' | 'CREATE_ACCOUNT' | 'LINK_NEW_ACCOUNT' | 'DOMAIN_REVIEW' | 'NAME_REVIEW' | 'SUSPECT_REVIEW' | 'NONE'

export type PlannedRow = {
  row: number // 1-based data row (the header is row 0)
  outcome: RowOutcome
  reasons: string[]
  email: string | null
  contactId: string | null
  fill: string[]
  account: AccountAction
  accountId: string | null
  domain: string | null
  suppress: 'ADD' | 'ALREADY' | 'NONE'
  note: boolean
  /** E1.3 AR-007: a role/shared inbox (identity review, never linked to an account by an import). */
  genericInbox: boolean
  /** CT spot-check ruling: a flagged address loads (fill-empty) but never links an account and is never sequenced. */
  addressQuality: AddressQuality | null
  values: Partial<Record<string, string | null>>
}

export type Summary = {
  rows: number
  create: number
  fill: number
  unchanged: number
  review: number
  skip: number
  reject: number
  linkVerified: number
  accountsCreate: number
  accountsNamedFromDomain: number
  contactsOnNewAccounts: number
  accountReviews: number
  genericInboxReviews: number
  /** Rows flagged by address quality, and spam-pattern domains sent to review (one review each, no task). */
  addressSuspectTypo: number
  addressDisposable: number
  addressSpamPattern: number
  addressInternal: number
  suspectDomainReviews: number
  unlinkedFreeMail: number
  suppressAdd: number
  suppressAlready: number
  notes: number
  phonesNormalised: number
  phonesDropped: number
  countryFromFile: number
  countryPhoneInferred: number
  countryCctldInferred: number
  namesSplit: number
  namesSplitSuffixKept: number
  namesSingleWord: number
  namesScriptNotSplit: number
  placeholdersCleared: number
  warnings: number
  batches: number
}

export type Plan = {
  sha256: string
  columns: number
  mapping: Mapping
  options: ImportOptions
  rows: PlannedRow[]
  summary: Summary
  /** Corporate domain → display name of the account the import will create. */
  newAccounts: Map<string, string>
  /** Domains whose new account is named from the domain (no company in the file). */
  fromDomain: Set<string>
}

const cell = (row: string[], m: Mapping, f: ImportField): string | null => {
  const i = m[f]
  if (i === undefined) return null
  const v = (row[i] ?? '').replace(/\s+/g, (x) => (x.includes('\n') ? x : ' ')).trim()
  return v === '' ? null : v
}
const truthy = (v: string | null) => (v ? /^(y|yes|true|1|x|dnc|do not contact|unsubscribed|opted out)$/i.test(v.trim()) : false)

/** Legal-form words do not make two company names different ("ACME Inc" = "Acme Incorporated"). */
const LEGAL = /\b(inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|plc|lp|llp|gmbh|sa|the|group|holdings)\b/g
/** A company cell that cannot be a company name (an address, a URL, a pasted paragraph) never names or matches an account. */
export const plausibleCompany = (raw: unknown): boolean =>
  typeof raw === 'string' && raw.trim().length <= 120 && !/@|https?:\/\/|[\r\n]/i.test(raw)
export const companyHint = (raw: unknown): string | null =>
  plausibleCompany(raw) ? (companyKey(raw) ?? '').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim() || null : null

/**
 * CT ruling 2026-10-05 §8.2: with no company in the file, an account is named from its domain's registrable label,
 * title-cased ("duke-energy.com" → "Duke Energy"); the full domain stays on the account and the name is flagged.
 */
/** An all-lowercase company value is title-cased ("energy development corporation" → "Energy Development Corporation"). */
export const displayCompany = (raw: string): string =>
  raw === raw.toLowerCase() && /\p{L}/u.test(raw)
    ? raw.replace(/(^|[\s\-/(&])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    : raw

export const nameFromDomain = (domain: string) =>
  registrableLabel(domain)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || domain

export const fileSha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

async function chunks<T>(items: T[], size: number, fn: (part: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size))
}

/** Every account the admin can read, indexed by verified domain, any domain, and company key. */
async function accountIndex(s: CrmSession) {
  const byVerifiedDomain = new Map<string, Array<{ id: string; relationship: string }>>()
  const anyDomain = new Set<string>()
  const byCompanyKey = new Map<string, string[]>()
  let page = 1
  for (;;) {
    const res = await s.payload.find({ collection: 'crm-accounts', where: {}, depth: 0, limit: 500, page, ...asUser(s) })
    for (const a of res.docs as unknown as Doc[]) {
      const id = String(a.id)
      for (const d of (a.domains ?? []) as Doc[]) {
        anyDomain.add(String(d.domain))
        if ((VERIFIED_DOMAIN_STATUSES as readonly string[]).includes(String(d.domain_status)))
          byVerifiedDomain.set(String(d.domain), [...(byVerifiedDomain.get(String(d.domain)) ?? []), { id, relationship: String(a.relationship_state ?? 'UNKNOWN') }])
      }
      for (const n of [a.canonical_name, ...((a.aliases ?? []) as Doc[]).map((x) => x.alias)]) {
        const k = companyHint(n)
        if (k) byCompanyKey.set(k, [...new Set([...(byCompanyKey.get(k) ?? []), id])])
      }
    }
    if (!res.hasNextPage) break
    page++
  }
  return { byVerifiedDomain, anyDomain, byCompanyKey }
}

/** CRM users by email address and by display name (lower-case), for the Owner column. */
async function ownerIndex(s: CrmSession) {
  const res = await s.payload.find({ collection: 'users', where: { roles: { in: ['platform-admin', 'client-admin', 'sales'] } }, depth: 0, limit: 200, ...asUser(s) })
  const map = new Map<string, string>()
  for (const u of res.docs as unknown as Doc[]) {
    if (typeof u.email === 'string') map.set(u.email.toLowerCase(), String(u.id))
    if (typeof u.name === 'string' && u.name.trim()) map.set(u.name.trim().toLowerCase(), String(u.id))
  }
  return map
}

/** A value that is a placeholder ("NA", "none", "-"…) is treated as empty, and counted. */
function value(row: string[], m: Mapping, f: ImportField, cleared: { n: number }): string | null {
  const v = cell(row, m, f)
  if (v && isPlaceholder(v)) {
    cleared.n++
    return null
  }
  return v
}

/**
 * Plan an import. Reads only. Returns every row's intended outcome and the counts the admin approves. Errors are
 * returned as `{ error }` with a code and a message that never contains a value from the file.
 */
export async function planImport(s: CrmSession, text: string, rawMapping: unknown, rawOptions: unknown): Promise<{ plan: Plan } | { error: { code: string; message: string } }> {
  if (!s.isAdmin) return { error: { code: 'FORBIDDEN', message: 'Only an admin can import contacts.' } }
  const csv = parseCsv(text)
  if (!csv.ok) return { error: { code: csv.code, message: csv.message } }
  const columns = Math.max(csv.header.length, ...csv.rows.map((r) => r.length))
  const vm = validateMapping(rawMapping, columns)
  if (!vm.ok) return { error: { code: 'MAPPING', message: vm.message } }
  const m = vm.mapping
  const options = parseOptions(rawOptions)
  if (options.attested && (!options.source || !options.basis))
    return { error: { code: 'ATTESTATION_INCOMPLETE', message: 'An owner-attested import needs the source and the basis recorded.' } }
  if (options.createAccounts && ownEmailDomains().size === 0)
    return { error: { code: 'OWN_DOMAINS_UNSET', message: "Set H2O_OWN_EMAIL_DOMAINS (ICS's own email domains) before creating accounts from a file." } }

  const keys = [...new Set(csv.rows.map((r) => emailKey(cell(r, m, 'email'))?.matchKey).filter(Boolean))] as string[]
  const contacts = new Map<string, Doc>()
  const ledger = new Map<string, LedgerRow[]>()
  await chunks(keys, 200, async (part) => {
    const [c, sup] = await Promise.all([
      s.payload.find({ collection: 'crm-contacts', where: { email_match_key: { in: part } }, depth: 0, limit: part.length, ...asUser(s) }),
      s.payload.find({ collection: 'crm-suppressions', where: { email_match_key: { in: part } }, depth: 0, limit: 2000, ...asUser(s) }),
    ])
    for (const x of c.docs as unknown as Doc[]) contacts.set(String(x.email_match_key), x)
    for (const x of sup.docs as unknown as Array<LedgerRow & { email_match_key: string }>) ledger.set(x.email_match_key, [...(ledger.get(x.email_match_key) ?? []), x])
  })
  const [accounts, owners] = await Promise.all([accountIndex(s), ownerIndex(s)])
  const cleared = { n: 0 }

  // First pass: the corporate domain of every valid row, and the company hints each domain carries in the file.
  const domainOf = (r: string[]): string | null => {
    const web = normalizeWebDomain(value(r, m, 'website', { n: 0 }))
    if (web && !isConsumerDomain(web)) return web
    const k = emailKey(cell(r, m, 'email'))
    return k && !isConsumerDomain(k.domain) ? k.domain : null
  }
  // Per hint, every raw spelling with its count: the display name is the most frequent spelling (first seen on a tie).
  const hints = new Map<string, Map<string, { n: number; raws: Map<string, number> }>>()
  for (const r of csv.rows) {
    const d = domainOf(r)
    if (!d || isGenericInbox(cell(r, m, 'email')) || addressQualityOf(d)) continue
    const raw = value(r, m, 'company', { n: 0 })
    const h = companyHint(raw)
    const bucket = hints.get(d) ?? new Map()
    if (h && raw) {
      const e = bucket.get(h) ?? { n: 0, raws: new Map<string, number>() }
      e.n++
      e.raws.set(raw, (e.raws.get(raw) ?? 0) + 1)
      bucket.set(h, e)
    }
    hints.set(d, bucket)
  }
  const mostFrequent = (raws: Map<string, number>) => displayCompany([...raws].reduce((a, b) => (b[1] > a[1] ? b : a))[0])
  /** Decide each corporate domain once: link, create, review or nothing. */
  const domainDecision = new Map<string, { action: AccountAction; accountId: string | null; name: string | null; reason?: string }>()
  for (const [d, bucket] of hints) {
    const verified = accounts.byVerifiedDomain.get(d) ?? []
    if (verified.length === 1) domainDecision.set(d, { action: 'LINK_VERIFIED', accountId: verified[0]!.id, name: null })
    else if (verified.length > 1) domainDecision.set(d, { action: 'DOMAIN_REVIEW', accountId: null, name: null, reason: 'Domain verified on several accounts (identity review)' })
    else if (!options.createAccounts) domainDecision.set(d, { action: 'NONE', accountId: null, name: null })
    else if (accounts.anyDomain.has(d)) domainDecision.set(d, { action: 'DOMAIN_REVIEW', accountId: null, name: null, reason: 'Domain is an unverified candidate on an existing account (identity review)' })
    else if (bucket.size > 1) domainDecision.set(d, { action: 'DOMAIN_REVIEW', accountId: null, name: null, reason: 'Rows on this domain name different companies (identity review)' })
    else if (bucket.size === 0 && spamPatternOf(d)) domainDecision.set(d, { action: 'SUSPECT_REVIEW', accountId: null, name: null, reason: 'Spam-pattern domain with no company name: no account (review)' })
    else {
      const only = [...bucket.entries()][0]
      if (only && accounts.byCompanyKey.has(only[0])) domainDecision.set(d, { action: 'NAME_REVIEW', accountId: null, name: null, reason: 'An account with this company name exists without this domain (identity review)' })
      else domainDecision.set(d, { action: 'CREATE_ACCOUNT', accountId: null, name: only ? mostFrequent(only[1].raws) : null })
    }
  }

  const seen = new Map<string, number>()
  const created = new Set<string>()
  const out: PlannedRow[] = []
  let phonesNormalised = 0
  let phonesDropped = 0
  const nameCases = { SPLIT: 0, SPLIT_SUFFIX: 0, SINGLE_WORD: 0, SCRIPT_NOT_SPLIT: 0, COMMA: 0, EMPTY: 0 }
  const countryCases = { IMPORTED: 0, PHONE_INFERRED: 0, EMAIL_CCTLD_INFERRED: 0 }
  csv.rows.forEach((r, idx) => {
    const rowNo = idx + 1
    const reasons: string[] = []
    const base: PlannedRow = { row: rowNo, outcome: 'REJECT', reasons, email: null, contactId: null, fill: [], account: 'NONE', accountId: null, domain: null, suppress: 'NONE', note: false, genericInbox: false, addressQuality: null, values: {} }
    const rawEmail = cell(r, m, 'email')
    const key = emailKey(rawEmail)
    if (!rawEmail) {
      reasons.push('No email address')
      return out.push(base)
    }
    if (!key) {
      reasons.push('Email address is not valid')
      return out.push(base)
    }
    base.email = key.canonical
    if (seen.has(key.matchKey)) {
      reasons.push(`Same email as row ${seen.get(key.matchKey)}`)
      return out.push(base)
    }
    seen.set(key.matchKey, rowNo)

    let first = value(r, m, 'first_name', cleared)
    let last = value(r, m, 'last_name', cleared)
    // A full name in one column (the Full name mapping, or a first-name column whose last name is empty).
    const split = m.full_name !== undefined ? splitName(value(r, m, 'full_name', cleared)) : first && !last ? splitName(first) : null
    if (split) {
      first = split.first
      last = split.last
      nameCases[split.how]++
    }
    const v: PlannedRow['values'] = {
      first_name: line(first, 80),
      last_name: line(last, 80),
      title: line(value(r, m, 'title', cleared), 120),
      company_name_original: line(value(r, m, 'company', cleared), 160),
      source_record_id: line(value(r, m, 'source_ref', cleared), 120),
    }
    for (const [field, target] of [['phone', 'phone'], ['mobile_phone', 'mobile']] as const) {
      const raw = value(r, m, field, cleared)
      if (!raw) continue
      const ph = normalizePhone(raw)
      if (ph.kind === 'DROPPED') {
        phonesDropped++
        reasons.push(`${field === 'phone' ? 'Phone' : 'Mobile'} dropped (${ph.why})`)
      } else {
        v[target] = ph.value
        phonesNormalised++
      }
    }
    if (v.phone && v.mobile && v.phone === v.mobile) v.mobile = null
    // Country (ERS readiness, CT 2026-10-05): the file's own value, else inferred from the phone's calling code, else
    // from the email ccTLD — always recorded with its source. `jurisdiction` stays COUNTRY_UNKNOWN: an inference is
    // never a verified jurisdiction.
    const country = value(r, m, 'country', cleared)
    if (country && /^[A-Za-z]{2}$/.test(country)) {
      v.country_code = country.toUpperCase()
      v.country_source = 'IMPORTED'
    } else {
      if (country) reasons.push('Country ignored (use a 2-letter code)')
      const byPhone = countryFromPhone(v.phone) ?? countryFromPhone(v.mobile)
      const byTld = byPhone ? null : countryFromEmailDomain(key.domain)
      if (byPhone) {
        v.country_code = byPhone
        v.country_source = 'PHONE_INFERRED'
      } else if (byTld) {
        v.country_code = byTld
        v.country_source = 'EMAIL_CCTLD_INFERRED'
      }
    }
    if (v.country_source) countryCases[v.country_source as keyof typeof countryCases]++
    const ownerRaw = value(r, m, 'owner', cleared)
    if (ownerRaw) {
      const o = owners.get(ownerRaw.trim().toLowerCase())
      if (o) v.owner = o
      else reasons.push('Owner not found among CRM users (left empty)')
    }
    // CT ruling: the attestation is recorded as a basis (OWNER_ATTESTED_BATCH), never as relationship evidence.
    if (options.attested) v.relationship_basis = 'OWNER_ATTESTED_BATCH'
    base.note = Boolean(line(value(r, m, 'notes', cleared), 5000))
    base.values = v

    // Account from the corporate domain (free mail never links or creates).
    const d = domainOf(r)
    base.domain = d
    const decision = d ? domainDecision.get(d) : undefined
    base.genericInbox = isGenericInbox(key.canonical)
    base.addressQuality = addressQualityOf(key.domain) ?? (decision?.action === 'SUSPECT_REVIEW' ? 'SPAM_PATTERN' : null)
    if (base.addressQuality) v.address_quality = base.addressQuality
    if (base.addressQuality && base.addressQuality !== 'SPAM_PATTERN') reasons.push(`Address flagged ${base.addressQuality}: no account link, never sequenced`)
    else if (!d) reasons.push('Free-mail address: no account link')
    else if (base.genericInbox) reasons.push('Shared/role inbox: identity review, no account link')
    else if (decision) {
      base.account = decision.action === 'CREATE_ACCOUNT' && created.has(d) ? 'LINK_NEW_ACCOUNT' : decision.action
      base.accountId = decision.accountId
      if (decision.action === 'CREATE_ACCOUNT') created.add(d)
      if (decision.reason) reasons.push(decision.reason)
    }

    const active = activeFromLedger(ledger.get(key.matchKey) ?? []).length > 0
    if (truthy(value(r, m, 'do_not_contact', cleared))) base.suppress = active ? 'ALREADY' : 'ADD'

    const existing = contacts.get(key.matchKey)
    if (!existing) {
      base.outcome = 'CREATE'
      base.fill = Object.entries(v).filter(([k, x]) => x && k !== 'mobile').map(([k]) => k)
      if (v.mobile && !base.fill.includes('phone')) base.fill.push('phone')
      if (!v.first_name && !v.last_name) reasons.push('No name supplied')
      return out.push(base)
    }
    base.contactId = String(existing.id)
    if (existing.record_state !== 'ACTIVE') {
      base.outcome = 'SKIP'
      base.account = 'NONE'
      reasons.push('Existing contact is archived or merged (left as is)')
      return out.push(base)
    }
    // A mismatch is a name part present on both sides that differs; adding a missing part is a fill, not a conflict.
    const differ = (a: unknown, b: unknown) => {
      const x = nameKey(a, null)
      const y = nameKey(b, null)
      return Boolean(x && y && x !== y)
    }
    if (differ(v.first_name, existing.first_name) || differ(v.last_name, existing.last_name)) {
      base.outcome = 'REVIEW'
      base.account = 'NONE'
      reasons.push('Email matches a contact with a different name (identity review)')
      return out.push(base)
    }
    // Fill-empty only: a field is written only where the CRM has nothing ("unknown" counts as nothing).
    const empty = (x: unknown) => x === null || x === undefined || (typeof x === 'string' && x.trim() === '')
    const fill: string[] = []
    for (const f of ['first_name', 'last_name', 'title', 'company_name_original'] as const) if (v[f] && empty(existing[f])) fill.push(f)
    if (v.country_code && empty(existing.country_code)) fill.push('country_code', 'country_source')
    if (v.owner && !relId(existing.owner)) fill.push('owner')
    if (v.relationship_basis && !existing.relationship_basis) fill.push('relationship_basis')
    if (v.address_quality && !existing.address_quality) fill.push('address_quality')
    if ((v.phone || v.mobile) && !((existing.phones as Doc[] | undefined)?.length ?? 0)) fill.push('phone')
    const differs = ['first_name', 'last_name', 'title', 'company_name_original', 'country_code'].filter(
      (f) => v[f] && !empty(existing[f]) && String(existing[f]).trim().toLowerCase() !== String(v[f]).trim().toLowerCase(),
    )
    if (differs.length) reasons.push(`Kept existing ${differs.join(', ').replaceAll('_', ' ')}`)
    // Only a verified-domain match links an existing contact, and only if it has no account yet.
    if (base.account === 'LINK_VERIFIED' && !relId(existing.account)) fill.push('account')
    else if (base.account === 'CREATE_ACCOUNT' || base.account === 'LINK_NEW_ACCOUNT') {
      if (!relId(existing.account)) fill.push('account')
      else base.account = 'NONE'
    } else if (base.account === 'LINK_VERIFIED') base.account = 'NONE'
    base.fill = fill
    base.outcome = fill.length ? 'FILL' : 'UNCHANGED'
    return out.push(base)
  })
  // A domain account is created by the first row that uses it; later rows link to it.
  const newAccounts = new Map<string, string>()
  const fromDomain = new Set<string>()
  for (const [d, dec] of domainDecision)
    if (dec.action === 'CREATE_ACCOUNT' && out.some((r) => r.domain === d && (r.account === 'CREATE_ACCOUNT' || r.account === 'LINK_NEW_ACCOUNT'))) {
      newAccounts.set(d, dec.name ?? nameFromDomain(d))
      if (!dec.name) fromDomain.add(d)
    }
  const count = (p: (r: PlannedRow) => boolean) => out.filter(p).length
  const live = (r: PlannedRow) => r.outcome !== 'REJECT' && r.outcome !== 'SKIP'
  const summary: Summary = {
    rows: out.length,
    create: count((r) => r.outcome === 'CREATE'),
    fill: count((r) => r.outcome === 'FILL'),
    unchanged: count((r) => r.outcome === 'UNCHANGED'),
    review: count((r) => r.outcome === 'REVIEW'),
    skip: count((r) => r.outcome === 'SKIP'),
    reject: count((r) => r.outcome === 'REJECT'),
    linkVerified: count((r) => live(r) && r.account === 'LINK_VERIFIED'),
    accountsCreate: newAccounts.size,
    accountsNamedFromDomain: fromDomain.size,
    contactsOnNewAccounts: count((r) => live(r) && (r.account === 'CREATE_ACCOUNT' || r.account === 'LINK_NEW_ACCOUNT')),
    genericInboxReviews: count((r) => r.outcome === 'CREATE' && r.genericInbox),
    addressSuspectTypo: count((r) => live(r) && r.addressQuality === 'SUSPECT_TYPO'),
    addressDisposable: count((r) => live(r) && r.addressQuality === 'DISPOSABLE'),
    addressSpamPattern: count((r) => live(r) && r.addressQuality === 'SPAM_PATTERN'),
    addressInternal: count((r) => live(r) && r.addressQuality === 'INTERNAL'),
    suspectDomainReviews: new Set(out.filter((r) => live(r) && r.account === 'SUSPECT_REVIEW').map((r) => r.domain)).size,
    accountReviews: new Set(out.filter((r) => live(r) && (r.account === 'DOMAIN_REVIEW' || r.account === 'NAME_REVIEW')).map((r) => r.domain)).size,
    unlinkedFreeMail: count((r) => live(r) && !r.domain && !r.addressQuality),
    suppressAdd: count((r) => live(r) && r.suppress === 'ADD'),
    suppressAlready: count((r) => live(r) && r.suppress === 'ALREADY'),
    notes: count((r) => live(r) && r.outcome !== 'REVIEW' && r.note),
    phonesNormalised,
    phonesDropped,
    countryFromFile: countryCases.IMPORTED,
    countryPhoneInferred: countryCases.PHONE_INFERRED,
    countryCctldInferred: countryCases.EMAIL_CCTLD_INFERRED,
    namesSplit: nameCases.SPLIT + nameCases.COMMA,
    namesSplitSuffixKept: nameCases.SPLIT_SUFFIX,
    namesSingleWord: nameCases.SINGLE_WORD,
    namesScriptNotSplit: nameCases.SCRIPT_NOT_SPLIT,
    placeholdersCleared: cleared.n,
    warnings: count((r) => live(r) && r.reasons.length > 0),
    batches: Math.max(1, Math.ceil(out.length / BATCH_ROWS)),
  }
  return { plan: { sha256: fileSha256(text), columns, mapping: m, options, rows: out, summary, newAccounts, fromDomain } }
}

/** What the browser sees of a plan: counts plus per-row outcomes for the admin's own file. */
export const planView = (p: Plan) => ({
  sha256: p.sha256,
  summary: p.summary,
  rows: p.rows.map((r) => ({ row: r.row, outcome: r.outcome, email: r.email, account: r.account, suppress: r.suppress, fill: r.fill, reasons: r.reasons })),
})

/** Counts only (for reports and evidence): the planned summary plus the reason frequencies. */
export const planAggregate = (p: Plan) => {
  const reasons = new Map<string, number>()
  for (const r of p.rows) for (const x of r.reasons) {
    const k = x.replace(/row \d+/, 'row N')
    reasons.set(k, (reasons.get(k) ?? 0) + 1)
  }
  return { summary: p.summary, reasons: Object.fromEntries([...reasons].sort((a, b) => b[1] - a[1])) }
}

/** Domain-only list for CT spot checks: domain, contacts, decision, account display name. No local parts. */
export function planDomains(p: Plan) {
  // A domain's decision comes from its non-generic rows: a shared inbox never links, so its NONE must not mask the domain's review.
  const by = new Map<string, { contacts: number; generic: number; decision: AccountAction; quality: AddressQuality | null }>()
  for (const r of p.rows) {
    if (!r.domain || r.outcome === 'REJECT' || r.outcome === 'SKIP') continue
    const cur = by.get(r.domain) ?? { contacts: 0, generic: 0, decision: 'NONE', quality: null }
    cur.contacts++
    cur.quality ??= r.addressQuality
    if (r.genericInbox) cur.generic++
    else if (cur.decision === 'NONE' || r.account === 'CREATE_ACCOUNT') cur.decision = r.account === 'LINK_NEW_ACCOUNT' ? 'CREATE_ACCOUNT' : r.account
    by.set(r.domain, cur)
  }
  return [...by]
    .map(([domain, x]) => ({ domain, contacts: x.contacts, genericInboxes: x.generic, decision: x.decision, addressQuality: x.quality, accountName: p.newAccounts.get(domain) ?? null, nameFromDomain: p.fromDomain.has(domain) }))
    .sort((a, b) => b.contacts - a.contacts || a.domain.localeCompare(b.domain))
}

/** Memory the OS can still give us (Linux MemAvailable; elsewhere free memory), in MB. */
export function availableMemoryMb(): number {
  try {
    const m = readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+) kB/m)
    if (m) return Math.floor(Number(m[1]) / 1024)
  } catch {
    /* not Linux */
  }
  return Math.floor(freemem() / 1024 / 1024)
}

/** CT performance conditions: pause between batches; stop before a batch (or mid-batch) when memory is low. */
export const importLimits = () => ({
  pauseMs: Math.max(0, Number(process.env.H2O_IMPORT_PAUSE_MS ?? 2000)),
  minFreeMb: Math.max(0, Number(process.env.H2O_IMPORT_MIN_FREE_MB ?? 500)),
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type ApplyProgress = { done: number; total: number; batch: number; batches: number }
export type ApplyResult =
  | {
      ok: true
      batchIds: string[]
      summary: Summary
      failed: Array<{ row: number; code: string }>
      /** Set when the run stopped early (low memory): rows from `fromRow` on were not applied. */
      stopped?: { code: 'LOW_MEMORY'; fromRow: number; availableMb: number }
    }
  | { ok: false; code: string; message: string }

const sameSummary = (a: unknown, b: Summary) => {
  if (!a || typeof a !== 'object') return false
  return (Object.keys(b) as Array<keyof Summary>).every((k) => Number(D(a)[k]) === b[k])
}

const errCode = (err: unknown) => String(D(D(err).data ?? {}).code ?? D(err).name ?? 'ERROR').slice(0, 60)

/** Primary first, then mobile; the same number twice is stored once. */
const phoneRows = (v: PlannedRow['values']) =>
  [v.phone ? { number_raw: v.phone, kind: 'PRIMARY' } : null, v.mobile ? { number_raw: v.mobile, kind: 'MOBILE' } : null].filter(Boolean)

/**
 * Apply a planned import. Re-plans the file and refuses unless the counts equal the approved dry run. Rows are
 * written in batches of at most `BATCH_ROWS`, each with its own batch record (so each can be undone); a failed row
 * is recorded by number and code and never hides the others.
 */
export async function applyImport(
  s: CrmSession,
  text: string,
  rawMapping: unknown,
  rawOptions: unknown,
  expected: unknown,
  onProgress?: (p: ApplyProgress) => void,
): Promise<ApplyResult> {
  const planned = await planImport(s, text, rawMapping, rawOptions)
  if ('error' in planned) return { ok: false, ...planned.error }
  const plan = planned.plan
  if (!sameSummary(expected, plan.summary))
    return { ok: false, code: 'STALE_DRY_RUN', message: 'The data changed since the dry run, or the file, mapping or options differ. Run the dry run again before applying.' }
  const csv = parseCsv(text)
  if (!csv.ok) return { ok: false, code: csv.code, message: csv.message }
  const m = plan.mapping
  const opts = plan.options
  const today = new Date().toISOString().slice(0, 10)
  // CT ruling §8.1: the verification source reads "owner attestation, legacy import <date>".
  const attested = opts.attested ? `Owner attestation, legacy import ${today} (${opts.basis}; source: ${opts.source})` : null
  // One tag for the whole run (all batches of this file), so the set can be identified and undone together.
  const runTag = `import-file:${plan.sha256.slice(0, 16)}`
  const limits = importLimits()
  let stopped: { code: 'LOW_MEMORY'; fromRow: number; availableMb: number } | undefined

  const failed: Array<{ row: number; code: string }> = []
  const batchIds: string[] = []
  const accountIdByDomain = new Map<string, string>()
  const actual: Summary = { ...plan.summary, create: 0, fill: 0, review: 0, accountsCreate: 0, linkVerified: 0, contactsOnNewAccounts: 0, accountReviews: 0, genericInboxReviews: 0, suspectDomainReviews: 0, suppressAdd: 0, notes: 0 }
  const reviewedDomains = new Set<string>()
  const batches = plan.summary.batches

  for (let b = 0; b < batches && !stopped; b++) {
    const slice = plan.rows.slice(b * BATCH_ROWS, (b + 1) * BATCH_ROWS)
    if (b > 0 && limits.pauseMs) await sleep(limits.pauseMs)
    const mem = availableMemoryMb()
    if (mem < limits.minFreeMb) {
      stopped = { code: 'LOW_MEMORY', fromRow: slice[0]?.row ?? 0, availableMb: mem }
      break
    }
    const batch = D(
      await s.payload.create({
        collection: 'crm-import-batches',
        data: {
          entity: 'CONTACTS',
          status: 'APPLIED',
          file_sha256: plan.sha256,
          row_count: slice.length,
          mapping: m,
          options: { ...opts, part: b + 1, parts: batches, firstRow: slice[0]?.row ?? null, lastRow: slice.at(-1)?.row ?? null },
          counts: plan.summary,
          applied_by: s.userId,
          source_label: opts.source,
          basis: opts.basis,
        } as never,
        depth: 0,
        ...asUser(s),
      }),
    )
    const batchId = String(batch.id)
    const batchKey = String(batch.canonical_id)
    batchIds.push(batchId)
    const ctx = { context: { crmServer: { import_batch_id: batchKey } } }
    const provenance = (sourceRef: string | null | undefined, evidence: string | null) => ({
      source_system: 'LEGACY_IMPORT',
      import_batch_id: batchKey,
      source_event_id: runTag,
      source_record_id: sourceRef ?? null,
      evidence_ref: evidence,
      first_seen_at: new Date().toISOString(),
      verification_state: evidence ? 'REVIEWED_UNVERIFIED' : 'UNKNOWN',
    })
    const fills: Array<{ contact: string; fields: string[] }> = []

    for (const [i, r] of slice.entries()) {
      onProgress?.({ done: b * BATCH_ROWS + i, total: plan.rows.length, batch: b + 1, batches })
      if (i > 0 && i % 250 === 0) {
        const now = availableMemoryMb()
        if (now < limits.minFreeMb) {
          stopped = { code: 'LOW_MEMORY', fromRow: r.row, availableMb: now }
          break
        }
      }
      if (r.outcome === 'REJECT' || r.outcome === 'SKIP') continue
      const raw = csv.rows[r.row - 1]!
      try {
        let contactId = r.contactId
        let accountId: string | null = r.account === 'LINK_VERIFIED' ? r.accountId : null
        if ((r.account === 'CREATE_ACCOUNT' || r.account === 'LINK_NEW_ACCOUNT') && r.domain) {
          accountId = accountIdByDomain.get(r.domain) ?? null
          if (!accountId) {
            const acc = D(
              await s.payload.create({
                collection: 'crm-accounts',
                data: {
                  canonical_name: plan.newAccounts.get(r.domain) ?? nameFromDomain(r.domain),
                  name_from_domain: plan.fromDomain.has(r.domain),
                  domains: [
                    {
                      domain: r.domain,
                      // The corporate email domain of contacts the owner attests are customers is evidence of
                      // ownership; without the attestation it stays an unverified candidate.
                      domain_status: attested ? 'VERIFIED_OWNED' : 'CANDIDATE',
                      evidence_ref: attested ? `${attested}; corporate email domain of imported contacts` : 'Corporate email domain of imported contacts',
                    },
                  ],
                  // CT ruling (E1.3): a batch attestation is not a per-record verification — new accounts are candidates.
                  relationship_state: attested ? 'CANDIDATE' : 'UNKNOWN',
                  relationship_basis: attested ? 'OWNER_ATTESTED_BATCH' : null,
                  relationship_basis_batch: attested ? batchKey : null,
                  provenance: provenance(null, attested),
                } as never,
                depth: 0,
                ...asUser(s),
                ...ctx,
              }),
            )
            accountId = String(acc.id)
            accountIdByDomain.set(r.domain, accountId)
            actual.accountsCreate++
          }
          actual.contactsOnNewAccounts++
        }
        // Existing accounts are never changed by an import (CT ruling 2026-10-05).
        const v = r.values
        if (r.outcome === 'CREATE') {
          const created = D(
            await s.payload.create({
              collection: 'crm-contacts',
              data: {
                email: r.email,
                first_name: v.first_name ?? null,
                last_name: v.last_name ?? null,
                title: v.title ?? null,
                company_name_original: v.company_name_original ?? null,
                country_code: v.country_code ?? null,
                country_source: v.country_source ?? null,
                owner: v.owner ?? null,
                phones: phoneRows(v),
                account: accountId,
                account_link_confidence: accountId ? (r.account === 'LINK_VERIFIED' ? 'HIGH_CONFIDENCE' : attested ? 'HIGH_CONFIDENCE' : 'LOW_CONFIDENCE') : 'UNKNOWN',
                relationship_basis: v.relationship_basis ?? null,
                relationship_basis_batch: v.relationship_basis ? batchKey : null,
                address_quality: v.address_quality ?? null,
                provenance: provenance(v.source_record_id, attested),
              } as never,
              depth: 0,
              ...asUser(s),
              ...ctx,
            }),
          )
          contactId = String(created.id)
          actual.create++
          if (r.account === 'LINK_VERIFIED') actual.linkVerified++
        } else if (r.outcome === 'FILL' && contactId) {
          const data: Doc = {}
          for (const f of r.fill) {
            if (f === 'phone') data.phones = phoneRows(v)
            else if (f === 'account') {
              data.account = accountId
              data.account_link_confidence = 'HIGH_CONFIDENCE'
              if (r.account === 'LINK_VERIFIED') actual.linkVerified++
            } else if (f === 'relationship_basis') {
              data.relationship_basis = v.relationship_basis
              data.relationship_basis_batch = batchKey
            } else data[f] = v[f]
          }
          if ('first_name' in data || 'last_name' in data) {
            const cur = D(await s.payload.findByID({ collection: 'crm-contacts', id: contactId, depth: 0, ...asUser(s) }))
            data.display_name = [data.first_name ?? cur.first_name, data.last_name ?? cur.last_name].filter(Boolean).join(' ') || null
          }
          await s.payload.update({ collection: 'crm-contacts', id: contactId, data: data as never, depth: 0, ...asUser(s), ...ctx })
          fills.push({ contact: contactId, fields: r.fill })
          actual.fill++
        } else if (r.outcome === 'REVIEW' && contactId) {
          await openIdentityReview(s.payload, {
            subject_type: 'CONTACT',
            reason: 'EMAIL_MATCH_NAME_MISMATCH',
            subject_ids: [contactId],
            dedupe_key: `import:${plan.sha256.slice(0, 16)}:${contactId}:name`,
            contact: contactId,
          }, { withTask: false })
          actual.review++
        }
        if (r.outcome === 'CREATE' && r.genericInbox && contactId) {
          await openIdentityReview(
            s.payload,
            { subject_type: 'CONTACT', reason: 'GENERIC_SHARED_INBOX', subject_ids: [contactId], dedupe_key: `import:${plan.sha256.slice(0, 16)}:${contactId}:generic`, contact: contactId },
            { withTask: false },
          )
          actual.genericInboxReviews++
        }
        // One identity review per conflicting domain, attached to the first contact on it.
        if ((r.account === 'DOMAIN_REVIEW' || r.account === 'NAME_REVIEW') && r.domain && contactId && !reviewedDomains.has(r.domain)) {
          reviewedDomains.add(r.domain)
          await openIdentityReview(s.payload, {
            subject_type: 'CONTACT',
            reason: r.account === 'NAME_REVIEW' ? 'COMPANY_NAME_MATCH_UNVERIFIED' : 'CONTACT_ACCOUNT_CONFLICT',
            subject_ids: [contactId],
            dedupe_key: `import:${plan.sha256.slice(0, 16)}:domain:${r.domain}`,
            contact: contactId,
          }, { withTask: false })
          actual.accountReviews++
        }
        // A spam-pattern domain (no company name, suspicious shape): one review per domain, no task (CT 2026-10-05).
        if (r.account === 'SUSPECT_REVIEW' && r.domain && contactId && !reviewedDomains.has(r.domain)) {
          reviewedDomains.add(r.domain)
          await openIdentityReview(s.payload, {
            subject_type: 'CONTACT',
            reason: 'SUSPECT_ADDRESS_DOMAIN',
            subject_ids: [contactId],
            dedupe_key: `import:${plan.sha256.slice(0, 16)}:suspect:${r.domain}`,
            contact: contactId,
          }, { withTask: false })
          actual.suspectDomainReviews++
        }
        if (contactId && r.suppress === 'ADD') {
          await s.payload.create({
            collection: 'crm-suppressions',
            data: { contact: contactId, action: 'APPLY', reason: 'DO_NOT_CONTACT', scope: 'ALL_OUTREACH', source: 'LEGACY_IMPORT', source_event_id: batchKey, reason_note: 'Do-not-contact recorded in the imported file.' } as never,
            depth: 0,
            ...asUser(s),
            context: { crmServer: { source: 'LEGACY_IMPORT', source_event_id: batchKey } },
          })
          actual.suppressAdd++
        }
        const note = line(value(raw, m, 'notes', { n: 0 }), 5000)
        if (contactId && note && r.outcome !== 'REVIEW') {
          await s.payload.create({ collection: 'crm-notes', data: { body: note, contact: contactId, account: accountId } as never, depth: 0, ...asUser(s) })
          actual.notes++
        }
      } catch (err) {
        failed.push({ row: r.row, code: errCode(err) })
      }
    }
    await s.payload.update({
      collection: 'crm-import-batches',
      id: batchId,
      data: { fills: { contacts: fills }, applied_at: new Date().toISOString() } as never,
      depth: 0,
      ...asUser(s),
    })
    await writeCrmAudit({ payload: s.payload, user: s.user } as never, {
      action: 'update',
      collection: 'crm-import-batches',
      docId: batchId,
      changedKeys: ['applied'],
      detail: {
        canonical_id: batchKey,
        event: 'IMPORT_APPLIED',
        part: b + 1,
        parts: batches,
        rows: slice.length,
        attested: Boolean(attested),
        failedRows: failed.filter((f) => f.row >= (slice[0]?.row ?? 0) && f.row <= (slice.at(-1)?.row ?? 0)).length,
      },
    })
  }
  if (!stopped) onProgress?.({ done: plan.rows.length, total: plan.rows.length, batch: batches, batches })
  return { ok: true, batchIds, summary: actual, failed, ...(stopped ? { stopped } : {}) }
}

/**
 * Undo one batch: archive the contacts and accounts it created, and clear what it filled on existing records —
 * but only where nobody has changed that record since the import. Nothing is deleted. Suppressions recorded from
 * the file stay (a suppression is never auto-cleared), as do notes and identity reviews; the counts say so.
 */
export async function undoImport(s: CrmSession, input: { batchId: unknown; note: unknown }) {
  if (!s.isAdmin) return { ok: false as const, code: 'FORBIDDEN', message: 'Only an admin can undo an import.' }
  const note = line(input.note, 500)
  if (!note) return { ok: false as const, code: 'VALIDATION', message: 'Say why the batch is being undone.', fields: { note: 'Required' } }
  const id = typeof input.batchId === 'string' && /^[0-9a-f-]{36}$/i.test(input.batchId) ? input.batchId : null
  if (!id) return { ok: false as const, code: 'INVALID_ID', message: 'That batch reference is not valid.' }
  let batch: Doc
  try {
    batch = D(await s.payload.findByID({ collection: 'crm-import-batches', id, depth: 0, ...asUser(s) }))
  } catch {
    return { ok: false as const, code: 'NOT_FOUND', message: 'That batch no longer exists.' }
  }
  if (batch.status !== 'APPLIED') return { ok: true as const, message: 'This batch was already undone.' }
  const key = String(batch.canonical_id)
  const appliedAt = new Date(String(batch.applied_at ?? batch.createdAt)).getTime()
  const counts = { contactsArchived: 0, accountsArchived: 0, fillsReverted: 0, fillsKeptChanged: 0, suppressionsKept: 0 }
  const archiveAll = async (collection: 'crm-contacts' | 'crm-accounts', field: 'record_state' | 'account_state') => {
    for (;;) {
      const where: Where = { and: [{ 'provenance.import_batch_id': { equals: key } }, { [field]: { equals: 'ACTIVE' } }] }
      const res = await s.payload.find({ collection, where, depth: 0, limit: 200, ...asUser(s) })
      if (res.docs.length === 0) break
      for (const d of res.docs) {
        await s.payload.update({ collection, id: String(d.id), data: { [field]: 'ARCHIVED' } as never, depth: 0, ...asUser(s) })
        if (collection === 'crm-contacts') counts.contactsArchived++
        else counts.accountsArchived++
      }
    }
  }
  await archiveAll('crm-contacts', 'record_state')
  await archiveAll('crm-accounts', 'account_state')
  const fills = D(batch.fills ?? {})
  for (const f of (Array.isArray(fills.contacts) ? fills.contacts : []) as Array<{ contact: string; fields: string[] }>) {
    let c: Doc
    try {
      c = D(await s.payload.findByID({ collection: 'crm-contacts', id: f.contact, depth: 0, ...asUser(s) }))
    } catch {
      continue
    }
    if (new Date(String(c.updatedAt)).getTime() > appliedAt) {
      counts.fillsKeptChanged++
      continue
    }
    const data: Doc = {}
    for (const field of f.fields) {
      if (field === 'phone') data.phones = []
      else if (field === 'account') {
        data.account = null
        data.account_link_confidence = 'UNKNOWN'
      } else if (field === 'relationship_basis') {
        data.relationship_basis = null
        data.relationship_basis_batch = null
      }
      else data[field] = null
    }
    if ('first_name' in data || 'last_name' in data) {
      const first = 'first_name' in data ? null : c.first_name
      const last = 'last_name' in data ? null : c.last_name
      data.display_name = [first, last].filter(Boolean).join(' ') || null
    }
    await s.payload.update({ collection: 'crm-contacts', id: f.contact, data: data as never, depth: 0, ...asUser(s) })
    counts.fillsReverted++
  }
  counts.suppressionsKept = (await s.payload.count({ collection: 'crm-suppressions', where: { source_event_id: { equals: key } }, ...asUser(s) })).totalDocs
  await s.payload.update({
    collection: 'crm-import-batches',
    id,
    data: { status: 'UNDONE', undone_by: s.userId, undone_at: new Date().toISOString(), undo_counts: counts, undo_note: note } as never,
    depth: 0,
    ...asUser(s),
  })
  await writeCrmAudit({ payload: s.payload, user: s.user } as never, {
    action: 'update',
    collection: 'crm-import-batches',
    docId: id,
    changedKeys: ['status'],
    detail: { canonical_id: key, event: 'IMPORT_UNDONE', ...counts },
  })
  return {
    ok: true as const,
    message: `Batch undone: ${counts.contactsArchived} contacts and ${counts.accountsArchived} accounts archived, ${counts.fillsReverted} fills reverted${counts.fillsKeptChanged ? `, ${counts.fillsKeptChanged} kept because they changed since` : ''}.`,
    counts,
  }
}

/** Undo every applied batch of one file run (all parts), newest first. */
export async function undoRun(s: CrmSession, input: { sha: unknown; note: unknown }) {
  if (!s.isAdmin) return { ok: false as const, code: 'FORBIDDEN', message: 'Only an admin can undo an import.' }
  const sha = typeof input.sha === 'string' && /^[0-9a-f]{64}$/.test(input.sha) ? input.sha : null
  if (!sha) return { ok: false as const, code: 'INVALID_ID', message: 'That import run reference is not valid.' }
  const res = await s.payload.find({ collection: 'crm-import-batches', where: { and: [{ file_sha256: { equals: sha } }, { status: { equals: 'APPLIED' } }] }, sort: '-createdAt', depth: 0, limit: 100, ...asUser(s) })
  if (res.docs.length === 0) return { ok: true as const, message: 'Nothing to undo for this file.' }
  let archived = 0
  for (const b of res.docs) {
    const out = await undoImport(s, { batchId: String(b.id), note: input.note })
    if (!out.ok) return out
    archived += out.counts?.contactsArchived ?? 0
  }
  return { ok: true as const, message: `${res.docs.length} batches undone; ${archived} contacts archived.` }
}

/** Recent batches for the import page (counts only). */
export async function recentBatches(s: CrmSession) {
  if (!s.isAdmin) return []
  const res = await s.payload.find({ collection: 'crm-import-batches', where: {}, sort: '-createdAt', depth: 0, limit: 30, ...asUser(s) })
  return (res.docs as unknown as Doc[]).map((b) => ({
    id: String(b.id),
    status: String(b.status),
    rows: Number(b.row_count ?? 0),
    part: Number(D(b.options ?? {}).part ?? 1),
    parts: Number(D(b.options ?? {}).parts ?? 1),
    source: (b.source_label as string) || null,
    counts: (b.counts ?? {}) as Partial<Summary>,
    undoCounts: (b.undo_counts ?? null) as Record<string, number> | null,
    appliedAt: String(b.applied_at ?? b.createdAt ?? ''),
    sha: String(b.file_sha256 ?? ''),
  }))
}
