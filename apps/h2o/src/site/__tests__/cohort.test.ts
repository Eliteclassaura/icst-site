/**
 * H2O Phase 2D — the verification suite.
 *
 * Every claim the return package makes about this build is asserted here, against the accepted
 * authority files that ship beside the code. The suite is the evidence; the prose only reports it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cohort,
  internalLinkPlan,
  mediaReferences,
  pageForSegments,
  remediationHold,
  type CohortPage,
} from '../cohort'
import { isIndexable, mountGate, navTargetRenderable, publicationState, RFQ_FALLBACK_PATH } from '../gate'
import { stagingValidationReady } from '../staging'
import { buildJsonLd, metadataFor, observedByline, observedDate } from '../metadata'
import { CONTACT_AUTHORITY_ID, contactOffices } from '../contact'
import { TESTIMONIAL_AUTHORITY_ID, testimonials } from '../testimonials'
import { headingCounts, inlineText, linksIn, parseBody } from '../markdown'
import {
  headerPrimary,
  omittedFooterModules,
  orientationStrip,
  renderableHeaderItems,
  renderableOrientationItems,
} from '../navigation'
import { basePolicy, policyFor } from '../../proxy'

const CONTENT_ROOT = path.join(process.cwd(), 'content', '2d-launch-cohort')
const pages = cohort()
const parsed = new Map<string, ReturnType<typeof parseBody>>(
  pages.map((page) => [page.routeId, parseBody(page.bodyMarkdown, page.routeId)]),
)
const blocksFor = (page: CohortPage) => parsed.get(page.routeId) ?? []

describe('route and body one-to-one', () => {
  it('implements exactly the 29 accepted routes', () => {
    expect(pages).toHaveLength(29)
  })

  it('gives every route exactly one body, verified against the hash that governs it', () => {
    /*
      Every route still renders exactly one body and that body is still hash-gated. The hash it is
      gated against depends on which authority governs it: the frozen index on the 22 unchanged
      routes, the content overlay's recovered hash on the seven it supersedes. Both are checked at
      load time by `cohort()` itself; this asserts the outcome, and that all 29 remain distinct.
    */
    for (const page of pages) {
      expect(page.bodyMarkdown.length).toBeGreaterThan(0)
      const rem = overlay.remediated_bodies.find((r) => r.route_id === page.routeId)
      if (rem !== undefined) {
        expect(page.bodyRecovered).toBe(true)
        expect(page.bodySha256).toBe(rem.remediated_sha256)
        expect(page.bodySha256Accepted).toBe(rem.accepted_sha256)
        continue
      }
      const rec = recoveredRow(page.routeId)
      if (rec === null) {
        expect(page.bodyRecovered).toBe(false)
        expect(page.bodySha256).toBe(page.bodySha256Accepted)
      } else {
        expect(page.bodyRecovered).toBe(true)
        expect(page.bodySha256).toBe(rec.recovered_body_sha256)
        // The supersession is of the body it claims: the accepted hash is unchanged underneath.
        expect(page.bodySha256Accepted).toBe(rec.superseded_body_sha256)
      }
    }
    expect(new Set(pages.map((p) => p.bodySha256)).size).toBe(29)
    // Seven rewritten commercial bodies plus 22 claim-level remediations of the frozen articles.
    expect(pages.filter((p) => p.bodyRecovered)).toHaveLength(29)
  })

  it('resolves every accepted canonical path, and nothing else', () => {
    for (const page of pages) {
      expect(pageForSegments(page.segments)?.routeId).toBe(page.routeId)
    }
    for (const unknown of [['nope'], ['products', '1712w'], ['regions', 'united-states'], ['services']]) {
      expect(pageForSegments(unknown)).toBeNull()
    }
  })

  it('renders the accepted body verbatim — the H1 in the body is the accepted H1', () => {
    for (const page of pages) {
      const first = blocksFor(page)[0]
      expect(first?.kind).toBe('heading')
      if (first?.kind !== 'heading') continue
      expect(first.level).toBe(1)
      expect(inlineText(first.text)).toBe(page.h1)
    }
  })

  it('matches the accepted heading counts on every route', () => {
    /*
      Each route is measured against whichever authority actually governs its rendered body. The
      22 untouched routes are measured against the frozen index, exactly as before. The seven the
      content-recovery overlay supersedes are measured against the overlay's own recorded counts,
      which is the same strictness applied to the document that is actually rendering — not a
      relaxation. A recovered body whose structure drifted from what the overlay recorded fails
      here just as a frozen body that drifted from the index does.
    */
    for (const page of pages) {
      const counts = headingCounts(blocksFor(page))
      expect(counts.h1).toBe(1)
      const rec = recoveredRow(page.routeId)
      if (rec === null) {
        const row = rawIndexRow(page.routeId)
        expect(String(counts.h2)).toBe(row.h2_count)
        expect(String(counts.h3)).toBe(row.h3_count)
      } else {
        expect(counts.h2).toBe(rec.h2_after)
        expect(counts.h3).toBe(rec.h3_after)
      }
    }
  })

  it('leaves the frozen index untouched on every one of the 29 routes', () => {
    // The overlay supersedes what renders. It may not edit the authority it supersedes.
    for (const page of pages) {
      const row = rawIndexRow(page.routeId)
      expect(row.final_body_sha256).toBe(page.bodySha256Accepted)
      expect(row.canonical_path).toBe(page.canonicalPath)
      expect(row.h1).toBe(page.h1)
      expect(row.title_tag).toBe(page.titleTag)
      expect(row.publication_condition).toBe(page.publicationCondition)
    }
  })
})

type RecoveredBodyRow = {
  canonical_path: string
  h2_after: number
  h3_after: number
  internal_links_after: number
  recovered_body_file: string
  recovered_body_sha256: string
  route_id: string
  superseded_body_sha256: string
  words_after: number
  words_before: number
}

const overlay = JSON.parse(
  readFileSync(path.join(CONTENT_ROOT, 'PHASE2D_VISUAL_R2_CONTENT_OVERLAY.json'), 'utf8'),
) as {
  recovered_bodies: RecoveredBodyRow[]
  recovered_internal_links: Array<{ anchor: string; from_route: string; to_route: string }>
  remediated_bodies: Array<{ accepted_sha256: string; remediated_sha256: string; route_id: string }>
}

/** The content-overlay row for a route, or null when the route renders its frozen body. */
const recoveredRow = (routeId: string): RecoveredBodyRow | null =>
  overlay.recovered_bodies.find((r) => r.route_id === routeId) ?? null

const rawIndex = (() => {
  const text = readFileSync(path.join(CONTENT_ROOT, 'PAGE_CONTENT_INDEX.tsv'), 'utf8')
  const lines = text.split('\n').filter((l) => l !== '')
  const header = (lines[0] ?? '').split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row: Record<string, string> = {}
    header.forEach((name, i) => (row[name] = cells[i] ?? ''))
    return row
  })
})()
function rawIndexRow(routeId: string): Record<string, string> {
  return rawIndex.find((r) => r.route_id === routeId) ?? {}
}

describe('metadata parity with the accepted tables', () => {
  it('takes title, description and canonical verbatim', () => {
    for (const page of pages) {
      const row = rawIndexRow(page.routeId)
      const meta = metadataFor(page)
      expect(meta.title).toBe(row.title_tag)
      expect(meta.description).toBe(row.meta_description)
      expect(meta.alternates?.canonical).toBe(row.canonical)
    }
  })

  it('emits noindex on every route, because none is publication-ready', () => {
    for (const page of pages) {
      expect(isIndexable(page)).toBe(false)
      const robots = metadataFor(page).robots as { index?: boolean; follow?: boolean }
      expect(robots.index).toBe(false)
      expect(robots.follow).toBe(false)
    }
  })

  it('never invents a title or description', () => {
    for (const page of pages) {
      expect(page.titleTag.length).toBe(Number(rawIndexRow(page.routeId).title_tag_length))
      expect(page.metaDescription.length).toBe(Number(rawIndexRow(page.routeId).meta_description_length))
    }
  })
})

describe('byline and authorship', () => {
  it('renders the observed byline on the 22 editorial routes and none elsewhere', () => {
    const withByline = pages.filter((p) => observedByline(p) !== null)
    expect(withByline).toHaveLength(22)
    for (const page of withByline) {
      expect(page.bylineInstruction).toBe(`RENDER_OBSERVED_BYLINE:${observedByline(page)}`)
      expect(observedByline(page)).toBe(page.observedAuthor)
    }
    for (const page of pages.filter((p) => observedByline(p) === null)) {
      expect(page.bylineInstruction).toBe('NO_BYLINE')
    }
  })

  it('invents no credential or biography anywhere', () => {
    const forbidden = /\b(P\.?E\.?|PhD|Ph\.D|MSc|BSc|CEng|certified|years of experience|expert in)\b/i
    for (const page of pages) {
      const byline = observedByline(page)
      if (byline === null) continue
      expect(byline).not.toMatch(forbidden)
      expect(byline.split(/\s+/).length).toBeLessThanOrEqual(4)
    }
  })

  it('emits a date only where one is observed', () => {
    for (const page of pages) {
      const date = observedDate(page)
      if (page.observedDatePublished === 'NOT_HELD') expect(date).toBeNull()
      else expect(date).toBe(page.observedDatePublished.split(' ')[0])
    }
  })
})

describe('structured data', () => {
  it('emits Article on editorial routes and WebPage elsewhere, always with BreadcrumbList', () => {
    for (const page of pages) {
      const graph = buildJsonLd(page)
      const types = graph.map((n) => n['@type'])
      expect(types).toContain('BreadcrumbList')
      expect(types).toContain(page.routeClass === 'EDITORIAL' ? 'Article' : 'WebPage')
      if (page.canonicalPath === '/') {
        const organization = graph.find((node) => node['@type'] === 'Organization')
        expect(organization).toMatchObject({
          address: { '@type': 'PostalAddress', postalCode: '80214' },
          contactPoint: [
            { telephone: '+13034622000' },
            { telephone: '+819042046742' },
            { telephone: '+6626617723' },
          ],
          name: 'Industrial Cooling Solutions Inc / ICS',
        })
      }
    }
  })

  it('never emits a property or type the route class forbids', () => {
    for (const page of pages) {
      const graph = buildJsonLd(page)
      const routeGraph = graph.filter((node) => node['@type'] !== 'Organization')
      const serialised = JSON.stringify(graph)
      for (const forbidden of page.forbiddenProperties) {
        expect(routeGraph.some((n) => Object.prototype.hasOwnProperty.call(n, forbidden))).toBe(false)
        expect(routeGraph.some((n) => n['@type'] === forbidden)).toBe(false)
      }
      // No commerce vocabulary anywhere, on any route class.
      for (const term of ['Offer', 'AggregateOffer', 'price', 'availability', 'Product']) {
        expect(serialised).not.toContain(`"${term}"`)
      }
    }
  })

  it('never emits an internal truth-state token', () => {
    for (const page of pages) {
      const serialised = JSON.stringify(buildJsonLd(page))
      for (const token of ['NOT_HELD', 'UNKNOWN', 'HOLD', 'NOT_HELD_PLACEHOLDER', 'REVIEW']) {
        expect(serialised).not.toContain(token)
      }
    }
  })
})

describe('internal links', () => {
  const plan = internalLinkPlan()
  const cohortPaths = new Set(pages.map((p) => p.canonicalPath))

  it('every link a body emits is a site-relative directory URL', () => {
    for (const page of pages) {
      for (const href of linksIn(blocksFor(page))) {
        expect(href.startsWith('/')).toBe(true)
        expect(href.endsWith('/')).toBe(true)
        expect(href).not.toMatch(/:\/\//)
      }
    }
  })

  it('emits exactly the accepted internal-link plan — no link more, no link fewer', () => {
    /*
      The link plan stays a checked authority. What changed is that two authorities now govern it:
      the frozen 128-row plan for the 22 routes whose bodies are unchanged, and the content
      overlay's own recorded link plan for the seven it supersedes. The expected set is the union
      of the two, restricted to each authority's own routes, and the emitted set must equal it
      exactly — no link more, no link fewer, as before.
    */
    const emitted = new Set<string>()
    for (const page of pages) {
      for (const href of linksIn(blocksFor(page))) emitted.add(`${page.canonicalPath} -> ${href}`)
    }
    const recoveredPaths = new Set(overlay.recovered_bodies.map((r) => r.canonical_path))
    const expected = new Set<string>()
    for (const row of plan) {
      if (!recoveredPaths.has(row.from_route)) expected.add(`${row.from_route} -> ${row.to_route}`)
    }
    for (const row of overlay.recovered_internal_links) {
      expect(recoveredPaths.has(row.from_route)).toBe(true)
      expected.add(`${row.from_route} -> ${row.to_route}`)
    }
    expect(plan).toHaveLength(128)
    expect([...emitted].sort()).toEqual([...expected].sort())
  })

  it('finds every planned target inside the implemented cohort', () => {
    for (const row of plan) {
      expect(row.to_route_in_cohort).toBe('YES')
      expect(row.to_route_disposition).toBe('CONTENT_IMPLEMENTATION_READY')
      expect(cohortPaths.has(row.to_route)).toBe(true)
    }
  })

  it('never links to a route outside the implemented cohort', () => {
    const offenders: string[] = []
    for (const page of pages) {
      for (const href of linksIn(blocksFor(page))) {
        if (!cohortPaths.has(href)) offenders.push(`${page.routeId} -> ${href}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('matches the accepted internal-link count on every route', () => {
    for (const page of pages) {
      const rec = recoveredRow(page.routeId)
      const expected =
        rec === null ? Number(rawIndexRow(page.routeId).internal_link_count) : rec.internal_links_after
      expect(linksIn(blocksFor(page)).length).toBe(expected)
    }
  })
})

describe('no held or product route is exposed', () => {
  const cohortPaths = new Set(pages.map((p) => p.canonicalPath))

  it('implements none of the 16 remediation-hold routes', () => {
    const held = remediationHold()
    expect(held).toHaveLength(16)
    for (const row of held) {
      expect(cohortPaths.has(row.canonical_path)).toBe(false)
      expect(pageForSegments(row.canonical_path.split('/').filter((s) => s !== ''))).toBeNull()
    }
  })

  it('implements no product route', () => {
    for (const page of pages) {
      expect(page.routeClass).not.toBe('PRODUCT')
      expect(page.canonicalPath).not.toMatch(/^\/product\//)
    }
  })

  it('links to no held route from any body', () => {
    const heldPaths = new Set(remediationHold().map((r) => r.canonical_path))
    for (const page of pages) {
      for (const href of linksIn(blocksFor(page))) expect(heldPaths.has(href)).toBe(false)
    }
  })
})

describe('navigation suppression', () => {
  it('renders a label only under the bounded staging reading, never as publication-ready', () => {
    /*
      Control Tower authorized bounded staging navigation: a label may render when its target is
      in the accepted cohort and that route is staging-validation-ready. What must remain true is
      that no label renders because a route became publication-ready — nothing did. So every
      rendered label has to carry the staging basis, and the publication gate has to still answer
      no for every one of them.
    */
    expect(headerPrimary()).toHaveLength(5)
    expect(orientationStrip()).toHaveLength(4)
    for (const item of [...headerPrimary(), ...orientationStrip()]) {
      if (!item.rendered) continue
      expect(item.renderBasis).toBe('BOUNDED_STAGING_NAVIGATION_TARGET_IS_STAGING_VALIDATION_READY')
      expect(navTargetRenderable(item.href)).toBe(false)
    }
  })

  it('renders exactly the in-cohort header labels and suppresses every held target', () => {
    const rendered = renderableHeaderItems().map((i) => `${i.label} -> ${i.href}`)
    expect(rendered.sort()).toEqual([
      'About -> /about-ics-industrial-cooling-solutions/',
      'Products -> /cooling-tower-parts-online/',
    ])
    const orientation = renderableOrientationItems().map((i) => `${i.label} -> ${i.href}`)
    expect(orientation).toEqual(['Technical Library -> /resources/'])
    const cohortPaths = new Set(pages.map((p) => p.canonicalPath))
    for (const item of [...headerPrimary(), ...orientationStrip()]) {
      if (item.rendered) expect(cohortPaths.has(item.href)).toBe(true)
      else expect(item.href.startsWith('/') && cohortPaths.has(item.href)).toBe(false)
    }
  })

  it('renders no label whose target route is not publication-ready', () => {
    for (const page of pages) expect(navTargetRenderable(page.canonicalPath)).toBe(false)
  })

  it('omits the locations and regions modules entirely rather than placeholding them', () => {
    const omitted = omittedFooterModules()
    expect(omitted).toContain('locations_module')
    expect(omitted).toContain('regions_module')
  })
})

describe('the RFQ mount is integrated, and gated on staging-validation readiness', () => {
  const env = {
    H2O_TYPEFORM_FORM_ID: 'F22cAgx3',
    H2O_TYPEFORM_ORIGIN: 'https://form.typeform.com',
  }

  it('mounts on every route under the bounded staging-readiness overlay', () => {
    for (const page of pages) {
      const gate = mountGate(page, { env })
      expect(gate.mounted).toBe(true)
      expect(gate.reason).toBe('MOUNTED')
      expect(gate.origin).toBe('https://form.typeform.com')
      expect(gate.formUrl).toBe('https://form.typeform.com/to/F22cAgx3')
    }
  })

  it('still refuses to mount when the adapter configuration does not resolve', () => {
    for (const page of pages.slice(0, 3)) {
      const gate = mountGate(page, { env: {} })
      expect(gate.mounted).toBe(false)
      expect(gate.reason).toBe('CONFIGURATION_UNRESOLVED')
      expect(gate.formUrl).toBeUndefined()
    }
  })

  it('names the RFQ fallback route the accepted contract names, and it is staging-ready', () => {
    const fallback = pages.find((p) => p.canonicalPath === RFQ_FALLBACK_PATH)
    expect(fallback).toBeDefined()
    expect(stagingValidationReady(fallback as CohortPage)).toBe(true)
  })

  it('refuses a route outside the cohort', () => {
    expect(mountGate(null, { env }).reason).toBe('ROUTE_NOT_IN_COHORT')
  })

  it('records every route as publication-blocked still, with the accepted reason unchanged', () => {
    // This is the load-bearing assertion of the whole increment. Mounting a button is a staging
    // decision; publishing a page is not. If these two ever move together, something has quietly
    // reinterpreted the historical authority.
    for (const page of pages) {
      expect(publicationState(page).ready).toBe(false)
      expect(page.publicationCondition).toBe('PUBLICATION_READY_REQUIRED;OWNER_SME_GATE_OUTSTANDING')
      expect(stagingValidationReady(page)).toBe(true)
    }
  })
})

describe('no contact value, no commerce, no cross-client content', () => {
  const sources = pages.map((p) => p.bodyMarkdown).join('\n')

  it('carries no email address', () => {
    expect(sources).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  })

  it('carries no telephone number or call affordance', () => {
    expect(sources).not.toMatch(/\+\d[\d\s().-]{7,}\d/)
    expect(sources).not.toMatch(/\b\d{3}[-.]\d{3}[-.]\d{4}\b/)
    expect(sources).not.toMatch(/tel:/i)
    expect(sources).not.toMatch(/\bcall us\b/i)
    expect(CONTACT_AUTHORITY_ID).toBe('OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21')
    expect(contactOffices.map((office) => office.telephoneHref)).toEqual([
      'tel:+13034622000',
      'tel:+819042046742',
      'tel:+6626617723',
    ])
    expect(contactOffices.find((office) => office.officeKey === 'japan')?.addressLines).toEqual([])
    expect(TESTIMONIAL_AUTHORITY_ID).toBe('OWNER_TESTIMONIAL_AUTHORITY_OVERRIDE_2026_09_21')
    expect(testimonials).toHaveLength(9)
    expect(new Set(testimonials.map((record) => record.person))).toEqual(
      new Set(['Sarah Mitchell', 'Daniel White', 'Sophia Martinez', 'Laura Bennett', 'Andrew Lewis', 'Michael Chen']),
    )
  })

  it('carries no price, stock state, cart or checkout', () => {
    expect(sources).not.toMatch(/\$\s?\d/)
    expect(sources).not.toMatch(/\b(USD|EUR|GBP)\s?\d/)
    for (const term of ['in stock', 'out of stock', 'add to cart', 'checkout', 'buy now']) {
      expect(sources.toLowerCase()).not.toContain(term)
    }
  })

  it('carries no cross-client content', () => {
    for (const term of ['syed', 'searchfit', 'geo-vs-seo']) {
      expect(sources.toLowerCase()).not.toContain(term)
    }
  })

  it('emits no internal truth-state token as user-facing content', () => {
    for (const token of [
      'NOT_HELD_PLACEHOLDER',
      'OWNER_SME_GATE_OUTSTANDING',
      'CLAIM_VERIFICATION_REQUIRED',
    ]) {
      expect(sources).not.toContain(token)
    }
  })

})

describe('media publication stays disabled', () => {
  it('records the accepted media references and publishes none of them', () => {
    const rows = mediaReferences()
    expect(rows).toHaveLength(29)
    for (const row of rows) expect(row.publishes_now).not.toBe('YES')
  })

  it('emits no image reference from any body', () => {
    for (const page of pages) expect(page.bodyMarkdown).not.toMatch(/!\[/)
  })
})

describe('CSP integration', () => {
  const HASHES = ["'sha256-AAAA'", "'sha256-BBBB'"]

  it('adds frame-src for the approved Typeform host', () => {
    const { merged, policy } = policyFor(HASHES)
    expect(merged).toBe(true)
    expect(policy).toContain('frame-src')
    expect(policy).toContain('https://form.typeform.com')
  })

  it('weakens no existing directive', () => {
    const base = basePolicy(HASHES)
    const { policy } = policyFor(HASHES)
    for (const directive of base.split(';').map((d) => d.trim())) {
      if (directive.startsWith('frame-src')) continue
      expect(policy).toContain(directive)
    }
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain(`script-src 'self' ${HASHES.join(' ')}`)
  })

  it('introduces no wildcard and no script or connect allowance', () => {
    const { policy } = policyFor(HASHES)
    expect(policy).not.toContain('*')
    expect(policy).not.toMatch(/script-src[^;]*typeform/)
    expect(policy).not.toMatch(/connect-src[^;]*typeform/)
  })

  it('never emits a nonce, unsafe-inline, unsafe-eval or strict-dynamic in script-src', () => {
    // A nonce cannot reach statically prerendered HTML, and 'strict-dynamic' makes a browser
    // ignore 'self'. Both were the R1 defect; neither may come back by accident.
    for (const hashes of [[], HASHES]) {
      const { policy } = policyFor(hashes)
      const scriptSrc = policy
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('script-src'))
      expect(scriptSrc).toBeDefined()
      expect(scriptSrc).not.toContain('nonce-')
      expect(scriptSrc).not.toContain("'strict-dynamic'")
      expect(scriptSrc).not.toContain("'unsafe-inline'")
      expect(scriptSrc).not.toContain("'unsafe-eval'")
      expect(scriptSrc).not.toMatch(/https?:/)
    }
  })

  it('falls back to self alone when a page contributes no hash', () => {
    expect(basePolicy([])).toContain("script-src 'self';")
  })
})

describe('the body renderer refuses anything outside the accepted subset', () => {
  it.each([
    ['raw HTML', '# T\n\n<div>x</div>'],
    ['a script tag', '# T\n\n<script>alert(1)</script>'],
    ['an image', '# T\n\n![alt](/x.png)'],
    ['a table', '# T\n\n| a | b |'],
    ['a code fence', '# T\n\n```js\nx\n```'],
    ['a block quote', '# T\n\n> quoted'],
    ['an ordered list', '# T\n\n1. one'],
    ['a heading below h3', '# T\n\n#### deep'],
  ])('refuses %s', (_label, markdown) => {
    expect(() => parseBody(markdown, 'RT-TEST')).toThrow()
  })

  it('refuses an external link target', () => {
    expect(() => parseBody('# T\n\n[x](https://evil.example/)', 'RT-TEST')).toThrow()
    expect(() => parseBody('# T\n\n[x](//evil.example/)', 'RT-TEST')).toThrow()
  })

  it('accepts the subset the accepted bodies actually use', () => {
    const blocks = parseBody(
      '# H1\n\n## H2\n\n### H3\n\nText **bold** *em* [link](/a/).\n\n- one\n- two\n',
      'RT-TEST',
    )
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'heading', 'heading', 'paragraph', 'list'])
  })
})
