/**
 * Migration foundations (ADR-028 §6–8, release-plan C6.5 prep): verification at publish, redirect
 * proposed|active semantics, migration provenance visibility, seo.lock field access.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload, allRoleUsers, type TestUser } from './helpers'
import type { Role } from '@factory/agency-core/cms'

let p: Payload
let users: Record<Role, TestUser>
const envBackup = process.env.VERIFICATION_ENFORCEMENT

beforeAll(async () => {
  p = await getTestPayload()
  users = await allRoleUsers()
})
afterEach(() => {
  if (envBackup === undefined) delete process.env.VERIFICATION_ENFORCEMENT
  else process.env.VERIFICATION_ENFORCEMENT = envBackup
})

const page = (slug: string, extra: Record<string, unknown> = {}) => ({
  title: `Page ${slug}`,
  slug,
  pageType: 'article' as const,
  layout: [],
  verification: { status: 'unverified' as const },
  ...extra,
})

describe('verification at publish (ADR-016 → ADR-028 §8)', () => {
  it('enforce: publishing an unverified page throws; verified publishes; drafts are never blocked', async () => {
    process.env.VERIFICATION_ENFORCEMENT = 'enforce'
    await expect(
      p.create({
        collection: 'pages',
        data: { ...page('unverified-pub'), _status: 'published' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/verification\.status/)
    const draft = await p.create({
      collection: 'pages',
      data: { ...page('unverified-draft'), _status: 'draft' },
      overrideAccess: true,
    })
    expect(draft._status).toBe('draft')
    const ok = await p.create({
      collection: 'pages',
      data: { ...page('verified-pub'), _status: 'published', verification: { status: 'verified' } },
      overrideAccess: true,
    })
    expect(ok._status).toBe('published')
  })
  it('warn: staging may publish unverified copy (recorded, not refused)', async () => {
    process.env.VERIFICATION_ENFORCEMENT = 'warn'
    const doc = await p.create({
      collection: 'pages',
      data: { ...page('unverified-warn'), _status: 'published' },
      overrideAccess: true,
    })
    expect(doc._status).toBe('published')
  })
})

describe('redirects: proposed | active (ADR-028 §6)', () => {
  it('defaults to proposed; a 410 needs no target; a non-410 without target is refused', async () => {
    // `status` omitted on purpose: the collection default must be `proposed`.
    const r = await p.create({
      collection: 'redirects',
      data: { from: '/p1/', to: '/x/', statusCode: '308' } as unknown as {
        from: string
        statusCode: '308'
        status: 'active'
      },
      overrideAccess: true,
    })
    expect(r.status).toBe('proposed')
    const gone = await p.create({
      collection: 'redirects',
      data: { from: '/gone1/', statusCode: '410', status: 'active' },
      overrideAccess: true,
    })
    expect(gone.to ?? null).toBeNull()
    await expect(
      p.create({
        collection: 'redirects',
        data: { from: '/p2/', statusCode: '308', status: 'active' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/target/)
  })
  it('a publisher renaming a published page creates an active slug-change redirect', async () => {
    const doc = await p.create({
      collection: 'pages',
      data: { ...page('rename-me'), _status: 'published', verification: { status: 'verified' } },
      overrideAccess: true,
    })
    await p.update({
      collection: 'pages',
      id: doc.id,
      data: { slug: 'renamed' },
      overrideAccess: true,
      user: users.editor,
    })
    const red = await p.find({
      collection: 'redirects',
      where: { from: { equals: '/rename-me/' } },
      overrideAccess: true,
    })
    expect(red.docs[0]?.status).toBe('active')
    expect(red.docs[0]?.source).toBe('slug-change')
    expect(red.docs[0]?.to).toBe('/renamed/')
  })
})

describe('provenance and lock fields', () => {
  it('migration group is not readable by non-admins or anonymous; seo.lock is admin-only to change', async () => {
    const doc = await p.create({
      collection: 'pages',
      data: {
        ...page('prov'),
        _status: 'published',
        verification: { status: 'verified' },
        migration: {
          sourceUrl: 'https://old.example.test/prov/',
          sourceSystem: 'static-html',
          originalWordCount: 120,
        },
        seo: { lock: true },
      },
      overrideAccess: true,
    })
    const anon = await p.findByID({ collection: 'pages', id: doc.id, overrideAccess: false, user: null })
    expect((anon as { migration?: unknown }).migration).toBeUndefined()
    const asEditor = await p.findByID({
      collection: 'pages',
      id: doc.id,
      overrideAccess: false,
      user: users.editor,
    })
    expect((asEditor as { migration?: unknown }).migration).toBeUndefined()
    const asAdmin = await p.findByID({
      collection: 'pages',
      id: doc.id,
      overrideAccess: false,
      user: users['platform-admin'],
    })
    expect(asAdmin.migration?.sourceUrl).toBe('https://old.example.test/prov/')

    // Editor cannot flip the lock (field access), admin can.
    const editorTry = await p.update({
      collection: 'pages',
      id: doc.id,
      data: { seo: { lock: false } },
      overrideAccess: false,
      user: users.editor,
    })
    expect(editorTry.seo?.lock).toBe(true)
    const adminTry = await p.update({
      collection: 'pages',
      id: doc.id,
      data: { seo: { lock: false } },
      overrideAccess: false,
      user: users['platform-admin'],
    })
    expect(adminTry.seo?.lock).toBe(false)
  })
  it('human edits stamp automation.lastHumanEditAt (conflict detection basis, R57)', async () => {
    const doc = await p.create({
      collection: 'pages',
      data: { ...page('stamp'), verification: { status: 'verified' } },
      overrideAccess: true,
    })
    const upd = await p.update({
      collection: 'pages',
      id: doc.id,
      data: { title: 'Edited by a person' },
      overrideAccess: true,
      user: users.editor,
    })
    expect(upd.automation?.lastHumanEditAt).toBeTruthy()
  })
})
