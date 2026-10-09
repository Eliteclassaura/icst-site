import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The Email Revenue screens and their string tables use US English (OGCS ruling 2026-10-08): "enroll", "enrollment",
 * "canceled". This fails on the British forms anywhere in the ERS code and strings, including code comments and
 * labels. CSS class names that contain "enrol" after a hyphen are left alone.
 */
const root = new URL('../../', import.meta.url)
const walk = (rel: string): string[] => {
  const dir = new URL(rel, root)
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${rel}${e.name}/`) : /\.(ts|tsx|mts|tsv|json)$/.test(e.name) ? [`${rel}${e.name}`] : [],
  )
}
const SCOPE = [
  'app/(crm)/crm/email-revenue/',
  'app/(crm)/crm/sequences/',
  'app/(crm)/crm/settings/sequences/',
  'crm/ers/',
  'crm/seq/',
  'crm/library/',
]
const SKIP = /\/data\/(library-seed|source\/)/
const BRITISH = /(?<![-\w])[Ee]nrol(?:s|ment|ments)?(?![\w-])|\b[Cc]ancell(?:ed|ing)\b/

describe('US spelling in the ERS UI and strings', () => {
  it('no enrol / enrolment / cancelled in ERS code or string tables', () => {
    const files = SCOPE.flatMap(walk).filter((f) => !SKIP.test(f))
    expect(files.length).toBeGreaterThan(40)
    const bad: string[] = []
    for (const f of files) {
      const lines = readFileSync(new URL(f, root), 'utf8').split('\n')
      lines.forEach((l, i) => {
        if (BRITISH.test(l)) bad.push(`${f}:${i + 1}: ${l.trim().slice(0, 100)}`)
      })
    }
    expect(bad).toEqual([])
  })

  it('the pattern catches the British forms and leaves US forms alone', () => {
    for (const s of ['Enrol in a sequence', 'would enrol', 'enrolments held', 'will be cancelled', 'Enrolment']) expect(BRITISH.test(s), s).toBe(true)
    for (const s of ['Enroll in a sequence', 'enrollment', 'enrolled', 'will be canceled', 'c-enrol-list', 'CANCELLED']) expect(BRITISH.test(s), s).toBe(false)
  })
})
