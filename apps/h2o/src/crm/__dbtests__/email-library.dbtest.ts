import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { ensureTemplates } from '../settings/templates'
import { importLibrary, planRows } from '../library/import'
import { parseE1 } from '../library/parse-e1'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * EMAIL-LIB-1 against Postgres: the library import (exact copy, hash-compared against the source file), idempotent
 * re-import, versioning on a changed source, E2 skeletons never sendable, T-series linked without copying text,
 * immutability of imported copy, and read-only API access. Synthetic only; nothing sends.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
const srv = { overrideAccess: true as const, depth: 0 }
const LIB = 'crm-email-library' as never
const SOURCE = readFileSync(
  new URL('../library/data/source/E1_EXACT_SEQUENCE_STEPS_AND_COPY.md', import.meta.url),
  'utf8',
)
const rows = async () =>
  (await p.find({ collection: LIB, limit: 1000, pagination: false, ...srv })).docs as unknown as Doc[]

beforeAll(async () => {
  p = await payload()
  admin = await user('platform-admin')
  sales = await user('sales')
})
beforeEach(async () => {
  const { resetCrm: r } = await import('./harness')
  await r()
})
afterAll(async () => {
  await resetCrm()
})

describe('Email Library import', () => {
  it('imports every E1 step and E2 skeleton; the E1 copy is exactly the source', async () => {
    const rep = await importLibrary(p)
    expect(rep.dryRun).toBe(false)
    const all = await rows()
    const e1 = all.filter((r) => String(r.program).startsWith('E1.'))
    expect(e1).toHaveLength(64)
    expect(e1.filter((r) => r.type === 'EMAIL')).toHaveLength(40)
    expect(all.filter((r) => r.program === 'E2')).toHaveLength(24)
    // Stored text equals a fresh parse of the source file, and every variant string is a verbatim substring of it.
    const parsed = parseE1(SOURCE)
    for (const s of parsed) {
      const row = e1.find((r) => r.key === `${s.program}|${s.sequence}|${s.step}`)!
      expect(row, `${s.sequence}/${s.step}`).toBeTruthy()
      expect(row.copy_variants).toEqual(s.copy_variants)
      expect(row.subject_variants).toEqual(s.subject_variants)
      expect(row.role_variants).toEqual(s.role_copy_variants)
      expect(row.source_hash).toBe(s.source_hash)
      for (const v of [
        ...s.copy_variants,
        ...s.subject_variants,
        ...s.role_copy_variants.flatMap((r) => r.copy_variants),
      ])
        expect(SOURCE.includes(v)).toBe(true)
      expect(row.source_file_sha256).toBe(createHash('sha256').update(SOURCE).digest('hex'))
      expect(row.status).toBe('IMPORTED_EXACT')
    }
  })

  it('the contract recommends REQUIRED on every email; the default sequence mode is AUTO (owner ruling)', async () => {
    await importLibrary(p)
    const emails = (await rows()).filter((r) => r.type === 'EMAIL' && String(r.program).startsWith('E'))
    expect(emails.length).toBe(64)
    for (const r of emails) {
      expect(r.approval_recommended).toBe('REQUIRED')
      expect(r.approval_mode).toBe('AUTO')
    }
  })

  it('a dry run writes nothing and reports what would happen', async () => {
    const rep = await importLibrary(p, { dryRun: true })
    expect(rep.dryRun).toBe(true)
    expect(rep.create).toBeGreaterThanOrEqual(88)
    expect(await rows()).toHaveLength(0)
  })

  it('re-import is idempotent', async () => {
    await importLibrary(p)
    const first = (await rows()).length
    const again = await importLibrary(p)
    expect(again.create).toBe(0)
    expect(again.newVersion).toBe(0)
    expect((await rows()).length).toBe(first)
  })

  it('a changed source block becomes a new version; the original stays', async () => {
    await importLibrary(p)
    const planned = planRows()
    const key = planned.find((r) => String(r.key).startsWith('E1.1|'))!.key
    const row = (await rows()).find((r) => r.key === key)!
    // Pretend the stored row came from an older source: change its hash directly (trusted server write).
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
    const { sql } = await import('@payloadcms/db-postgres')
    await drizzle.execute(
      sql.raw(`UPDATE "crm_email_library" SET "source_hash" = 'stale' WHERE "id" = '${String(row.id)}'`),
    )
    const rep = await importLibrary(p)
    expect(rep.newVersion).toBe(1)
    const after = (await rows()).filter((r) => String(r.key).startsWith(key))
    expect(after).toHaveLength(2)
    const v2 = after.find((r) => r.version === 2)!
    expect(v2.key).toBe(`${key}#v2`)
    expect(v2.supersedes).toBe(row.id)
    expect(after.find((r) => r.version === 1)!.source_hash).toBe('stale')
  })

  it('E2 rows are skeletons and are never sendable', async () => {
    await importLibrary(p)
    const e2 = (await rows()).filter((r) => r.program === 'E2')
    for (const r of e2) {
      expect(r.status).toBe('SKELETON')
      expect(r.sendable).toBe(false)
    }
    // Even a trusted write cannot make a skeleton sendable.
    await expect(
      p.update({
        collection: LIB,
        id: String(e2[0]!.id),
        data: { sendable: true } as never,
        ...srv,
        context: { crmServer: {} },
      }),
    ).rejects.toThrow()
    expect(
      ((await p.findByID({ collection: LIB, id: String(e2[0]!.id), ...srv })) as unknown as Doc).sendable,
    ).toBe(false)
  })

  it('links the existing T-series templates without copying their text', async () => {
    await ensureTemplates(p)
    await importLibrary(p)
    const tseries = (await rows()).filter((r) => r.program === 'T-series')
    const codes = tseries.map((r) => r.sequence_code).sort()
    for (const c of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'E11_QUAL_1', 'E11_MISS_1'])
      expect(codes).toContain(c)
    for (const r of tseries) {
      expect(r.status).toBe('LINKED')
      expect(r.linked_template).toBeTruthy()
      expect(r.copy_variants).toEqual([])
    }
  })

  it('copy checks: the sign-off is a note, no email carries a phone, address or out-of-scope wording', async () => {
    await importLibrary(p)
    const emails = (await rows()).filter((r) => r.type === 'EMAIL' && String(r.program).startsWith('E1.'))
    const flags = emails.map(
      (r) => r.flags as { persona_signoff: boolean; scope: string[]; phone_or_address: boolean },
    )
    expect(flags.filter((f) => f.persona_signoff).length).toBeGreaterThan(30)
    expect(flags.every((f) => f.scope.length === 0)).toBe(true)
    expect(flags.every((f) => f.phone_or_address === false)).toBe(true)
    // The sign-off alone never raises a badge.
    expect(emails.every((r) => r.lint_badge !== 'BLOCKED')).toBe(true)
  })
})

describe('Email Library rules', () => {
  it('imported copy cannot change; an approval-mode change is allowed and audited', async () => {
    await importLibrary(p)
    const r = (await rows()).find((x) => x.type === 'EMAIL' && x.program === 'E1.1')!
    const ctx = { crmServer: {} }
    await expect(
      p.update({
        collection: LIB,
        id: String(r.id),
        data: { copy_variants: ['changed'] } as never,
        ...srv,
        context: ctx,
      }),
    ).rejects.toThrow(/cannot change/i)
    await p.update({
      collection: LIB,
      id: String(r.id),
      data: { approval_mode: 'REQUIRED' } as never,
      ...srv,
      context: ctx,
    })
    expect(
      ((await p.findByID({ collection: LIB, id: String(r.id), ...srv })) as unknown as Doc).approval_mode,
    ).toBe('REQUIRED')
    const audit = await p.find({
      collection: 'audit-log' as never,
      where: { collection: { equals: 'crm-email-library' } } as never,
      limit: 50,
      ...srv,
    })
    expect(audit.docs.length).toBeGreaterThan(0)
  })

  it('nobody can write through the API; CRM users can read', async () => {
    await importLibrary(p)
    const r = (await rows())[0]!
    for (const u of [admin, sales]) {
      await expect(
        p.create({
          collection: LIB,
          data: { key: 'x' } as never,
          user: u.user as never,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      await expect(
        p.update({
          collection: LIB,
          id: String(r.id),
          data: { approval_mode: 'REQUIRED' } as never,
          user: u.user as never,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      await expect(
        p.delete({ collection: LIB, id: String(r.id), user: u.user as never, overrideAccess: false }),
      ).rejects.toThrow()
    }
    const read = await p.find({ collection: LIB, limit: 5, user: sales.user as never, overrideAccess: false })
    expect(read.docs.length).toBeGreaterThan(0)
  })
})
