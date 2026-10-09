import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * ENGINE-SCOPE-1a (Auditor R2): an enrollment's status changes ONLY through `transition()` (row lock, legal table, one
 * transaction). This fails on any other update of `crm-enrollments` in the app.
 */
const root = new URL('../../', import.meta.url)
const walk = (rel: string): string[] =>
  readdirSync(new URL(rel, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${rel}${e.name}/`) : /\.(ts|tsx)$/.test(e.name) ? [`${rel}${e.name}`] : [],
  )
/** Generic helpers that take a collection as a parameter. Each is typed away from enrollments and must never name them (asserted below). */
const GENERIC_HELPERS = new Set(['crm/import/engine.ts', 'crm/workspace/mutations.ts', 'email/imap-cursor.ts', 'email/sending-settings.ts'])
const SKIP = /__tests__|__dbtests__|migrations\/|payload-types|ers\/transition\.ts$/

/** The balanced-parenthesis argument text of the call that opens at `open` (the index of its "("). */
const argsOf = (text: string, open: number): string => {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1)
  }
  return text.slice(open)
}
const WRITE_CALL = /\b(?:update|updateByID|updateOne|updateMany|upsert|delete|deleteByID|deleteOne)\s*\(/g
const literalSlug = /\bcollection:\s*(['"`])([^'"`$]+)\1/

/** Every write-shaped call in `text` that can reach crm-enrollments: named, a computed slug, or raw SQL. Order of keys is irrelevant. */
export function enrollmentWrites(text: string, generic = false): string[] {
  const bad: string[] = []
  const constant = (name: string) => new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=\\s*(['"])([^'"]+)\\1`).exec(text)?.[2]
  for (const m of text.matchAll(WRITE_CALL)) {
    const args = argsOf(text, m.index! + m[0].length - 1)
    const lit = literalSlug.exec(args)
    if (/crm-enrollments|crm_enrollments/.test(args)) bad.push(args.slice(0, 70).replace(/\s+/g, ' '))
    else if (/\bcollection\b/.test(args) && !lit) {
      // A slug held in a constant of this file is resolved; a generic helper's own parameter is allowed only in GENERIC_HELPERS.
      const ref = /\bcollection:\s*([A-Za-z_]\w*)\s*[,})]/.exec(args)?.[1]
      const resolved = ref ? constant(ref) : undefined
      if (resolved ? /crm-enrollments/.test(resolved) : !generic) bad.push(`computed slug: ${args.slice(0, 70).replace(/\s+/g, ' ')}`)
    }
  }
  if (/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?(?:public"?\."?)?crm_enrollments/i.test(text)) bad.push('raw SQL write to crm_enrollments')
  if (/\.update(?:One|Many)?\([^)]*crm_enrollments|drizzle[^;]{0,160}crm_enrollments[^;]{0,80}\.(?:update|set)\(/s.test(text)) bad.push('drizzle write to crm_enrollments')
  return bad
}

describe('who may write an enrollment', () => {
  it('no update of crm-enrollments outside ers/transition.ts', () => {
    const bad: string[] = []
    for (const f of walk('').filter((x) => !SKIP.test(x))) {
      const text = readFileSync(new URL(f, root), 'utf8')
      for (const b of enrollmentWrites(text, GENERIC_HELPERS.has(f))) bad.push(`${f}: ${b}`)
      if (GENERIC_HELPERS.has(f) && /crm-enrollments|crm_enrollments/.test(text)) bad.push(`${f}: a generic helper names enrollments`)
    }
    expect(bad).toEqual([])
  })

  it('the scan itself catches every shape the Auditor listed (N2)', () => {
    const shapes = [
      "await payload.update({ collection: 'crm-enrollments', id, data })",
      "await payload.update({ data: { status: 'X', nested: { a: 1 } }, id, collection: 'crm-enrollments' })",
      "await payload.updateByID({ collection: 'crm-enrollments', id, data })",
      "await payload.db.updateOne({ collection: 'crm-enrollments', id, data })",
      'await db.execute(sql`UPDATE crm_enrollments SET status = ${s}`)',
      'const slug = pick(); await payload.update({ collection: slug, id, data })',
      "await payload.update({ id, data, collection: `crm-${'enrollments'}` })",
    ]
    for (const s of shapes) expect(enrollmentWrites(s), s).not.toEqual([])
    expect(enrollmentWrites("await payload.update({ collection: 'crm-tasks', id, data: { status: 'DONE' } })")).toEqual([])
  })

  it('the transition table never lets EXITED or COMPLETED move', async () => {
    const { LEGAL } = await import('../ers/transition')
    expect(LEGAL.EXITED).toEqual([])
    expect(LEGAL.COMPLETED).toEqual([])
    expect(LEGAL.PAUSED).not.toContain('AWAITING_SEND')
  })
})
