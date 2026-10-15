import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildClient, client } from '../index'
import type { Manifest } from '../manifest'
import { applyIdentityStep, bakedColumns, parseDefault, quoteLiteral, standardSignatureText, type Exec } from '../identity-step'

/**
 * The post-migrate identity step (no database): what it reads, what it changes, that it is idempotent, and that a manifest value
 * can never break out of the DDL literal. The values the migrations baked in are read at run time from the other client's manifest
 * file, so this file names no company. The real fresh-database proof is `identity-step.dbtest.ts`.
 */
const repo = path.resolve(__dirname, '../../../../..')
const other = JSON.parse(readFileSync(path.join(repo, 'clients/h2o/manifest.json'), 'utf8')) as Manifest
const read = (rel: string) => readFileSync(path.join(repo, 'apps/h2o', rel), 'utf8')

type Call = { text: string; params: unknown[] }
/** A fake database: information_schema answers from `defaults`, every statement is recorded as text plus parameters. */
function fake(defaults: Record<string, string | null | undefined>, rowCount = 1) {
  const calls: Call[] = []
  const exec: Exec = {
    execute: async (q) => {
      let text = ''
      const params: unknown[] = []
      const walk = (chunks: unknown[]) => {
        for (const c of chunks) {
          if (c && typeof c === 'object' && Array.isArray((c as { queryChunks?: unknown }).queryChunks)) walk((c as { queryChunks: unknown[] }).queryChunks)
          else if (c && typeof c === 'object' && Array.isArray((c as { value?: unknown }).value)) text += ((c as { value: string[] }).value).join('')
          else {
            params.push(c)
            text += '?'
          }
        }
      }
      walk((q as unknown as { queryChunks: unknown[] }).queryChunks)
      calls.push({ text, params })
      if (/information_schema/.test(text)) {
        const key = `${params[0]}.${params[1]}`
        return { rows: key in defaults ? [{ column_default: defaults[key] }] : [] }
      }
      return { rowCount }
    },
  }
  return { exec, calls }
}
const asDefault = (v: string) => `'${v.replace(/'/g, "''")}'::character varying`
const oldDefaults = (m: Manifest): Record<string, string> => ({
  'crm_ers_settings.signature_signer': asDefault(m.email.signature.name),
  'crm_ers_settings.signature_email': asDefault(m.email.senders[0]!.address),
  'crm_suppressions.tenant': asDefault(m.client.tenantKey),
  'crm_intake_events.tenant': asDefault(m.client.tenantKey),
})

describe('parseDefault and quoteLiteral', () => {
  it('reads a plain string default and its cast; refuses anything else', () => {
    expect(parseDefault("'abc'::character varying")).toBe('abc')
    expect(parseDefault("'it''s'::character varying")).toBe("it's")
    expect(parseDefault("'x'")).toBe('x')
    for (const bad of [null, undefined, '', 'now()', 'true', "nextval('s'::regclass)", "'a' || 'b'"]) expect(parseDefault(bad as string | null), String(bad)).toBeNull()
  })
  it('doubles quotes, and refuses empty, long, control-character and backslash values', () => {
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'")
    for (const bad of ['', 'x'.repeat(301), 'a\nb', 'a\u0000b', 'a\\b', 'a\u007fb']) expect(() => quoteLiteral(bad), JSON.stringify(bad)).toThrow(/identity value/)
  })
})

describe('the step', () => {
  const c = client()
  it('rewrites each baked column default and only the rows still holding the old default, and the untouched signature row', async () => {
    const { exec, calls } = fake(oldDefaults(other))
    const report = await applyIdentityStep(exec, c)
    expect(report.columns.map((x) => `${x.table}.${x.column}:${x.state}`)).toEqual(bakedColumns(c).map((b) => `${b.table}.${b.column}:rewritten`))
    const text = calls.map((x) => x.text)
    for (const b of bakedColumns(c)) {
      expect(text).toContain(`ALTER TABLE "${b.table}" ALTER COLUMN "${b.column}" SET DEFAULT ${quoteLiteral(b.value)}`)
      const upd = calls.find((x) => x.text === `UPDATE "${b.table}" SET "${b.column}" = ? WHERE "${b.column}" = ?`)!
      expect(upd.params).toEqual([b.value, b.table === 'crm_ers_settings' && b.column === 'signature_signer' ? other.email.signature.name : b.column === 'signature_email' ? other.email.senders[0]!.address : other.client.tenantKey])
    }
    const sig = calls.find((x) => x.text.startsWith('UPDATE crm_signatures'))!
    expect(sig.text).toBe('UPDATE crm_signatures SET standard_text = ? WHERE standard_text <> ? AND updated_at = created_at')
    expect(sig.params).toEqual([standardSignatureText(c), standardSignatureText(c)])
    expect(report.signatureRowsUpdated).toBe(1)
  })
  it('is idempotent: when the defaults already hold the client\'s values nothing is altered or updated except the guarded signature statement', async () => {
    const now: Record<string, string> = {}
    for (const b of bakedColumns(c)) now[`${b.table}.${b.column}`] = asDefault(b.value)
    const { exec, calls } = fake(now, 0)
    const report = await applyIdentityStep(exec, c)
    expect(report.columns.every((x) => x.state === 'unchanged' && x.rowsUpdated === 0)).toBe(true)
    expect(calls.some((x) => /^ALTER/.test(x.text))).toBe(false)
    expect(calls.filter((x) => /^UPDATE/.test(x.text)).map((x) => x.text)).toEqual(['UPDATE crm_signatures SET standard_text = ? WHERE standard_text <> ? AND updated_at = created_at'])
    expect(report.signatureRowsUpdated).toBe(0)
  })
  it('skips a column the schema does not have, without failing', async () => {
    const d = oldDefaults(other)
    delete d['crm_suppressions.tenant']
    const report = await applyIdentityStep(fake(d).exec, c)
    expect(report.columns.find((x) => x.table === 'crm_suppressions')!.state).toBe('missing')
    expect(report.columns.filter((x) => x.state === 'rewritten').length).toBe(3)
  })
  it('a column with no default (or a computed one) gets the client\'s default but no row is rewritten', async () => {
    const { exec, calls } = fake({ ...oldDefaults(other), 'crm_ers_settings.signature_email': null })
    await applyIdentityStep(exec, c)
    expect(calls.some((x) => /ALTER COLUMN "signature_email" SET DEFAULT/.test(x.text))).toBe(true)
    expect(calls.some((x) => x.text.includes('UPDATE "crm_ers_settings" SET "signature_email"'))).toBe(false)
  })
  it('a client value with a quote cannot break out of the DDL literal', async () => {
    const m = JSON.parse(JSON.stringify(c.manifest)) as Manifest
    m.email.signature.name = "O'Brien Sales'; DROP TABLE users; --"
    const { exec, calls } = fake(oldDefaults(other))
    await applyIdentityStep(exec, buildClient(m))
    const ddl = calls.find((x) => /ALTER COLUMN "signature_signer"/.test(x.text))!
    expect(ddl.text).toBe(`ALTER TABLE "crm_ers_settings" ALTER COLUMN "signature_signer" SET DEFAULT 'O''Brien Sales''; DROP TABLE users; --'`)
  })
  it('refuses a client value that cannot be a safe literal, before running any DDL for it', async () => {
    const m = JSON.parse(JSON.stringify(c.manifest)) as Manifest
    m.email.signature.name = 'a\nb'
    const { exec, calls } = fake(oldDefaults(other))
    await expect(applyIdentityStep(exec, buildClient(m))).rejects.toThrow(/identity value/)
    expect(calls.some((x) => /^ALTER/.test(x.text))).toBe(false)
  })
})

describe('the step names no company', () => {
  it('none of the other client\'s name, domain, sales address or team name is in the step\'s source', () => {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const src = read('src/client/identity-step.ts') + read('src/client/identity-step.run.ts')
    for (const v of [other.client.displayName, other.email.senders[0]!.address, other.email.signature.name, other.domains.canonical.replace(/^https?:\/\//, '')])
      expect(new RegExp(esc(v), 'i').test(src), v).toBe(false)
  })
})
