/**
 * SEC-MAIN-1 (security audit R1; CT ruling: only a platform-admin manages platform-admins). Unit level, no database:
 * the users collection as the app registers it (shared Users + password email + CRM profile + two-factor), its
 * collection access, field access and beforeChange guards, called the way Payload's operations call them. REST,
 * GraphQL and the admin UI all reach users through those operations; the DB suite (`users-tier.dbtest.ts`) runs the
 * same cases through the real REST handlers and the Local API with access on.
 * Also: the first-user endpoints, the digest-pinned base image, the Typeform CSP gate, and the Main Low findings.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Forbidden, type CollectionConfig, type Field, type PayloadRequest } from 'payload'
import { Users, auditIp } from '@factory/agency-core/cms/foundation'
import { guardPlatformTier, tierFieldAccess, usersUpdate } from '@factory/agency-core/cms/kernel'
import { withMfa } from '../mfa/fields'
import { withCrmProfile } from '../../crm/userProfile'
import { withPasswordEmail } from '../password-email'
import { anyUserExists, isCreateFirstUserSegments, isFirstRegisterSlug, resetFirstUserCacheForTests } from '../first-user'
import { policyFor, payloadPublicPolicy, typeformCspApplies } from '../../proxy'
import { redirectLocation } from '../../redirect-location'
import { PublicRedirects } from '../../content/collections/public-redirects'
import { pageIndexGuard } from '../../collections/page-index'

type Doc = Record<string, unknown>
const APP = path.resolve(__dirname, '..', '..', '..')
const users = withMfa(withCrmProfile(withPasswordEmail(Users))) as CollectionConfig
const field = (name: string) => users.fields.find((f) => 'name' in f && f.name === name) as Field & { access?: Record<string, unknown> }

const PA = { id: 'pa-1', roles: ['platform-admin'] }
const PA2 = { id: 'pa-2', roles: ['platform-admin'] }
const CA = { id: 'ca-1', roles: ['client-admin'] }
const SALES = { id: 's-1', roles: ['sales'] }
const EDITOR = { id: 'e-1', roles: ['editor'] }
const TARGETS: Record<string, Doc> = { [PA.id]: PA, [PA2.id]: PA2, [CA.id]: CA, [SALES.id]: SALES, [EDITOR.id]: EDITOR }

const req = (user: Doc | null) =>
  ({
    user,
    t: ((k: string) => k) as never,
    payload: { findByID: vi.fn(async ({ id }: { id: string }) => TARGETS[id] ?? null) },
  }) as unknown as PayloadRequest

const update = (actor: Doc | null, id?: string) => (users.access!.update as (a: unknown) => unknown)({ req: req(actor), id })
const beforeChange = (actor: Doc | null, data: Doc, originalDoc?: Doc, operation: 'create' | 'update' = 'update') => {
  const r = req(actor)
  let d: Doc = { ...data }
  for (const h of users.hooks?.beforeChange ?? []) d = (h as (a: unknown) => Doc)({ data: d, originalDoc, operation, req: r, context: {}, collection: users }) ?? d
  return d
}
const fieldAccess = (name: string, op: 'create' | 'update', actor: Doc | null, doc?: Doc) =>
  (field(name).access?.[op] as (a: unknown) => boolean)({ req: req(actor), doc, siblingData: {}, data: {} })

describe('users: the platform-admin tier (collection access)', () => {
  it('is wired: update = usersUpdate, the beforeChange guard runs, delete stays platform-admin only', () => {
    expect(users.access!.update).toBe(usersUpdate)
    expect(users.hooks?.beforeChange).toContain(guardPlatformTier)
    expect((users.access!.delete as (a: unknown) => boolean)({ req: req(CA) })).toBe(false)
    expect((users.access!.delete as (a: unknown) => boolean)({ req: req(PA) })).toBe(true)
  })
  it('a client-admin is refused a platform-admin account by id (REST/GraphQL by id, admin UI document access)', async () => {
    expect(await update(CA, PA.id)).toBe(false)
    expect(await update(CA, SALES.id)).toBe(true)
    expect(await update(CA, CA.id)).toBe(true)
  })
  it('a platform-admin may update any account, including another platform-admin', async () => {
    expect(await update(PA, PA2.id)).toBe(true)
    expect(await update(PA, CA.id)).toBe(true)
  })
  it('others keep self-only access; anonymous none', async () => {
    expect(await update(SALES, PA.id)).toEqual({ id: { equals: SALES.id } })
    expect(await update(null, PA.id)).toBe(false)
  })
})

describe('users: the platform-admin tier (field access)', () => {
  it('roles: a client-admin may set roles on a non-platform account, not on a platform-admin account', () => {
    expect(field('roles').access?.update).toBe(tierFieldAccess)
    expect(fieldAccess('roles', 'update', CA, SALES)).toBe(true)
    expect(fieldAccess('roles', 'update', CA, PA)).toBe(false)
    expect(fieldAccess('roles', 'update', PA, PA2)).toBe(true)
    expect(fieldAccess('roles', 'update', SALES, SALES)).toBe(false)
  })
  it('two-factor reset: a client-admin on a non-platform account only; a platform-admin on anyone', () => {
    expect(field('mfa_reset').access?.update).toBe(tierFieldAccess)
    expect(fieldAccess('mfa_reset', 'update', CA, EDITOR)).toBe(true)
    expect(fieldAccess('mfa_reset', 'update', CA, PA)).toBe(false)
    expect(fieldAccess('mfa_reset', 'update', PA, PA2)).toBe(true)
  })
})

describe('users: the platform-admin tier (beforeChange guard, every path incl. bulk updates)', () => {
  it('a client-admin cannot grant platform-admin: on create, on another user, on themself', () => {
    expect(() => beforeChange(CA, { email: 'x@example.test', roles: ['platform-admin'] }, undefined, 'create')).toThrow(Forbidden)
    expect(() => beforeChange(CA, { roles: ['platform-admin', 'sales'] }, SALES)).toThrow(Forbidden)
    expect(() => beforeChange(CA, { roles: ['platform-admin'] }, CA)).toThrow(Forbidden)
  })
  it('a client-admin cannot change a platform-admin account: password, email, revoke, two-factor reset, any field', () => {
    for (const data of [{ password: 'Synthetic-New-1!' }, { email: 'new@example.test' }, { roles: ['viewer'] }, { mfa_reset: true }, { name: 'n' }])
      expect(() => beforeChange(CA, data, PA), JSON.stringify(data)).toThrow(Forbidden)
  })
  it('a client-admin still manages non-platform users (roles, password, two-factor reset)', () => {
    expect(beforeChange(CA, { roles: ['editor'], password: 'Synthetic-New-1!' }, SALES)).toMatchObject({ roles: ['editor'] })
    expect(beforeChange(CA, { mfa_reset: true }, EDITOR)).toMatchObject({ mfa_enabled: false, mfa_reset: false })
  })
  it('a platform-admin may grant, revoke and reset platform-admins', () => {
    expect(beforeChange(PA, { roles: ['platform-admin'] }, CA)).toMatchObject({ roles: ['platform-admin'] })
    expect(beforeChange(PA, { roles: ['client-admin'] }, PA2)).toMatchObject({ roles: ['client-admin'] })
    expect(beforeChange(PA, { mfa_reset: true }, PA2)).toMatchObject({ mfa_enabled: false })
  })
  it('server code without a user (seed, break-glass, two-factor service) is not affected', () => {
    expect(beforeChange(null, { roles: ['platform-admin'] }, undefined, 'create')).toMatchObject({ roles: ['platform-admin'] })
    expect(beforeChange(null, { mfa_failures: 1 }, PA)).toMatchObject({ mfa_failures: 1 })
  })
  it('a non-admin never resets two-factor (the earlier guard stays)', () => {
    expect(() => beforeChange(SALES, { mfa_reset: true }, SALES)).toThrow(/Only an admin/)
  })
})

describe('first-user endpoints are 404 once any user exists', () => {
  afterEach(() => resetFirstUserCacheForTests())
  it('matches exactly /api/users/first-register and /admin/create-first-user', () => {
    expect(isFirstRegisterSlug(['users', 'first-register'])).toBe(true)
    expect(isFirstRegisterSlug(['users', 'login'])).toBe(false)
    expect(isFirstRegisterSlug(['users', 'first-register', 'x'])).toBe(false)
    expect(isCreateFirstUserSegments(['create-first-user'])).toBe(true)
    expect(isCreateFirstUserSegments(['login'])).toBe(false)
    expect(isCreateFirstUserSegments(undefined)).toBe(false)
  })
  it('one count until a user is seen, then cached; an empty table leaves the bootstrap open', async () => {
    const empty = { count: vi.fn(async () => ({ totalDocs: 0 })) }
    expect(await anyUserExists(empty as never)).toBe(false)
    const one = { count: vi.fn(async () => ({ totalDocs: 1 })) }
    expect(await anyUserExists(one as never)).toBe(true)
    expect(await anyUserExists(one as never)).toBe(true)
    expect(one.count).toHaveBeenCalledTimes(1)
    expect(one.count).toHaveBeenCalledWith({ collection: 'users', overrideAccess: true })
  })
  it('the REST route and the admin page check it before Payload sees the request', () => {
    const route = readFileSync(path.join(APP, 'src/app/(payload)/api/[...slug]/route.ts'), 'utf8')
    for (const m of ['GET', 'POST', 'DELETE', 'PATCH', 'PUT', 'OPTIONS']) expect(route).toContain(`export const ${m} = guarded(REST_${m}(config))`)
    expect(route).toMatch(/isFirstRegisterSlug\(slug\) && \(await anyUserExists\(/)
    const page = readFileSync(path.join(APP, 'src/app/(payload)/admin/[[...segments]]/page.tsx'), 'utf8')
    expect(page).toMatch(/const payload = await getPayload\(\{ config \}\)/)
    expect(page).toMatch(/isCreateFirstUserSegments\(segments\) && \(await anyUserExists\(payload\)\)\) notFound\(\)/)
  })
})

describe('the runtime base image is pinned by digest', () => {
  const docker = readFileSync(path.join(APP, 'Dockerfile.runtime'), 'utf8')
  it('NODE_IMAGE defaults to node:22.22.2-bookworm-slim at a sha256 digest', () => {
    expect(docker).toMatch(/^ARG NODE_IMAGE=node:22\.22\.2-bookworm-slim@sha256:[0-9a-f]{64}$/m)
    expect(docker).toContain('FROM ${NODE_IMAGE} AS base')
  })
  it('the slim-image contract is untouched: salmon/documents stays out of the build context', () => {
    const ignore = readFileSync(path.join(APP, 'Dockerfile.runtime.dockerignore'), 'utf8')
    expect(ignore).toMatch(/content\/salmon\/documents/)
  })
})

describe('Typeform CSP allowance only while the Typeform fallback can render (CT ruling, L01 option a)', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })
  it('native intake on: no form.typeform.com in either policy', () => {
    process.env.H2O_NATIVE_INTAKE = 'on'
    expect(typeformCspApplies()).toBe(false)
    expect(policyFor([]).policy).not.toContain('typeform')
    expect(payloadPublicPolicy('n0nce', '/')).not.toContain('typeform')
  })
  it('native intake off (the fallback): the allowance is merged as before', () => {
    process.env.H2O_NATIVE_INTAKE = 'off'
    expect(policyFor([])).toMatchObject({ merged: true })
    expect(policyFor([]).policy).toContain('frame-src')
    expect(policyFor([]).policy).toContain('https://form.typeform.com')
    expect(payloadPublicPolicy('n0nce', '/')).toContain('https://form.typeform.com')
  })
})

describe('Main Lows', () => {
  it('redirect.backslash-open-redirect: the validator refuses a backslash or control character', () => {
    const validate = PublicRedirects.hooks!.beforeValidate![0] as (a: unknown) => unknown
    for (const destination of ['/\\evil.example', '/a\\b/', '/x\u0000y/', '/x\u007fy/'])
      expect(() => validate({ data: { source: '/old/', destination } }), JSON.stringify(destination)).toThrow(/site-relative/)
    expect(validate({ data: { source: '/old/', destination: '/new/' } })).toMatchObject({ destination: '/new/' })
  })
  it('redirect.backslash-open-redirect: the Location never leaves the site', () => {
    const r = { nextUrl: { origin: 'https://h2ocooling.com', search: '' } } as never
    expect(redirectLocation('/\\evil.example', r)).toBe('https://h2ocooling.com/')
    expect(redirectLocation('/guide/', r)).toBe('https://h2ocooling.com/guide/')
  })
  it('audit.ip-spoofable-and-raw: the audit IP follows TRUSTED_PROXY and is null when untrusted', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.9', 'cf-connecting-ip': '198.51.100.7' })
    expect(auditIp(h, {} as never)).toBeNull()
    expect(auditIp(h, { TRUSTED_PROXY: 'cloudflare' } as never)).toBe('198.51.100.7')
    expect(auditIp(new Headers({ 'cf-connecting-ip': 'not an ip' }), { TRUSTED_PROXY: 'cloudflare' } as never)).toBeNull()
    expect(auditIp(undefined)).toBeNull()
  })
  it('catalog.page-index-link-forgeable-on-update: no hand-made page link or authority id on an unindexed record', () => {
    const guard = pageIndexGuard({ seedOwned: ['title', 'page_route', 'source_route_id'], pageOwned: [], relations: ['page_route'], noun: 'product' })
    const run = (data: Doc, originalDoc: Doc | undefined, operation: 'create' | 'update', context: Doc = {}) =>
      (guard as (a: unknown) => unknown)({ data, originalDoc, operation, context, req: {} })
    expect(() => run({ source_route_id: 'SALMON-x' }, { id: 1, source_route_id: null }, 'update')).toThrow(/catalog seed/)
    expect(() => run({ page_route: 7 }, { id: 1, page_route: null }, 'update')).toThrow(/catalog seed/)
    expect(() => run({ source_route_id: 'SALMON-x' }, undefined, 'create')).toThrow(/catalog seed/)
    // an ordinary save of an unindexed record (unchanged empty link fields) and the seed itself still pass
    expect(run({ title: 'T', source_route_id: null, page_route: null }, { id: 1, source_route_id: null }, 'update')).toMatchObject({ title: 'T' })
    expect(run({ source_route_id: 'SALMON-x' }, undefined, 'create', { h2oCatalogSeed: true })).toMatchObject({ source_route_id: 'SALMON-x' })
  })
})
