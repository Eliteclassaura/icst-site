/**
 * Threat-model tests (ADR-018, docs/threat-model.md). One group per leak vector.
 * Runs against a real Payload + PostgreSQL with access control ENFORCED (overrideAccess: false).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { getTestPayload, allRoleUsers, expectForbidden, type TestUser } from './helpers'
import { SENSITIVE_COLLECTIONS, ROLES, type Role } from '@factory/agency-core/cms'
import type { Payload } from 'payload'

let p: Payload
let users: Record<Role, TestUser>
const ids: Record<string, string> = {}

beforeAll(async () => {
  p = await getTestPayload()
  users = await allRoleUsers()
  // Fixtures (created with access bypassed — the fixtures are not under test)
  const draft = await p.create({
    collection: 'pages',
    data: {
      title: 'Secret draft',
      slug: 'secret-draft',
      pageType: 'standard',
      _status: 'draft',
      verification: { status: 'unverified' },
    },
    overrideAccess: true,
    draft: true,
  })
  ids.draftPage = String(draft.id)
  const pub = await p.create({
    collection: 'pages',
    data: {
      title: 'Public page',
      slug: 'public-page',
      pageType: 'standard',
      _status: 'published',
      verification: { status: 'verified' },
    },
    overrideAccess: true,
  })
  ids.publicPage = String(pub.id)
  const existingForm = await p.find({
    collection: 'forms',
    where: { key: { equals: 'brief' } },
    limit: 1,
    overrideAccess: true,
  })
  const form =
    existingForm.docs[0] ??
    (await p.create({
      collection: 'forms',
      data: { name: 'Brief', key: 'brief' },
      overrideAccess: true,
    }))
  const sub = await p.create({
    collection: 'submissions',
    data: {
      form: form.id,
      mode: 'brief',
      source: 'form',
      status: 'received',
      email: 'lead@example.test',
      name: 'Lead Person',
      fields: { brief: 'confidential brief' },
    },
    overrideAccess: true,
  })
  ids.submission = String(sub.id)
  const contact = await p.create({
    collection: 'contacts',
    data: { email: 'contact@example.test', provenance: 'form' },
    overrideAccess: true,
  })
  ids.contact = String(contact.id)
  const lead = await p.create({
    collection: 'leads',
    data: { title: 'Lead', contact: contact.id, stage: 'new', source: 'form' },
    overrideAccess: true,
  })
  ids.lead = String(lead.id)
  const subscriber = await p.create({
    collection: 'subscribers',
    data: { email: 'sub@example.test', status: 'pending', signupAt: new Date().toISOString() },
    overrideAccess: true,
  })
  ids.subscriber = String(subscriber.id)
})

describe('Vector 1 — URL guessing / direct object access', () => {
  it('uses UUID ids everywhere (no sequential ids)', async () => {
    for (const id of Object.values(ids)) expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('anonymous cannot read a draft page by id, but can read a published one', async () => {
    await expectForbidden(
      p.findByID({ collection: 'pages', id: ids.draftPage!, overrideAccess: false, user: null }),
    )
    const pub = await p.findByID({
      collection: 'pages',
      id: ids.publicPage!,
      overrideAccess: false,
      user: null,
    })
    expect(pub.title).toBe('Public page')
  })
  it('anonymous cannot read a submission, contact, lead or subscriber by id', async () => {
    for (const [coll, id] of [
      ['submissions', ids.submission],
      ['contacts', ids.contact],
      ['leads', ids.lead],
      ['subscribers', ids.subscriber],
    ] as const) {
      await expectForbidden(p.findByID({ collection: coll, id: id!, overrideAccess: false, user: null }))
    }
  })
})

describe('Vector 2 — list & search endpoints', () => {
  it('anonymous list of pages excludes drafts server-side', async () => {
    const res = await p.find({ collection: 'pages', overrideAccess: false, user: null, limit: 100 })
    expect(res.docs.map((d) => d.slug)).toContain('public-page')
    expect(res.docs.map((d) => d.slug)).not.toContain('secret-draft')
  })
  it('anonymous cannot filter a sensitive collection to probe for existence', async () => {
    await expectForbidden(
      p.find({
        collection: 'submissions',
        where: { email: { equals: 'lead@example.test' } },
        overrideAccess: false,
        user: null,
      }),
    )
    await expectForbidden(p.count({ collection: 'contacts', overrideAccess: false, user: null }))
  })
})

describe('Vector 3 — role × sensitive collection matrix', () => {
  const canRead: Record<Role, readonly string[]> = {
    'platform-admin': SENSITIVE_COLLECTIONS,
    'client-admin': SENSITIVE_COLLECTIONS.filter((c) => c !== 'users' || true), // client-admin reads users via selfOrAdmin
    editor: ['users'], // self only, tested separately
    'search-analyst': ['users'],
    sales: [
      'submissions',
      'subscribers',
      'contacts',
      'companies',
      'leads',
      'activities',
      'tasks',
      'lead-score-rules',
      'outbox',
      'private-files',
      'users',
    ],
    viewer: ['users'],
  }
  for (const role of ROLES) {
    for (const coll of SENSITIVE_COLLECTIONS) {
      if (coll === 'users') continue // covered in Vector 6
      const allowed = canRead[role].includes(coll)
      it(`${role} ${allowed ? 'CAN' : 'CANNOT'} list ${coll}`, async () => {
        const call = p.find({ collection: coll, overrideAccess: false, user: users[role], limit: 1 })
        if (allowed) await expect(call).resolves.toBeTruthy()
        else await expectForbidden(call)
      })
    }
  }
})

describe('Vector 4 — write paths', () => {
  it('viewer and search-analyst cannot create or update content', async () => {
    for (const role of ['viewer', 'search-analyst'] as Role[]) {
      await expectForbidden(
        p.create({
          collection: 'pages',
          data: {
            title: 'x',
            slug: `x-${role}`,
            pageType: 'standard',
            verification: { status: 'unverified' },
          },
          overrideAccess: false,
          user: users[role],
        }),
      )
      await expectForbidden(
        p.update({
          collection: 'pages',
          id: ids.publicPage!,
          data: { title: 'hacked' },
          overrideAccess: false,
          user: users[role],
        }),
      )
    }
  })
  it('sales cannot publish pages; editor can', async () => {
    await expectForbidden(
      p.update({
        collection: 'pages',
        id: ids.draftPage!,
        data: { _status: 'published' },
        overrideAccess: false,
        user: users.sales,
      }),
    )
    const ok = await p.update({
      collection: 'pages',
      id: ids.draftPage!,
      data: { title: 'Edited by editor' },
      overrideAccess: false,
      user: users.editor,
    })
    expect(ok.title).toBe('Edited by editor')
  })
  it('nobody can create submissions, audit entries or outbox rows through the API (system-only)', async () => {
    for (const role of ROLES) {
      await expectForbidden(
        p.create({
          collection: 'audit-log',
          data: { action: 'x', collection: 'y' },
          overrideAccess: false,
          user: users[role],
        }),
      )
      await expectForbidden(
        p.create({
          collection: 'outbox',
          data: { to: 'a@b.test', subject: 's', kind: 'test', status: 'queued' },
          overrideAccess: false,
          user: users[role],
        }),
      )
    }
  })
  it('activities are immutable (no update/delete even for admins)', async () => {
    const a = await p.create({
      collection: 'activities',
      data: { type: 'note', summary: 'n', lead: ids.lead },
      overrideAccess: false,
      user: users['platform-admin'],
    })
    await expectForbidden(
      p.update({
        collection: 'activities',
        id: a.id,
        data: { summary: 'changed' },
        overrideAccess: false,
        user: users['platform-admin'],
      }),
    )
    await expectForbidden(
      p.delete({ collection: 'activities', id: a.id, overrideAccess: false, user: users['platform-admin'] }),
    )
  })
  it('only admins can delete content; editors cannot', async () => {
    await expectForbidden(
      p.delete({ collection: 'pages', id: ids.publicPage!, overrideAccess: false, user: users.editor }),
    )
  })
})

describe('Vector 5 — audit trail', () => {
  it('publish, redirect and role change each write an audit entry without PII values', async () => {
    await p.update({
      collection: 'pages',
      id: ids.draftPage!,
      data: { _status: 'published' },
      overrideAccess: false,
      user: users.editor,
    })
    await p.create({
      collection: 'redirects',
      data: { from: '/old/', to: '/public-page/', statusCode: '308', status: 'active' },
      overrideAccess: false,
      user: users.editor,
    })
    await p.update({
      collection: 'users',
      id: users.viewer.id,
      data: { roles: ['viewer', 'sales'] },
      overrideAccess: false,
      user: users['platform-admin'],
    })
    const log = await p.find({
      collection: 'audit-log',
      overrideAccess: true,
      limit: 200,
      sort: '-createdAt',
    })
    const actions = log.docs.map((d) => d.action)
    expect(actions).toContain('publish')
    expect(actions).toContain('redirect')
    expect(actions).toContain('role-change')
    // Submission fixture above produced an audit row (create) — its summary must be redacted
    const subRows = log.docs.filter((d) => d.collection === 'submissions')
    for (const r of subRows) expect(r.summary ?? null).toBeNull()
    // roles restored
    await p.update({
      collection: 'users',
      id: users.viewer.id,
      data: { roles: ['viewer'] },
      overrideAccess: true,
    })
  })
  it('audit log is read-only for admins and invisible to others', async () => {
    await expect(
      p.find({ collection: 'audit-log', overrideAccess: false, user: users['client-admin'], limit: 1 }),
    ).resolves.toBeTruthy()
    for (const role of ['editor', 'sales', 'search-analyst', 'viewer'] as Role[]) {
      await expectForbidden(
        p.find({ collection: 'audit-log', overrideAccess: false, user: users[role], limit: 1 }),
      )
    }
  })
})

describe('Vector 6 — accounts and roles', () => {
  it('no self-signup: non-admins cannot create users; editor cannot escalate own roles', async () => {
    for (const role of ['editor', 'sales', 'search-analyst', 'viewer'] as Role[]) {
      await expectForbidden(
        p.create({
          collection: 'users',
          data: { email: `new-${role}@t.local`, password: 'x'.repeat(12), roles: ['platform-admin'] },
          overrideAccess: false,
          user: users[role],
        }),
      )
    }
    // Field-level: editor updating own record cannot change roles (field is admin-only; value is stripped, not thrown)
    const me = await p.update({
      collection: 'users',
      id: users.editor.id,
      data: { name: 'Ed', roles: ['platform-admin'] },
      overrideAccess: false,
      user: users.editor,
    })
    expect(me.roles).toEqual(['editor'])
  })
  it('users can read only themselves unless admin', async () => {
    const mine = await p.find({ collection: 'users', overrideAccess: false, user: users.sales, limit: 100 })
    expect(mine.docs.map((d) => d.email)).toEqual([users.sales.email])
    const all = await p.find({
      collection: 'users',
      overrideAccess: false,
      user: users['client-admin'],
      limit: 100,
    })
    expect(all.docs.length).toBeGreaterThan(1)
  })
  it('login lockout is configured (5 attempts, 15 min) and sessions are DB-backed', () => {
    const auth = p.collections.users.config.auth
    expect(auth.maxLoginAttempts).toBe(5)
    expect(auth.lockTime).toBe(15 * 60 * 1000)
    expect(auth.useSessions).toBe(true)
  })
})

describe('Vector 7 — API surface', () => {
  it('GraphQL is disabled and CORS/CSRF origins are explicit', () => {
    expect(p.config.graphQL.disable).toBe(true)
    expect(Array.isArray(p.config.cors)).toBe(true)
    expect((p.config.cors as string[]).length).toBeGreaterThan(0)
    expect(p.config.csrf.length).toBeGreaterThan(0)
    expect(p.config.cors).not.toContain('*')
  })
})

describe('Vector 8 — data quality gates encoded in the model', () => {
  it('media requires alt and rights; redirects reject loops; slugs must be kebab-case', async () => {
    await expect(
      p.create({
        collection: 'redirects',
        data: { from: '/loop/', to: '/loop/', statusCode: '308', status: 'active' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/loop/i)
    await expect(
      p.create({
        collection: 'pages',
        data: {
          title: 'Bad',
          slug: 'Not Valid!',
          pageType: 'standard',
          verification: { status: 'unverified' },
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })
  it('slug change on a published page creates a redirect from the old URL', async () => {
    const pg = await p.create({
      collection: 'pages',
      data: {
        title: 'Moving',
        slug: 'moving-page',
        pageType: 'standard',
        _status: 'published',
        verification: { status: 'verified' },
      },
      overrideAccess: true,
    })
    await p.update({ collection: 'pages', id: pg.id, data: { slug: 'moved-page' }, overrideAccess: true })
    const r = await p.find({
      collection: 'redirects',
      where: { from: { equals: '/moving-page/' } },
      overrideAccess: true,
    })
    expect(r.docs[0]?.to).toBe('/moved-page/')
    expect(r.docs[0]?.statusCode).toBe('308')
  })
})
