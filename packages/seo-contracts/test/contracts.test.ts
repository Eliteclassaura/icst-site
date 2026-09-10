import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  validate,
  detectContract,
  findEmailStrings,
  effectiveAction,
  blueprint,
  type PageDecisions,
} from '../src/index'

const read = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'))

describe('golden fixtures', () => {
  for (const f of readdirSync(new URL('../fixtures/valid', import.meta.url))) {
    it(`${f} validates against its detected contract`, () => {
      const doc = read(`fixtures/valid/${f}`)
      const name = detectContract(doc)
      expect(name).toBeTruthy()
      const r = validate(name!, doc)
      if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2))
      expect(r.ok).toBe(true)
    })
  }
})

describe('negative fixtures fail at the expected path', () => {
  const dir = new URL('../fixtures/invalid', import.meta.url)
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.endsWith('.expect.json'))) {
    it(f, () => {
      const doc = read(`fixtures/invalid/${f}`)
      const expect_ = read(`fixtures/invalid/${f.replace('.json', '.expect.json')}`) as {
        expect_path_contains: string
      }
      const r = validate(detectContract(doc)!, doc)
      expect(r.ok).toBe(false)
      if (r.ok) return
      const hit = r.issues.some(
        (i) =>
          i.path.includes(expect_.expect_path_contains) || i.message.includes(expect_.expect_path_contains),
      )
      if (!hit)
        throw new Error(
          `expected an issue matching "${expect_.expect_path_contains}", got ${JSON.stringify(r.issues)}`,
        )
    })
  }
})

describe('rules', () => {
  it('finds email strings anywhere in a document', () => {
    expect(findEmailStrings({ a: [{ b: 'contact someone@example.test now' }] })).toEqual(['$.a[0].b'])
    expect(findEmailStrings({ a: 'handle-only', n: 1 })).toEqual([])
  })
  it('draft decisions degrade structural actions to REVIEW; approved keep them', () => {
    const doc = read('fixtures/valid/page-decisions.json') as PageDecisions
    const page = {
      ...doc.payload.pages[0]!,
      action: 'REDIRECT' as const,
      target_url: 'https://client-example.test/x/',
      status_code: 301 as const,
    }
    expect(effectiveAction({ ...doc, payload: { ...doc.payload, decisions_status: 'draft' } }, page)).toBe(
      'REVIEW',
    )
    expect(effectiveAction(doc, { ...page, action: 'IMPROVE' })).toBe('IMPROVE')
  })
  it('blueprint v2 refuses duplicate paths and redirects that shadow pages', () => {
    const base = {
      version: 2,
      generatedAt: 'x',
      source: { archive: 'a', files: {}, extractor: 'e' },
      site: { name: 'S', url: 'https://example.test', trailingSlash: true },
      parity: { baseline: 'frozen-old-site' },
      media: [],
      redirects: [{ from: '/a/', to: '/b/', status: 308 }],
      pages: [
        { path: '/a/', slug: 'a', pageType: 'page', title: 'A', seo: {}, layout: [] },
        { path: '/a/', slug: 'a2', pageType: 'page', title: 'A2', seo: {}, layout: [] },
      ],
    }
    const r = blueprint.safeParse(base)
    expect(r.success).toBe(false)
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message)
    expect(msgs.join()).toContain('duplicate path')
    expect(msgs.join()).toContain('shadows a page')
  })
})
