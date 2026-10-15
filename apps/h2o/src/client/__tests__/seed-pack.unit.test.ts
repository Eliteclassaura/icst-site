import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'
import { officeCalendar } from '../../crm/offices'
import { HOLIDAY_SEED } from '../../crm/data/holidays'
import { ERS_DEFAULTS } from '../../crm/ers/settings'
import { vocabularyIssues } from '../../crm/client-vocabulary'
import { readEmailConfig } from '../../email/config'
import { scopeHits } from '../../email/scope-guard'
import { SEED_TEMPLATES } from '../../email/templates'
import { assertApprovedForProduction, FORM_NOTICE_SHA256, formNoticeStrings, noticeVersionOf, parseCopyTable, PENDING_MARKER, registryFromCopy } from '../../rfq-native/registry'
import { client } from '../index'
import type { Manifest } from '../manifest'
import { applySeedPack, routingRowsToAdd, SEED_ROUTING_COUNTRIES } from '../seed-pack'

/**
 * The ICST CRM seed pack (no database): templates seeded unapproved, the routing rows, the form notice pin and its production gate,
 * the copy table, the industrial-only scope, business hours and holidays. The real-database proof is in the delivery note.
 */
const repo = path.resolve(__dirname, '../../../../..')
const rfqDir = path.join(repo, 'clients', client().slug, 'content/rfq')
const notice = readFileSync(path.join(rfqDir, 'form-notice-source.md'))
const tsv = readFileSync(path.join(rfqDir, `${client().slug}-native-rfq-copy-r1.tsv`), 'utf8')
const other = JSON.parse(readFileSync(path.join(repo, 'clients/h2o/manifest.json'), 'utf8')) as Manifest
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('templates are seeded unapproved, and T1 is off', () => {
  it('every seed template (T1–T6 and the sequence templates) is unapproved', () => {
    expect(SEED_TEMPLATES.length).toBeGreaterThanOrEqual(6)
    for (const t of SEED_TEMPLATES) expect(t.approved, t.code).toBe(false)
    expect(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].every((c) => SEED_TEMPLATES.some((t) => t.code === c))).toBe(true)
  })
  it('the automatic acknowledgement (T1) is off by default and nothing is sent until approved', () => {
    expect(readEmailConfig({}).customerAck).toBe(false)
    expect(readEmailConfig({ H2O_EMAIL_CUSTOMER_ACK: 'on' }).customerAck).toBe(true) // the owner turns it on; templates still need approval
  })
  it('creating the seeds writes no approval and no approved hash', async () => {
    const created: Array<Record<string, unknown>> = []
    const payload = {
      find: async () => ({ docs: [] }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return data
      },
    } as unknown as Payload
    const { ensureTemplates } = await import('../../crm/settings/templates')
    await ensureTemplates(payload)
    expect(created.length).toBe(SEED_TEMPLATES.length)
    for (const d of created) {
      expect(d.approved).toBe(false)
      expect(d.approved_hash).toBeUndefined()
      expect(d.approved_at).toBeUndefined()
    }
  })
  it('the T1–T6 text and every seed template stay industrial cooling (no HVAC, rooftop unit, residential, small or packaged tower, air-conditioning wording)', () => {
    for (const t of SEED_TEMPLATES) expect(scopeHits(t.subject, t.body), t.code).toEqual([])
  })
})

describe('routing rows (Thailand, India, US, UK, Philippines, Malaysia, Singapore -> the single TH slot)', () => {
  const c = client()
  it('adds exactly the listed countries that are missing, each routed where the manifest sends it (the one office)', () => {
    expect([...SEED_ROUTING_COUNTRIES]).toEqual(['TH', 'IN', 'US', 'GB', 'PH', 'MY', 'SG'])
    const rows = routingRowsToAdd(c, [])
    expect(rows.map((r) => r.country_code)).toEqual(['TH', 'IN', 'US', 'GB', 'PH', 'MY', 'SG'])
    for (const r of rows) expect(r.office).toBe('TH')
  })
  it('keeps what an admin already set (any case) and never adds a duplicate', () => {
    const rows = routingRowsToAdd(c, [{ country_code: 'us' }, { country_code: 'IN' }])
    expect(rows.map((r) => r.country_code)).toEqual(['TH', 'GB', 'PH', 'MY', 'SG'])
    expect(routingRowsToAdd(c, SEED_ROUTING_COUNTRIES.map((country_code) => ({ country_code })))).toEqual([])
  })
  it('applySeedPack ensures the templates, appends only missing rows to the global and is a no-op the second time', async () => {
    let stored: Array<Record<string, unknown>> = [{ id: 'row1', country_code: 'US', office: 'TH', note: 'kept' }]
    const updates: Array<Record<string, unknown>> = []
    const payload = {
      find: async () => ({ docs: [] }),
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      findGlobal: async () => ({ routing_overrides: stored }),
      updateGlobal: async ({ data }: { data: { routing_overrides: Array<Record<string, unknown>> } }) => {
        updates.push(data)
        stored = data.routing_overrides
        return data
      },
    } as unknown as Payload
    const first = await applySeedPack(payload, client())
    expect(first.routingRowsAdded).toBe(6)
    expect(updates).toHaveLength(1)
    expect(updates[0]!.routing_overrides).toEqual([{ country_code: 'US', office: 'TH', note: 'kept' }, ...routingRowsToAdd(client(), [{ country_code: 'US' }])])
    const second = await applySeedPack(payload, client())
    expect(second.routingRowsAdded).toBe(0)
    expect(updates).toHaveLength(1)
  })
})

describe('Bangkok business hours and the Thai holiday seed', () => {
  it('the office calendar is Bangkok, the Revenue Engine window is 09:00 to 17:00 in the office zone, and only Thai holidays are seeded', () => {
    expect(officeCalendar('TH').zone).toBe('Asia/Bangkok')
    expect([ERS_DEFAULTS.windowStartHour, ERS_DEFAULTS.windowEndHour]).toEqual([9, 17])
    expect(new Set(HOLIDAY_SEED.map((h) => h.office))).toEqual(new Set(['TH']))
    expect(HOLIDAY_SEED.length).toBeGreaterThan(30)
  })
  it('the manifest\'s stages and purposes are all stored values', () => {
    expect(vocabularyIssues(client())).toEqual([])
  })
})

describe('the form notice is pinned, parses, and cannot go to production as a draft', () => {
  const text = notice.toString('utf8')
  it('the pin in the registry is the SHA-256 of the file as it stands', () => {
    expect(createHash('sha256').update(notice).digest('hex')).toBe(FORM_NOTICE_SHA256)
  })
  it('parses into the form strings (short notice with the Privacy Notice link, the expanded list), and still carries the pending-approval marker', () => {
    const s = formNoticeStrings(text)
    expect(s['privacy.note']).toContain('{{privacy_policy_link}}')
    expect(s['privacy.link_text']).toBe('Privacy Notice')
    expect(s['privacy.details.items'].split('\n').length).toBeGreaterThanOrEqual(3)
    expect(text).toContain(PENDING_MARKER)
  })
  it('names no other client\'s company, domain, address or phone', () => {
    for (const v of [other.client.displayName, other.client.shortName === 'ICS' ? 'Industrial Cooling Solutions Inc' : other.client.shortName, other.domains.canonical.replace(/^https?:\/\//, ''), ...other.offices.flatMap((o) => o.phones.map((p) => p.display))])
      expect(new RegExp(esc(v), 'i').test(text), v).toBe(false)
    expect(/\bICS\b/.test(text)).toBe(false)
  })
  it('PRODUCTION GATE: while the pending marker remains, the registry refuses to build under the production policy, and shows it on a private deploy', () => {
    expect(text.includes(PENDING_MARKER)).toBe(true) // today a draft; when counsel approves, remove the marker AND update FORM_NOTICE_SHA256
    const prod = { H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv
    expect(() => assertApprovedForProduction(tsv, text, prod)).toThrow(/COPY_PENDING_APPROVAL/)
    expect(() => assertApprovedForProduction(tsv, text, {} as NodeJS.ProcessEnv)).not.toThrow()
  })
})

describe('the intake copy table', () => {
  const strings = parseCopyTable(tsv)
  const reg = registryFromCopy(tsv, notice.toString('utf8'))
  it('builds a working registry (form and chat) with the client\'s name and the pinned notice version', () => {
    expect(reg.enabled).toBe(true)
    expect(reg.questions.length).toBeGreaterThan(10)
    expect(reg.purposes.length).toBe(7)
    expect(reg.noticeVersion).toBe(noticeVersionOf(reg.strings))
    expect(Object.values(strings).some((v) => v.includes(client().manifest.client.displayName))).toBe(true) // the panel subtitle
  })
  it('contains no other client\'s identity and no phone number or address in the error texts', () => {
    for (const v of [other.client.displayName, other.domains.canonical.replace(/^https?:\/\//, ''), other.email.senders[0]!.address, ...other.offices.flatMap((o) => o.phones.map((p) => p.display))])
      expect(new RegExp(esc(v), 'i').test(tsv), v).toBe(false)
    expect(/\bICS\b/.test(tsv)).toBe(false)
    for (const [k, v] of Object.entries(strings)) if (k.startsWith('err.')) expect(/\+?\d[\d\s().-]{6,}\d/.test(v), k).toBe(false)
  })
  it('every visitor-facing string stays industrial cooling', () => {
    for (const [k, v] of Object.entries(strings)) expect(scopeHits('', v), k).toEqual([])
  })
})
