import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetClientCache } from '../index'

/**
 * KIT-0 H1: the identity strings now come from client(). For H2O they must be exactly the strings that used to be written in the
 * files (zero visible difference); for another client they follow its manifest.
 */
const NEW_ENV = (slug: string) => ({ CLIENT: slug })

beforeEach(() => {
  resetClientCache()
  vi.resetModules()
})
afterEach(() => {
  vi.unstubAllEnvs()
  resetClientCache()
})

describe('H1 identity, H2O (default)', () => {
  it('admin brand: the same alt text, logos, emblem and title suffix as before', async () => {
    const m = await import('../../brand/admin-brand')
    expect(m.ADMIN_BRAND_ALT).toBe('ICS Industrial Cooling Solutions')
    expect(m.ADMIN_LOGO).toEqual({ light: '/brand/ics-logo-original.webp', dark: '/brand/ics-logo-white-transparent.png', width: 1000, height: 256 })
    expect(m.ADMIN_EMBLEM).toEqual({ src: '/brand/ics-emblem-favicon-source.png', width: 180, height: 180 })
    expect(m.adminTitleSuffix({ H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv)).toBe('· ICS admin')
    expect(m.adminTitleSuffix({} as unknown as NodeJS.ProcessEnv)).toBe('· ICS staging admin')
  })

  it('tenant key, site title and the admin notice sign-off are the old literals', async () => {
    const { client } = await import('../index')
    expect(client().tenantKey).toBe('ICS')
    expect(client().brandName('site')).toBe('Industrial Cooling Solutions')
    expect(client().brandName('emailFrom')).toBe('ICS Sales Team')
    const { noticeText } = await import('../../auth/mfa/admin-actions')
    const n = noticeText('reset', new Date('2026-10-15T12:00:00Z'))
    expect(n.text).toBe('Your two-step sign-in was reset by an administrator on 2026-10-15. You will be asked to set up two-step sign-in at your next sign-in.\n\nIf this wasn’t expected, contact your administrator.\n\nICS Sales Team\n')
  })
})

describe('H1 identity, another client', () => {
  it('follows the manifest: admin brand and title suffix for ICST', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const json = readFileSync(path.resolve(__dirname, '../../../../../clients/icst/manifest.json'), 'utf8')
    vi.stubEnv('CLIENT', NEW_ENV('icst').CLIENT)
    vi.stubEnv('CLIENT_MANIFEST_JSON', json)
    const m = await import('../../brand/admin-brand')
    expect(m.ADMIN_BRAND_ALT).toBe('ICST International Cooling Solutions (Thailand)')
    expect(m.ADMIN_LOGO.light).toBe('/brand/icst-light.svg')
    expect(m.adminTitleSuffix({ H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv)).toBe('· ICST admin')
    expect(m.adminTitleSuffix({} as unknown as NodeJS.ProcessEnv)).toBe('· ICST staging admin')
    const { client } = await import('../index')
    expect(client().tenantKey).toBe('ICST')
    const { noticeText } = await import('../../auth/mfa/admin-actions')
    expect(noticeText('turn-off', new Date('2026-10-15T12:00:00Z')).text.endsWith('\n\nICST Sales Team\n')).toBe(true)
  })
})
