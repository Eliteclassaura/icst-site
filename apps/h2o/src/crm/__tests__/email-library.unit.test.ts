import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lintVariant } from '../library/lint'
import { parseE1, sequenceLabel } from '../library/parse-e1'
import { planRows } from '../library/import'
import { plural, t } from '../library/ui-strings'

const dir = new URL('../library/', import.meta.url)
const SOURCE = readFileSync(new URL('data/source/E1_EXACT_SEQUENCE_STEPS_AND_COPY.md', dir), 'utf8')
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

describe('E1 parser', () => {
  const steps = parseE1(SOURCE)
  it('finds every step: 21 sequences, 64 steps (40 email, 24 task)', () => {
    expect(steps).toHaveLength(64)
    expect(new Set(steps.map((s) => s.sequence)).size).toBe(21)
    expect(steps.filter((s) => s.type === 'EMAIL')).toHaveLength(40)
    expect(Object.fromEntries(['E1.1', 'E1.2', 'E1.3', 'E1.4'].map((p) => [p, steps.filter((s) => s.program === p).length]))).toEqual({ 'E1.1': 25, 'E1.2': 21, 'E1.3': 3, 'E1.4': 15 })
  })
  it('every email has copy, and every variant is a verbatim substring of the source', () => {
    for (const s of steps.filter((x) => x.type === 'EMAIL')) {
      const copy = [...s.copy_variants, ...s.role_copy_variants.flatMap((r) => r.copy_variants)]
      expect(copy.length, s.sequence).toBeGreaterThan(0)
      for (const v of [...copy, ...s.subject_variants]) expect(SOURCE.includes(v)).toBe(true)
    }
  })
  it('the stored hash is the hash of the exact source block', () => {
    const lines = SOURCE.split('\n')
    const s = steps[5]!
    const start = s.source_line - 1
    const end = lines.findIndex((l, i) => i > start && /^#{2,3} /.test(l))
    expect(sha(lines.slice(start, end === -1 ? undefined : end).join('\n'))).toBe(s.source_hash)
  })
  it('labels are sentence case, not the ALL_CAPS code', () => {
    expect(sequenceLabel('ICS_RFQ_RECEIPT_FIRST_RESPONSE')).toBe('RFQ receipt first response')
    expect(sequenceLabel('ICS_E1_4_PROJECT_DISCOVERY')).toBe('Project discovery')
  })
})

describe('library plan', () => {
  const rows = planRows()
  it('plans 64 E1 rows and 24 E2 skeletons; skeletons are never sendable', () => {
    expect(rows.filter((r) => String(r.data.program).startsWith('E1.'))).toHaveLength(64)
    const e2 = rows.filter((r) => r.data.program === 'E2')
    expect(e2).toHaveLength(24)
    expect(e2.every((r) => r.data.status === 'SKELETON' && r.data.sendable === false)).toBe(true)
  })
  it('the contract recommends REQUIRED for every email; the effective default is AUTO (owner ruling 2026-10-08)', () => {
    for (const r of rows.filter((x) => x.data.type === 'EMAIL')) {
      expect(r.data.approval_recommended).toBe('REQUIRED')
      expect(r.data.approval_mode).toBe('AUTO')
    }
  })
  it('keys are unique', () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })
})

describe('copy check', () => {
  it('a phone number or postal address is BLOCKED', () => {
    expect(lintVariant('Hello', 'Call us on +1 555 010 0199 today.').badge).toBe('BLOCKED')
    expect(lintVariant('Hello', 'Visit 100 Industrial Way Suite 4.').badge).toBe('BLOCKED')
  })
  it('HVAC and small-tower wording is flagged for review, never changed', () => {
    const l = lintVariant('Hello', 'We also service HVAC and small cooling towers.')
    expect(l.badge).toBe('REVIEW')
    expect(l.findings.some((f) => f.category === 'SCOPE_INDUSTRIAL_ONLY')).toBe(true)
  })
  it('the "– Rhonda" sign-off is an information note, not a warning', () => {
    const l = lintVariant('Project check', 'Hi {{first_name}}, a short question about your project. - Rhonda')
    expect(l.findings.find((f) => f.rule_id === 'ICS_OWNER_SIGNOFF_001')?.severity).toBe('INFO')
    expect(l.badge).toBe('PASS')
  })
  it('structural contract rules are reported as not evaluated, never as a pass', () => {
    expect(lintVariant('Hello', 'Hello there.').not_evaluated).toBeGreaterThan(0)
  })
})

describe('UI strings', () => {
  it('fills placeholders and plurals, and refuses an unknown key', () => {
    expect(t('ers.strip.off')).toBe('Engine off. Nothing will be sent.')
    expect(plural('ers.strip.on.senders', 1)).toBe('1 sender active')
    expect(plural('ers.strip.on.senders', 3)).toBe('3 senders active')
    expect(() => t('nope' as never)).toThrow()
  })
})

describe('the library cannot send', () => {
  it('no library module imports a transport, the outbox or the sequence engine', () => {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') || x.endsWith('.mts'))) {
      const src = readFileSync(new URL(f, dir), 'utf8')
      expect(src, f).not.toMatch(/email\/transport|outbox|ers\/engine|nodemailer|sendMail/)
    }
  })

  it('nothing under app/(crm)/crm/email-revenue imports a transport, the outbox or a mail sender', () => {
    const root = new URL('../../app/(crm)/crm/email-revenue/', import.meta.url)
    const walk = (d: URL): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(new URL(`${e.name}/`, d)) : /\.(ts|tsx)$/.test(e.name) ? [new URL(e.name, d).pathname] : [],
      )
    const files = walk(root)
    expect(files.length).toBeGreaterThan(8)
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/email\/transport|outbox|nodemailer|sendMail|outbox-worker/)
  })
})

describe('provenance', () => {
  it('the bundled E1 source text is byte-identical to the shipped file and matches its recorded hash', async () => {
    const { createHash } = await import('node:crypto')
    const { assertProvenance, SEED_SOURCES } = await import('../library/import')
    const md = readFileSync(new URL('../library/data/source/E1_EXACT_SEQUENCE_STEPS_AND_COPY.md', import.meta.url), 'utf8')
    const json = JSON.parse(readFileSync(new URL('../library/data/source/e1-source-text.json', import.meta.url), 'utf8')) as { text: string }
    expect(json.text).toBe(md)
    expect(createHash('sha256').update(md).digest('hex')).toBe(SEED_SOURCES['E1_EXACT_SEQUENCE_STEPS_AND_COPY.md'])
    expect(() => assertProvenance()).not.toThrow()
  })
})
