import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildClient, client, H2O_MANIFEST, ManifestError, resetClientCache, resolveClient } from '../index'

const repo = path.resolve(__dirname, '../../../../..')
const clientsDir = path.join(repo, 'clients')
const env = (o: Record<string, string>) => ({ ...o }) as NodeJS.ProcessEnv

describe('client() resolution', () => {
  it('defaults to H2O and returns exactly clients/h2o/manifest.json, with no file read', () => {
    const c = resolveClient(env({}))
    expect(c.slug).toBe('h2o')
    expect(c.manifest).toEqual(JSON.parse(readFileSync(path.join(clientsDir, 'h2o/manifest.json'), 'utf8')))
    expect(resolveClient(env({ CLIENT: 'h2o' })).manifest).toBe(H2O_MANIFEST)
  })

  it('returns today\'s H2O values: tenant ICS, origin, offices US/TH, RFQ- prefix, sender', () => {
    const c = resolveClient(env({}))
    expect(c.tenantKey).toBe('ICS')
    expect(c.origin).toBe('https://h2ocooling.com')
    expect(c.offices.map((o) => o.key)).toEqual(['US', 'TH'])
    expect(c.office('TH')?.timeZone).toBe('Asia/Bangkok')
    expect(c.rfqPrefix).toBe('RFQ-')
    expect(c.brandName('emailFrom')).toBe('ICS Sales Team')
    expect(c.defaultSender.address).toBe('sales@h2ocooling.com')
  })

  it('routes countries by the manifest: today\'s H2O rule (TH for Asia-Pacific, US otherwise and when unknown)', () => {
    const c = resolveClient(env({}))
    expect(c.officeKeyForCountry('th')).toBe('TH')
    expect(c.officeKeyForCountry('JP')).toBe('TH')
    expect(c.officeKeyForCountry('US')).toBe('US')
    expect(c.officeKeyForCountry('DE')).toBe('US')
    expect(c.officeKeyForCountry(null)).toBe('US')
    expect(c.officeKeyForCountry('not a code')).toBe('US')
  })

  const fromFile = (slug: string) => JSON.stringify(JSON.parse(readFileSync(path.join(clientsDir, slug, 'manifest.json'), 'utf8')))

  it('loads another client from CLIENT_MANIFEST_JSON (the build tooling puts clients/<slug>/manifest.json there)', () => {
    const c = resolveClient(env({ CLIENT: 'example-industrial', CLIENT_MANIFEST_JSON: fromFile('example-industrial') }))
    expect(c.slug).toBe('example-industrial')
    expect(c.origin).toBe('https://example.test')
    expect(c.officeKeyForCountry('GB')).toBe('TH')
    expect(c.officeKeyForCountry('FR')).toBe('TH')
    expect(c.officeKeyForCountry('ZA')).toBe('US')
    expect(c.moduleOn('library')).toBe(false)
    expect(resolveClient(env({ CLIENT: 'icst', CLIENT_MANIFEST_JSON: fromFile('icst') })).origin).toBe('https://icsthailand.co.th')
  })

  it('fails closed: no JSON, bad JSON, invalid manifest, slug mismatch or invalid slug throw ManifestError and never fall back to H2O', () => {
    expect(() => resolveClient(env({ CLIENT: 'icst' }))).toThrow(/CLIENT_MANIFEST_JSON/)
    expect(() => resolveClient(env({ CLIENT: 'icst', CLIENT_MANIFEST_JSON: '{nope' }))).toThrow(ManifestError)
    expect(() => resolveClient(env({ CLIENT: 'icst', CLIENT_MANIFEST_JSON: '{}' }))).toThrow(ManifestError)
    expect(() => resolveClient(env({ CLIENT: 'icst', CLIENT_MANIFEST_JSON: fromFile('example-industrial') }))).toThrow(/CLIENT is "icst"/)
    expect(() => resolveClient(env({ CLIENT: '../h2o' }))).toThrow(/valid client slug/)
  })

  it('client() is cached, and refuses to answer in a browser (a client bundle would answer with H2O)', () => {
    resetClientCache()
    expect(client()).toBe(client())
    resetClientCache()
    ;(globalThis as { window?: unknown }).window = {}
    try {
      expect(() => client()).toThrow(/server-side only/)
    } finally {
      delete (globalThis as { window?: unknown }).window
      resetClientCache()
    }
  })

  it('buildClient is pure over a manifest: no routing rule means everything goes to unknownCountry', () => {
    const m = { ...H2O_MANIFEST, routing: { ...H2O_MANIFEST.routing, rules: [], unknownCountry: 'TH' } }
    expect(buildClient(m).officeKeyForCountry('US')).toBe('TH')
  })
})
