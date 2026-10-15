import { Checker, type Issue } from './check.ts'

/**
 * KIT-0 M1: the client manifest. Everything a client can be, declared once (v1).
 *
 * Fail closed: unknown fields, missing fields, a secret-looking field name, a non-https origin or a dangling reference
 * all make `validateManifest` return issues, and `loadManifest` (src/load.ts, the only file here that touches the file system) throw. There are no defaults that name a company.
 * Secrets are never values here: only references (`ops.secretsRef`).
 */
export const MANIFEST_SCHEMA_VERSION = 1 as const

export type Office = {
  key: string
  label: string
  country: string
  address: { lines: string[]; city: string; region: string; postalCode: string }
  phones: Array<{ display: string; tel: string }>
  timeZone: string
  publicOnSite: boolean
}
export type Sender = { id: string; displayName: string; address: string }
export type Manifest = {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION
  client: { slug: string; legalName: string; displayName: string; shortName: string; tenantKey: string; status: 'provisional' | 'confirmed'; statusNote: string | null }
  brand: {
    names: { site: string; admin: string; emailFrom: string; chatHeader: string; crmHeader: string }
    logo: { light: string; dark: string; emblem: string; favicon: string; og: string }
  }
  domains: { canonical: string; aliases: string[]; indexingPolicy: 'staging' | 'production' }
  locales: { default: string; enabled: string[] }
  offices: Office[]
  routing: { unknownCountry: string; rules: Array<{ countries: string[]; office: string }>; responsePromise: string }
  email: {
    provider: 'workspace' | 'stalwart'
    mode: 'off' | 'test' | 'live'
    senders: Sender[]
    replyDomain: string
    signature: { name: string; lines: string[] }
    persona: string | null
    library: { enabled: boolean }
    sequences: { enabled: boolean }
    inbound: { enabled: boolean }
  }
  crm: {
    pipelineStages: Array<{ key: string; label: string }>
    intakePurposes: Array<{ key: string; label: string }>
    rfqPrefix: string
    modules: { library: boolean; sequences: boolean; attachments: boolean; api: boolean; sheets: boolean; typeform: boolean }
  }
  site: { modules: string[]; legal: { privacy: boolean; cookies: boolean; terms: boolean; accessibility: boolean }; sameAs: string[]; tracking: { analytics: boolean; ads: boolean } }
  seo: { rankingUrlContract: string | null }
  ops: { imageName: string; backupTarget: string; scannerAllowlist: string; secretsRef: string }
  /** Strings that also belong to another client's blocklist but are legitimately this client's too (decided by the owner, per pair). */
  review: { allowedOverlap: string[]; overlapNotes?: string[] }
}

/** Office ids the CRM can store today (`crm/offices.ts`); opaque slot ids, not city names. */
export const STORED_OFFICE_SLOTS: readonly string[] = ['US', 'TH']
const SLUG = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/
const ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEL = /^tel:\+[1-9][0-9]{6,14}$/
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/
const SECRET_NAME = /(secret|password|passwd|token|api_?key|private_?key|credential)/i

function walkNames(v: unknown, p: string, c: Checker): void {
  if (Array.isArray(v)) v.forEach((x, i) => walkNames(x, `${p}[${i}]`, c))
  else if (typeof v === 'object' && v !== null)
    for (const [k, x] of Object.entries(v)) {
      if (SECRET_NAME.test(k) && k !== 'secretsRef') c.fail(`${p}.${k}`, 'secret-looking field names are not allowed in a manifest (use ops.secretsRef)')
      walkNames(x, `${p}.${k}`, c)
    }
}

export function validateManifest(raw: unknown): { ok: true; manifest: Manifest } | { ok: false; issues: Issue[] } {
  const c = new Checker()
  walkNames(raw, '$', c)
  const top = c.obj(raw, '$', ['schemaVersion', 'client', 'brand', 'domains', 'locales', 'offices', 'routing', 'email', 'crm', 'site', 'seo', 'ops', 'review'])
  if (!top) return { ok: false, issues: c.issues }
  if (top.schemaVersion !== MANIFEST_SCHEMA_VERSION) c.fail('$.schemaVersion', `must be ${MANIFEST_SCHEMA_VERSION}`)

  const client = c.obj(top.client, '$.client', ['slug', 'legalName', 'displayName', 'shortName', 'tenantKey', 'status', 'statusNote'])
  if (client) {
    c.str(client.slug, '$.client.slug', { pattern: SLUG, what: 'a lower-case slug of 3 to 40 characters' })
    for (const k of ['legalName', 'displayName', 'shortName']) c.str(client[k], `$.client.${k}`, { max: 120 })
    c.oneOf(client.status, '$.client.status', ['provisional', 'confirmed'])
    if (client.statusNote !== null) c.str(client.statusNote, '$.client.statusNote', { max: 1000 })
    if (client.status === 'provisional' && client.statusNote === null) c.fail('$.client.statusNote', 'a provisional client must say what is still unconfirmed')
    c.str(client.tenantKey, '$.client.tenantKey', { max: 32, pattern: /^[A-Z][A-Z0-9_]{1,31}$/, what: 'upper case letters, digits or _' })
  }

  const brand = c.obj(top.brand, '$.brand', ['names', 'logo'])
  if (brand) {
    const names = c.obj(brand.names, '$.brand.names', ['site', 'admin', 'emailFrom', 'chatHeader', 'crmHeader'])
    if (names) for (const k of Object.keys(names)) c.str(names[k], `$.brand.names.${k}`, { max: 120 })
    const logo = c.obj(brand.logo, '$.brand.logo', ['light', 'dark', 'emblem', 'favicon', 'og'])
    if (logo) for (const k of Object.keys(logo)) c.str(logo[k], `$.brand.logo.${k}`, { pattern: /^\/[A-Za-z0-9._/-]+$/, what: 'a site-relative path starting with /' })
  }

  const domains = c.obj(top.domains, '$.domains', ['canonical', 'aliases', 'indexingPolicy'])
  const hosts: string[] = []
  if (domains) {
    const canon = c.str(domains.canonical, '$.domains.canonical', { pattern: ORIGIN, what: 'an https origin with no path, like https://host.tld' })
    if (canon && ORIGIN.test(canon)) hosts.push(canon.replace('https://', ''))
    for (const [i, a] of c.arr(domains.aliases, '$.domains.aliases', { max: 20 }).entries()) {
      const h = c.str(a, `$.domains.aliases[${i}]`, { pattern: HOST, what: 'a host name' })
      if (h) hosts.push(h)
    }
    c.oneOf(domains.indexingPolicy, '$.domains.indexingPolicy', ['staging', 'production'])
  }

  const locales = c.obj(top.locales, '$.locales', ['default', 'enabled'])
  if (locales) {
    const d = c.str(locales.default, '$.locales.default', { max: 12, pattern: /^[a-z]{2}(-[A-Z]{2})?$/, what: 'a locale like en or th-TH' })
    const en = c.arr(locales.enabled, '$.locales.enabled', { min: 1, max: 30 }).map((x, i) => c.str(x, `$.locales.enabled[${i}]`, { max: 12, pattern: /^[a-z]{2}(-[A-Z]{2})?$/, what: 'a locale' }))
    if (d && !en.includes(d)) c.fail('$.locales.enabled', 'must include the default locale')
  }

  const officeKeys: string[] = []
  for (const [i, o] of c.arr(top.offices, '$.offices', { min: 1, max: 6 }).entries()) {
    const p = `$.offices[${i}]`
    const off = c.obj(o, p, ['key', 'label', 'country', 'address', 'phones', 'timeZone', 'publicOnSite'])
    if (!off) continue
    const k = c.str(off.key, `${p}.key`, { pattern: KEY, what: 'a short key' })
    // The CRM stores the office as an enum with two slots (no migration yet): a manifest may only use those slot ids.
    if (k && !STORED_OFFICE_SLOTS.includes(k)) c.fail(`${p}.key`, `must be one of the stored office slots (${STORED_OFFICE_SLOTS.join(', ')}) until the generic office migration`)
    if (k) officeKeys.push(k)
    c.str(off.label, `${p}.label`, { max: 80 })
    c.str(off.country, `${p}.country`, { pattern: /^[A-Z]{2}$/, what: 'an ISO country code' })
    c.str(off.timeZone, `${p}.timeZone`, { max: 40, pattern: /^[A-Za-z_]+\/[A-Za-z_/-]+$|^UTC$/, what: 'an IANA time zone' })
    c.bool(off.publicOnSite, `${p}.publicOnSite`)
    const a = c.obj(off.address, `${p}.address`, ['lines', 'city', 'region', 'postalCode'])
    if (a) {
      c.arr(a.lines, `${p}.address.lines`, { min: 1, max: 5 }).forEach((l, j) => c.str(l, `${p}.address.lines[${j}]`, { max: 120 }))
      for (const f of ['city', 'region', 'postalCode']) c.str(a[f], `${p}.address.${f}`, { max: 80 })
    }
    for (const [j, ph] of c.arr(off.phones, `${p}.phones`, { max: 4 }).entries()) {
      const pp = c.obj(ph, `${p}.phones[${j}]`, ['display', 'tel'])
      if (pp) {
        c.str(pp.display, `${p}.phones[${j}].display`, { max: 40 })
        c.str(pp.tel, `${p}.phones[${j}].tel`, { pattern: TEL, what: 'a tel: link in E.164 form, like tel:+<country code><number>' })
      }
    }
  }
  c.unique(officeKeys, '$.offices')

  const routing = c.obj(top.routing, '$.routing', ['unknownCountry', 'rules', 'responsePromise'])
  if (routing) {
    const u = c.str(routing.unknownCountry, '$.routing.unknownCountry', { pattern: KEY })
    if (u && !officeKeys.includes(u)) c.fail('$.routing.unknownCountry', `is not an office key (${officeKeys.join(', ')})`)
    for (const [i, r] of c.arr(routing.rules, '$.routing.rules', { max: 60 }).entries()) {
      const rr = c.obj(r, `$.routing.rules[${i}]`, ['countries', 'office'])
      if (!rr) continue
      c.arr(rr.countries, `$.routing.rules[${i}].countries`, { min: 1, max: 300 }).forEach((x, j) => c.str(x, `$.routing.rules[${i}].countries[${j}]`, { pattern: /^[A-Z]{2}$/, what: 'an ISO country code' }))
      const o = c.str(rr.office, `$.routing.rules[${i}].office`, { pattern: KEY })
      if (o && !officeKeys.includes(o)) c.fail(`$.routing.rules[${i}].office`, 'is not an office key')
    }
    c.str(routing.responsePromise, '$.routing.responsePromise', { max: 200 })
  }

  const email = c.obj(top.email, '$.email', ['provider', 'mode', 'senders', 'replyDomain', 'signature', 'persona', 'library', 'sequences', 'inbound'])
  if (email) {
    c.oneOf(email.provider, '$.email.provider', ['workspace', 'stalwart'])
    c.oneOf(email.mode, '$.email.mode', ['off', 'test', 'live'])
    const rd = c.str(email.replyDomain, '$.email.replyDomain', { pattern: HOST, what: 'a host name' })
    if (rd) hosts.push(rd)
    for (const [i, s] of c.arr(email.senders, '$.email.senders', { min: 1, max: 10 }).entries()) {
      const ss = c.obj(s, `$.email.senders[${i}]`, ['id', 'displayName', 'address'])
      if (!ss) continue
      c.str(ss.id, `$.email.senders[${i}].id`, { pattern: KEY })
      c.str(ss.displayName, `$.email.senders[${i}].displayName`, { max: 80 })
      const a = c.str(ss.address, `$.email.senders[${i}].address`, { pattern: EMAIL, what: 'an email address' })
      if (a && EMAIL.test(a) && !hosts.includes(a.split('@')[1].toLowerCase())) c.fail(`$.email.senders[${i}].address`, 'must use the client\'s own domain (domains.canonical, an alias or email.replyDomain)')
    }
    const sig = c.obj(email.signature, '$.email.signature', ['name', 'lines'])
    if (sig) {
      c.str(sig.name, '$.email.signature.name', { max: 80 })
      c.arr(sig.lines, '$.email.signature.lines', { max: 6 }).forEach((l, i) => c.str(l, `$.email.signature.lines[${i}]`, { max: 120 }))
    }
    if (email.persona !== null) c.str(email.persona, '$.email.persona', { max: 80 })
    for (const k of ['library', 'sequences', 'inbound']) {
      const m = c.obj(email[k], `$.email.${k}`, ['enabled'])
      if (m) c.bool(m.enabled, `$.email.${k}.enabled`)
    }
    // A live-sending client must be able to send as someone: fail closed when mode is live but nothing authorises it.
    if (email.mode === 'live' && Array.isArray(email.senders) && email.senders.length === 0) c.fail('$.email.senders', 'live mode needs a sender')
  }

  const crm = c.obj(top.crm, '$.crm', ['pipelineStages', 'intakePurposes', 'rfqPrefix', 'modules'])
  if (crm) {
    for (const k of ['pipelineStages', 'intakePurposes'] as const) {
      const keys: string[] = []
      for (const [i, s] of c.arr(crm[k], `$.crm.${k}`, { min: 1, max: 20 }).entries()) {
        const ss = c.obj(s, `$.crm.${k}[${i}]`, ['key', 'label'])
        if (!ss) continue
        const kk = c.str(ss.key, `$.crm.${k}[${i}].key`, { pattern: /^[A-Z][A-Z0-9_]{1,31}$/, what: 'an upper case key' })
        if (kk) keys.push(kk)
        c.str(ss.label, `$.crm.${k}[${i}].label`, { max: 60 })
      }
      c.unique(keys, `$.crm.${k}`)
    }
    c.str(crm.rfqPrefix, '$.crm.rfqPrefix', { pattern: /^[A-Z]{2,6}-$/, what: 'letters then a dash, like RFQ-' })
    const m = c.obj(crm.modules, '$.crm.modules', ['library', 'sequences', 'attachments', 'api', 'sheets', 'typeform'])
    if (m) for (const k of Object.keys(m)) c.bool(m[k], `$.crm.modules.${k}`)
    const mods = m as Record<string, unknown> | null
    const em = email as Record<string, { enabled?: unknown }> | null
    if (mods && em?.library && typeof em.library === 'object' && mods.library !== em.library.enabled) c.fail('$.crm.modules.library', 'must match email.library.enabled')
    if (mods && em?.sequences && typeof em.sequences === 'object' && mods.sequences !== em.sequences.enabled) c.fail('$.crm.modules.sequences', 'must match email.sequences.enabled')
  }

  const site = c.obj(top.site, '$.site', ['modules', 'legal', 'sameAs', 'tracking'])
  if (site) {
    c.arr(site.modules, '$.site.modules', { min: 1, max: 30 }).forEach((x, i) => c.str(x, `$.site.modules[${i}]`, { pattern: /^[a-z][a-z-]{1,30}$/, what: 'a module name' }))
    const l = c.obj(site.legal, '$.site.legal', ['privacy', 'cookies', 'terms', 'accessibility'])
    if (l) for (const k of Object.keys(l)) c.bool(l[k], `$.site.legal.${k}`)
    const tr = c.obj(site.tracking, '$.site.tracking', ['analytics', 'ads'])
    if (tr) for (const k of Object.keys(tr)) c.bool(tr[k], `$.site.tracking.${k}`)
    c.arr(site.sameAs, '$.site.sameAs', { max: 20 }).forEach((x, i) => c.str(x, `$.site.sameAs[${i}]`, { pattern: /^https:\/\//, what: 'an https URL' }))
  }

  const seo = c.obj(top.seo, '$.seo', ['rankingUrlContract'])
  if (seo && seo.rankingUrlContract !== null) c.str(seo.rankingUrlContract, '$.seo.rankingUrlContract', { max: 200 })

  const ops = c.obj(top.ops, '$.ops', ['imageName', 'backupTarget', 'scannerAllowlist', 'secretsRef'])
  if (ops) for (const k of Object.keys(ops)) c.str(ops[k], `$.ops.${k}`, { max: 200 })

  const review = c.obj(top.review, '$.review', ['allowedOverlap', 'overlapNotes'], ['allowedOverlap'])
  if (review) {
    const allowed = c.arr(review.allowedOverlap, '$.review.allowedOverlap', { max: 50 })
    allowed.forEach((x, i) => c.str(x, `$.review.allowedOverlap[${i}]`, { max: 120 }))
    const notes = review.overlapNotes === undefined ? [] : c.arr(review.overlapNotes, '$.review.overlapNotes', { max: 20 })
    notes.forEach((x, i) => c.str(x, `$.review.overlapNotes[${i}]`, { max: 400 }))
    // an allowed overlap is a decision about another client's strings: it must say why and where the evidence is
    if (allowed.length > 0 && notes.length === 0) c.fail('$.review.overlapNotes', 'is required when allowedOverlap is not empty: say why the strings are shared and cite the evidence')
  }

  return c.issues.length ? { ok: false, issues: c.issues } : { ok: true, manifest: top as unknown as Manifest }
}

export class ManifestError extends Error {
  readonly issues: Issue[]
  constructor(file: string, issues: Issue[]) {
    super(`Invalid manifest ${file}:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`)
    this.issues = issues
  }
}
