import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BAKED_MANIFEST } from '../baked'
import { buildClient, client, isBrowserBundle, ManifestError, resetClientCache, resolveClient } from '../index'

const repo = path.resolve(__dirname, '../../../../..')
const fromFile = (slug: string) => readFileSync(path.join(repo, 'clients', slug, 'manifest.json'), 'utf8')
const env = (o: Record<string, string>) => ({ ...o }) as unknown as NodeJS.ProcessEnv

describe('client() in the client-site fork', () => {
  it('is the baked client by default, and the baked manifest equals clients/<slug>/manifest.json', () => {
    const c = resolveClient(env({}))
    expect(c.slug).toBe('icst')
    expect(c.manifest).toEqual(JSON.parse(fromFile('icst')))
    expect(c.manifest).toBe(BAKED_MANIFEST)
    expect(c.origin).toBe('https://icsthailand.co.th')
    expect(c.offices.map((o) => o.key)).toEqual(['TH'])
    expect(c.officeKeyForCountry('US')).toBe('TH')
    expect(c.brandName('emailFrom')).toBe('ICST Sales Team')
  })

  it('another client needs its manifest JSON; fails closed on a missing, invalid or mismatched one', () => {
    expect(resolveClient(env({ CLIENT: 'example-industrial', CLIENT_MANIFEST_JSON: fromFile('example-industrial') })).slug).toBe('example-industrial')
    expect(() => resolveClient(env({ CLIENT: 'example-industrial' }))).toThrow(/CLIENT_MANIFEST_JSON/)
    expect(() => resolveClient(env({ CLIENT: 'example-industrial', CLIENT_MANIFEST_JSON: '{nope' }))).toThrow(ManifestError)
    expect(() => resolveClient(env({ CLIENT: 'example-industrial', CLIENT_MANIFEST_JSON: '{}' }))).toThrow(ManifestError)
    expect(() => resolveClient(env({ CLIENT: 'zzz-other', CLIENT_MANIFEST_JSON: fromFile('example-industrial') }))).toThrow(/CLIENT is "zzz-other"/)
    expect(() => resolveClient(env({ CLIENT: '../x' }))).toThrow(/valid client slug/)
  })

  it('client() is cached and the browser guard is exact (window without Node throws; window with Node does not)', () => {
    resetClientCache()
    expect(client()).toBe(client())
    expect(isBrowserBundle({ window: {}, process: undefined })).toBe(true)
    expect(isBrowserBundle({ window: {}, process: { versions: { node: '24.0.0' } } })).toBe(false)
    expect(isBrowserBundle({})).toBe(false)
  })

  it('buildClient is pure over a manifest', () => {
    const m = { ...BAKED_MANIFEST, routing: { ...BAKED_MANIFEST.routing, rules: [] } }
    expect(buildClient(m).officeKeyForCountry('JP')).toBe('TH')
  })
})
