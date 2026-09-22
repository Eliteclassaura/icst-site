/**
 * H2O Phase 2D — the guards, tested directly.
 *
 * Three guards in R2 were covered only by their effect, not by themselves: the body-hash gate, the
 * forbidden-schema-property check, and the rule that the route set is the accepted table. Removing
 * any of them left the suite green under baseline-relative accounting — the failures R2 recorded
 * for those cases were the pre-existing superseded assertion, inherited, not caused.
 *
 * A guard that cannot be shown to fire is not a guard. These tests exercise each one directly.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertAcceptedBody, cohort, CohortIntegrityError, type CohortPage } from '../cohort'
import { linksIn, parseBody } from '../markdown'
import { buildJsonLd, ForbiddenSchemaPropertyError } from '../metadata'
import { generateStaticParams } from '../../app/(site)/[[...slug]]/page'
import {salmonRoutes, salmonRedirects, salmonRouteFor} from '../salmon'

const accepted = (): CohortPage[] => cohort()

/**
 * These four are deliberately written so that the accepted content is read **inside** the test.
 *
 * `cohort.test.ts` builds its page list and parses every body at module scope, which is fine for
 * what it asserts but means a damaged accepted body kills that file at import: the file reports a
 * collection failure and none of its 49 named checks runs. A discrimination case bound to a check
 * that never ran would be measuring nothing. Each check below therefore loads and parses lazily, so
 * damaging an accepted body makes a *named* check fail, and the harness can bind to it.
 */
describe('the accepted content loads and parses', () => {
  it('loads the accepted cohort without an integrity error', () => {
    expect(() => cohort()).not.toThrow()
  })

  it('parses every accepted body under the strict renderer', () => {
    for (const page of cohort()) {
      expect(() => parseBody(page.bodyMarkdown, page.routeId)).not.toThrow()
    }
  })

  it('emits only site-relative links from every accepted body', () => {
    for (const page of cohort()) {
      for (const href of linksIn(parseBody(page.bodyMarkdown, page.routeId))) {
        expect(href.startsWith('/')).toBe(true)
        expect(href.startsWith('//')).toBe(false)
      }
    }
  })

  it('emits no email address, telephone number or price from any accepted body', () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
    const telephone = /(\+[0-9]{1,3}[ -]?)?\(?[0-9]{3}\)?[ -][0-9]{3}[ -][0-9]{4}/
    const price = /[$£€]\s?[0-9]/
    for (const page of cohort()) {
      expect(page.bodyMarkdown).not.toMatch(email)
      expect(page.bodyMarkdown).not.toMatch(telephone)
      expect(page.bodyMarkdown).not.toMatch(price)
    }
  })
})

/** The accepted index row for a route, read from the frozen file rather than from the loader. */
const acceptedIndexRow = (routeId: string): Record<string, string> => {
  const text = readFileSync(
    path.join(process.cwd(), 'content', '2d-launch-cohort', 'PAGE_CONTENT_INDEX.tsv'),
    'utf8',
  )
  const lines = text.split('\n').filter((l) => l !== '')
  const header = (lines[0] ?? '').split('\t')
  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])) as Record<string, string>
    if (row.route_id === routeId) return row
  }
  throw new Error(`no accepted index row for ${routeId}`)
}

describe('the body-hash gate fires', () => {
  it('accepts a body whose hash matches the accepted value', () => {
    /*
      Read the accepted body from disk rather than from the loaded page. On the seven routes the
      bounded content-recovery overlay supersedes, `page.bodyMarkdown` is the recovered body and
      would not hash to the accepted value — which is correct, and is asserted in
      `content-recovery.test.ts`. What this test is for is the gate itself: an accepted body file
      still has to hash to its accepted value, on every route, recovered or not.
    */
    const page = accepted()[0] as CohortPage
    const row = acceptedIndexRow(page.routeId)
    const onDisk = readFileSync(
      path.join(process.cwd(), 'content', '2d-launch-cohort', 'bodies', row.final_body_file),
      'utf8',
    )
    expect(assertAcceptedBody('f.md', page.routeId, onDisk, page.bodySha256Accepted)).toBe(
      page.bodySha256Accepted,
    )
  })

  it('throws when one character of the body has changed', () => {
    const page = accepted()[0] as CohortPage
    expect(() =>
      assertAcceptedBody('f.md', page.routeId, `${page.bodyMarkdown} `, page.bodySha256Accepted),
    ).toThrow(CohortIntegrityError)
  })

  it('throws when the accepted hash itself has been altered', () => {
    const page = accepted()[0] as CohortPage
    expect(() => assertAcceptedBody('f.md', page.routeId, page.bodyMarkdown, '0'.repeat(64))).toThrow(
      /does not match its accepted hash/,
    )
  })

  it('names both hashes, so a failure says what changed', () => {
    const page = accepted()[0] as CohortPage
    expect(() => assertAcceptedBody('f.md', page.routeId, 'other', page.bodySha256Accepted)).toThrow(
      new RegExp(page.bodySha256Accepted),
    )
  })
})

describe('the forbidden-schema-property check fires', () => {
  it('throws when a route forbids a property its own schema emits', () => {
    const page = accepted().find((candidate) => candidate.routeClass !== 'EDITORIAL') as CohortPage
    const forbidsName: CohortPage = { ...page, forbiddenProperties: ['name'] }
    expect(() => buildJsonLd(forbidsName)).toThrow(ForbiddenSchemaPropertyError)
  })

  it('throws when a route forbids the schema type it would emit', () => {
    const page = accepted().find((candidate) => candidate.routeClass === 'EDITORIAL') as CohortPage
    const forbidsArticle: CohortPage = { ...page, forbiddenProperties: ['Article'] }
    expect(() => buildJsonLd(forbidsArticle)).toThrow(/forbidden schema type "Article"/)
  })

  it('emits nothing forbidden for any accepted route as the authority actually configures it', () => {
    for (const page of accepted()) expect(() => buildJsonLd(page)).not.toThrow()
  })
})

describe('the route set is the Control Tower-authorized Salmon estate', () => {
  it('enumerates exactly the 1205 effective Salmon routes', () => {
    const params = generateStaticParams()
    expect(params.length).toBe(1205)
    expect(params.map((entry) => `/${entry.slug.join('/')}/`.replace('//', '/')).sort()).toEqual(
      salmonRoutes()
        .map((page) => decodeURIComponent(page.targetPath))
        .sort(),
    )
  })

  it('enumerates no route the accepted table does not carry', () => {
    const acceptedPaths = new Set(salmonRoutes().map((page) => decodeURIComponent(page.targetPath)))
    for (const entry of generateStaticParams()) {
      const path = `/${entry.slug.join('/')}/`.replace('//', '/')
      expect(acceptedPaths.has(path)).toBe(true)
    }
  })

  it('carries every accepted route, so none is silently dropped', () => {
    const enumerated = new Set(
      generateStaticParams().map((entry) => `/${entry.slug.join('/')}/`.replace('//', '/')),
    )
    for (const page of salmonRoutes()) expect(enumerated.has(decodeURIComponent(page.targetPath))).toBe(true)
    expect(salmonRedirects()).toHaveLength(44)
    for(const alias of salmonRedirects())expect(enumerated.has(decodeURIComponent(alias.source))).toBe(false)
    const disabled=readFileSync(path.join(process.cwd(),'content/salmon/CANDIDATE_ONLY_ROUTE_DECISIONS.tsv'),'utf8').trim().split('\n').slice(1)
    expect(disabled).toHaveLength(7)
    for(const line of disabled)expect(salmonRouteFor(line.split('\t')[0]!.split('/').filter(Boolean))).toBeNull()
    expect(salmonRouteFor(['home'])).toBeNull()
  })
})
