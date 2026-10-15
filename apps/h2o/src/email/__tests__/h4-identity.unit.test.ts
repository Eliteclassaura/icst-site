import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildClient, DEFAULT_CLIENT, H2O_MANIFEST, resolveClient } from '../../client'
import type * as ClientNS from '../../client'
import { validateManifest } from '../../client/manifest'
import { DEFAULT_SALES_ADDRESS, DEFAULT_SENDER_NAME } from '../config'
import { identityOf, mailDomains } from '../client-identity'
import { profileNoticeText } from '../profile-notice'
import { senderDomains } from '../profiles'
import { salesAddressDomains } from '../routing'
import { MERGE_FIELDS, SEED_TEMPLATES } from '../templates'
import { STANDARD_SIGNATURE_DEFAULT } from '../../crm/globals/signatures'
import { ERS_DEFAULTS } from '../../crm/ers/settings'

/**
 * KIT-0 H4 (email identity): sender, sales address, signature, sender and sales domains, the profile notice sign-off and the
 * template identity text now come from the client manifest. For the default client every one of them must be exactly what it
 * was before (fingerprints of the values as they stood at the base, so this file names no company); for another client
 * nothing of the default client's identity may remain in what the modules export.
 */
const env = (o: Record<string, string> = {}): NodeJS.ProcessEnv => o as unknown as NodeJS.ProcessEnv
const NOENV = env()
const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
function manifestOf(slug: string) {
  const v = validateManifest(JSON.parse(read(path.join('../../clients', slug, 'manifest.json'))))
  if (!v.ok) throw new Error(`manifest of ${slug} invalid: ${JSON.stringify(v.issues)}`)
  return v.manifest
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// sha256(JSON.stringify(value)) of each value as it was at the base commit, before H4
const AT_BASE = {
  seedTemplates: 'ef68e8262c36d5c12c07dd976e2f4e98b9b411ec9b2e78530839829a4e4deae5',
  mergeFields: 'd5975d70b917faa765e5e145cd5cdf6e1e9cca42a716d45ffdb7b7d3436182ef',
  standardSignature: 'a593829b90d2620a731630db5bc90c13dbb71ba1234fc5f10a6748b7989f83d7',
  senderName: '7f60c781515b4b414b414b60b570bf1387814d06b586d76536a389ffb98c2fb1',
  salesAddress: '9244d3770449b1b47b93e37e2abc65ef8d2c9b97526fdf22b71f03cf8a21a230',
  senderDomains: '3d7a3ebcffe2a5d7b7225d19e2cc1d4acfb5fd70757e74c1b53ea12d822e3f28',
  salesDomains: '52459fc37da416715bdc7618330a71c2d4ed44d9b58896548787e30d55370e6e',
  profileNotice: 'cee555b4fdaa4e09f200e3cb38ff694788c21f2bd73e272020873e4e2152bc49',
  ersSignature: 'd226f2434bc6f8686726650f4fb7a2544776fa1ae0791ca3b957d0173bf9e3f9',
}

describe('the default client: every email identity value is exactly what it was', () => {
  it('seed templates T1–T6 and the sequence templates, merge-field hints, standard signature, default sender, sales address', () => {
    expect(sha(SEED_TEMPLATES)).toBe(AT_BASE.seedTemplates)
    expect(sha(MERGE_FIELDS)).toBe(AT_BASE.mergeFields)
    expect(sha(STANDARD_SIGNATURE_DEFAULT)).toBe(AT_BASE.standardSignature)
    expect(sha(DEFAULT_SENDER_NAME)).toBe(AT_BASE.senderName)
    expect(sha(DEFAULT_SALES_ADDRESS)).toBe(AT_BASE.salesAddress)
  })
  it('the sender and sales domain lists keep their content AND their order (the order is in the admin messages)', () => {
    expect(sha(senderDomains(NOENV))).toBe(AT_BASE.senderDomains)
    expect(sha(salesAddressDomains(NOENV))).toBe(AT_BASE.salesDomains)
  })
  it('the profile notice sign-off and the Revenue Engine default signature', () => {
    expect(sha(profileNoticeText('saved', 'Main', 'an admin', '2026-10-15'))).toBe(AT_BASE.profileNotice)
    expect(sha(ERS_DEFAULTS.signature)).toBe(AT_BASE.ersSignature)
  })
  it('the environment settings still win over the manifest-derived domain defaults', () => {
    expect(senderDomains(env({ H2O_EMAIL_SENDER_DOMAINS: 'a.example, B.example' }))).toEqual(['a.example', 'b.example'])
    expect(salesAddressDomains(env({ H2O_SALES_ADDRESS_DOMAINS: 'c.example' }))).toEqual(['c.example'])
  })
  it('the model of the default client from its manifest FILE equals the in-code one', () => {
    expect(identityOf(buildClient(manifestOf(DEFAULT_CLIENT)))).toEqual(identityOf(buildClient(H2O_MANIFEST)))
  })
})

describe('domain lists from a manifest', () => {
  const c = (canonical: string, aliases: string[]) => buildClient({ ...H2O_MANIFEST, domains: { ...H2O_MANIFEST.domains, canonical, aliases } })
  it('drops www., drops duplicates and the canonical domain from the aliases, and fixes the order by rule', () => {
    const d = mailDomains(c('https://example.test', ['www.example.test', 'Alias.example', 'www.alias.example', 'other.example']))
    expect(d).toEqual({ canonical: 'example.test', aliases: ['alias.example', 'other.example'] })
    const id = identityOf(c('https://example.test', ['alias.example', 'www.example.test']))
    expect(id.senderDomains).toEqual(['alias.example', 'example.test']) // aliases first, canonical last
    expect(id.salesDomains).toEqual(['example.test', 'alias.example']) // canonical first
    expect(id.host).toBe('example.test')
  })
  it('a client with no aliases has one domain in both lists', () => {
    const id = identityOf(c('https://only.example', []))
    expect(id.senderDomains).toEqual(['only.example'])
    expect(id.salesDomains).toEqual(['only.example'])
  })
})

describe('another client: nothing of the default client\'s identity remains in what the modules export', () => {
  afterEach(() => {
    vi.doUnmock('../../client')
    vi.resetModules()
  })
  async function loadAs(slug: string) {
    const manifest = manifestOf(slug)
    vi.resetModules()
    vi.doMock('../../client', async (orig) => ({ ...(await orig<typeof ClientNS>()), client: () => buildClient(manifest) }))
    return {
      manifest,
      config: await import('../config'),
      templates: await import('../templates'),
      profiles: await import('../profiles'),
      routing: await import('../routing'),
      notice: await import('../profile-notice'),
      signatures: await import('../../crm/globals/signatures'),
      ers: await import('../../crm/ers/settings'),
    }
  }
  const dflt = identityOf(buildClient(H2O_MANIFEST))
  // the default client's own distinctive values, built at run time (nothing is spelled out in this file)
  const theirs = [dflt.displayName, dflt.host, dflt.salesAddress, dflt.signature.name, ...dflt.senderDomains].map((v) => new RegExp(esc(v), 'i'))

  it('the exports follow the other client\'s manifest (its name, sender, sales address, domains, signature)', async () => {
    const x = await loadAs('icst')
    const id = identityOf(buildClient(x.manifest))
    expect(x.config.DEFAULT_SENDER_NAME).toBe(id.senderName)
    expect(x.config.DEFAULT_SALES_ADDRESS).toBe(id.salesAddress)
    expect(x.signatures.STANDARD_SIGNATURE_DEFAULT).toBe([id.signature.name, ...id.signature.lines].join('\n'))
    expect(x.profiles.senderDomains(NOENV)).toEqual(id.senderDomains)
    expect(x.routing.salesAddressDomains(NOENV)).toEqual(id.salesDomains)
    expect(x.ers.ERS_DEFAULTS.signature).toEqual({ signer: id.signature.name, email: id.salesAddress })
    expect(x.notice.profileNoticeText('saved', 'Main', 'an admin', '2026-10-15').endsWith(`\n\n${id.emailFrom}\n`)).toBe(true)
  })
  it('the T1–T6 text and every default the modules export contain none of the default client\'s identity', async () => {
    const x = await loadAs('icst')
    const texts = [
      JSON.stringify(x.templates.SEED_TEMPLATES.filter((t) => /^T[1-6]$/.test(t.code))),
      JSON.stringify(x.templates.MERGE_FIELDS),
      x.config.DEFAULT_SENDER_NAME,
      x.config.DEFAULT_SALES_ADDRESS,
      x.signatures.STANDARD_SIGNATURE_DEFAULT,
      x.profiles.senderDomains(NOENV).join(','),
      x.routing.salesAddressDomains(NOENV).join(','),
      JSON.stringify(x.ers.ERS_DEFAULTS.signature),
      x.notice.profileNoticeText('saved', 'Main', 'an admin', '2026-10-15'),
    ]
    for (const t of texts) for (const re of theirs) expect(re.test(t), `${re} in ${t.slice(0, 80)}`).toBe(false)
  })
  it('T1 says the other client\'s own name, short name and domain', async () => {
    const x = await loadAs('icst')
    const id = identityOf(buildClient(x.manifest))
    const t1 = x.templates.SEED_TEMPLATES.find((t) => t.code === 'T1')!
    expect(t1.body).toContain(`Thank you for contacting ${id.displayName}.`)
    expect(t1.body).toContain(`The ${id.shortName} team\n${id.displayName} (${id.shortName})`)
    const t4 = x.templates.SEED_TEMPLATES.find((t) => t.subject.includes('proposal'))!
    expect(t4.subject).toBe(`Your ${id.shortName} proposal: RFQ {{rfq_number}}`)
    expect(x.templates.SEED_TEMPLATES.some((t) => t.body.includes(`through ${id.host}.`))).toBe(true)
  })
})

describe('the Email Library seed follows the client\'s library switch', () => {
  afterEach(() => {
    vi.doUnmock('../../client')
    vi.resetModules()
  })
  it('the default client plans its rows; a client with the library off plans none', async () => {
    const { planRows } = await import('../../crm/library/import')
    expect(planRows().length).toBeGreaterThan(80)
    const off = buildClient({ ...H2O_MANIFEST, crm: { ...H2O_MANIFEST.crm, modules: { ...H2O_MANIFEST.crm.modules, library: false } } })
    vi.resetModules()
    vi.doMock('../../client', async (orig) => ({ ...(await orig<typeof ClientNS>()), client: () => off }))
    const mod = await import('../../crm/library/import')
    expect(mod.planRows()).toEqual([])
  })
})

describe('no client\'s identity is spelled out in the code H4 moved', () => {
  const files = ['src/email/config.ts', 'src/email/profiles.ts', 'src/email/routing.ts', 'src/email/routing-read.ts', 'src/email/profile-notice.ts', 'src/email/templates.ts', 'src/crm/globals/signatures.ts', 'src/crm/globals/ers-settings.ts', 'src/crm/ers/settings.ts']
  const dflt = identityOf(buildClient(H2O_MANIFEST))
  it('none of the default client\'s name, short name as a word, domain, sales address or team name is in these files', () => {
    const res = [dflt.displayName, dflt.host, dflt.salesAddress, dflt.signature.name].map((v) => new RegExp(esc(v), 'i'))
    res.push(new RegExp(`\\b${esc(dflt.shortName)}\\b`))
    for (const f of files) for (const re of res) expect(re.test(read(f)), `${re} in ${f}`).toBe(false)
  })
  it('the standard resolver still returns the default client for an unset or default CLIENT', () => {
    expect(resolveClient(NOENV).slug).toBe(DEFAULT_CLIENT)
  })
})
