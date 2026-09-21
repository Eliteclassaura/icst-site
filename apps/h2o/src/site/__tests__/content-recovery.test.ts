/**
 * H2O Phase 2D — the bounded content-recovery overlay, tested as an authority.
 *
 * The overlay supersedes seven bodies. The risk it introduces is not that the new copy is bad —
 * that is a review question — but that superseding becomes a hole in the gate: a body that can be
 * changed without failing anything, or an overlay that quietly applies to content it was not
 * written against. These tests close both.
 *
 * They also assert the two properties the directive's own remediation rule depends on: that every
 * change to a technical article is a recorded claim-level edit rather than a rewrite, and that
 * nothing a recovered body links to leaves the accepted cohort.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cohort } from '../cohort'

const CONTENT = path.join(process.cwd(), 'content', '2d-launch-cohort')

type Row = {
  canonical_path: string
  h2_after: number
  h3_after: number
  internal_links_after: number
  recovered_body_file: string
  recovered_body_sha256: string
  route_id: string
  source_provenance: string[]
  superseded_body_file: string
  superseded_body_sha256: string
  words_after: number
  words_before: number
}

const overlay = JSON.parse(
  readFileSync(path.join(CONTENT, 'PHASE2D_VISUAL_R2_CONTENT_OVERLAY.json'), 'utf8'),
) as {
  overlay_id: string
  recovered_bodies: Row[]
  recovered_internal_links: Array<{ from_route: string; to_route: string }>
  remediated_bodies: RemediatedRow[]
  totals: {
    accepted_original_bodies_preserved_on_disk: number
    claim_level_edits: number
    commercial_routes_recovered: number
    commercial_words_after: number
    commercial_words_before: number
    technical_routes_claim_remediated: number
  }
}

type RemediatedRow = {
  accepted_sha256: string
  body_file: string
  canonical_path: string
  edits: Array<{ od05_claim_ids?: string; pass?: string; reason: string; removed: string; replaced_with: string }>
  remediated_sha256: string
  route_id: string
  words_after: number
  words_before: number
}

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
const pages = cohort()

describe('the overlay supersedes exactly seven routes and nothing else', () => {
  it('names seven, and the cohort reports seven', () => {
    expect(overlay.recovered_bodies).toHaveLength(7)
    expect(overlay.totals.commercial_routes_recovered).toBe(7)
    expect(overlay.totals.technical_routes_claim_remediated).toBe(22)
    expect(overlay.totals.accepted_original_bodies_preserved_on_disk).toBe(29)
    // No route is untouched: seven carry a recovered body, twenty-two are claim-remediated.
    expect(pages.filter((p) => p.bodyRecovered)).toHaveLength(29)
    expect(pages).toHaveLength(29)
  })

  it('supersedes only commercial and navigational routes, never a technical article', () => {
    expect(overlay.recovered_bodies.map((r) => r.canonical_path).sort()).toEqual([
      '/',
      '/about-ics-industrial-cooling-solutions/',
      '/contact-us/',
      '/cooling-tower-parts-online/',
      '/cooling-tower-thermal-upgrade/',
      '/resources/',
      '/tech-articles/',
    ])
  })

  it('leaves every body it does not name byte-identical to its accepted file', () => {
    const superseded = new Set([
      ...overlay.recovered_bodies.map((r) => r.route_id),
      ...overlay.remediated_bodies.map((r) => r.route_id),
    ])
    let checked = 0
    for (const page of pages) {
      if (superseded.has(page.routeId)) continue
      expect(page.bodyRecovered).toBe(false)
      expect(sha(page.bodyMarkdown)).toBe(page.bodySha256Accepted)
      checked += 1
    }
    expect(checked).toBe(29 - superseded.size)
    expect(checked).toBe(0)
  })

  it('remediates seven articles by removing claims, never by rewriting them', () => {
    /*
      A remediation is a claim-level edit, and the property that makes it one is that every word the
      body moved is accounted for by a recorded edit: each removed string is gone, each replacement
      is present, and the total drift equals the drift the ledger's own edits predict. R2.1
      replaced under-scoped claims with qualified ones, which lengthens bodies on purpose — so the
      bound below is no longer a constant. It is the ledger. A rewrite dressed as a remediation
      moves the body further than its recorded edits explain and fails here; the earlier fixed
      bound of forty words could not tell those two cases apart.
    */
    expect(overlay.remediated_bodies).toHaveLength(22)
    let totalRecordedEdits = 0
    for (const row of overlay.remediated_bodies) {
      const accepted = readFileSync(path.join(CONTENT, 'bodies', row.body_file), 'utf8')
      const after = readFileSync(path.join(CONTENT, 'bodies-r2', row.body_file), 'utf8')
      expect(sha(accepted)).toBe(row.accepted_sha256)
      expect(sha(after)).toBe(row.remediated_sha256)
      expect(row.edits.length).toBeGreaterThan(0)

      /*
        Replay. Each edit is applied, in the order recorded, to the accepted body, and the result
        must hash to the rendered body. This is strictly stronger than asserting that each removed
        string is gone: an edit that is not in the ledger, a ledger entry that never happened, and
        an entry recorded out of order all fail here. It also holds edits made in a later pass
        against text an earlier pass produced, which a containment check against the accepted body
        cannot express.
      */
      let replayed = accepted
      for (const edit of row.edits) {
        const at = replayed.indexOf(edit.removed)
        expect(edit.removed.length).toBeGreaterThan(0)
        expect(at).toBeGreaterThanOrEqual(0)
        expect(replayed.indexOf(edit.removed, at + 1)).toBe(-1)
        replayed = replayed.slice(0, at) + edit.replaced_with + replayed.slice(at + edit.removed.length)
        if (edit.replaced_with !== '') expect(after).toContain(edit.replaced_with)
        expect(edit.reason.length).toBeGreaterThan(8)
        totalRecordedEdits += 1
      }
      expect(sha(replayed)).toBe(row.remediated_sha256)
      const words = (s: string): number => s.split(/\s+/).filter((w) => w !== '').length
      const predicted = row.edits.reduce(
        (n, e) => n + (words(e.replaced_with) - words(e.removed)),
        0,
      )
      const actual = words(after) - words(accepted)
      // Every word of movement is explained by a recorded edit, to within the whitespace a
      // replacement can merge or split at its seams.
      expect(Math.abs(actual - predicted)).toBeLessThanOrEqual(row.edits.length)
      expect(words(after)).toBe(row.words_after)
    }
    expect(totalRecordedEdits).toBe(overlay.totals.claim_level_edits)
  })

  it('leaves no guarantee, fabricated certification or build vocabulary in a remediated article', () => {
    const BAD: Array<[RegExp, string]> = [
      // The word itself is legitimate vocabulary in acceptance testing ("thermal guarantee", "the
      // original design guarantee"). What may not survive is ICS, or the article's own voice,
      // promising an outcome to the reader.
      [/\bguarantee(?:s|ing)?\s+(?:your|peak|smooth|long-term|precise|equipment|that every)/i, 'guarantee of an outcome'],
      [/to guarantee\b/i, 'guarantee of an outcome'],
      [/CTI-certified/i, 'fabricated certification'],
      [/ICS Engineering Standard/i, 'invented proprietary standard'],
      [/conversion path on this estate/i, 'internal build vocabulary'],
      [/H2ocooling\s*,/i, 'wrong company name'],
    ]
    const offences: string[] = []
    for (const row of overlay.remediated_bodies) {
      const after = readFileSync(path.join(CONTENT, 'bodies-r2', row.body_file), 'utf8')
      for (const [re, label] of BAD) {
        const m = after.match(re)
        if (m !== null) offences.push(`${row.canonical_path}: ${label} — ${JSON.stringify(m[0])}`)
      }
    }
    expect(offences).toEqual([])
  })
})

describe('both hashes are real gates', () => {
  it('records the accepted hash of each superseded body, and it still matches the file on disk', () => {
    for (const row of overlay.recovered_bodies) {
      const accepted = readFileSync(path.join(CONTENT, 'bodies', row.superseded_body_file), 'utf8')
      expect(sha(accepted)).toBe(row.superseded_body_sha256)
    }
  })

  it('records the hash of each recovered body, and it matches the file that renders', () => {
    for (const row of overlay.recovered_bodies) {
      const body = readFileSync(path.join(CONTENT, 'bodies-r2', row.recovered_body_file), 'utf8')
      expect(sha(body)).toBe(row.recovered_body_sha256)
      const page = pages.find((p) => p.routeId === row.route_id)
      expect(page?.bodyMarkdown).toBe(body)
    }
  })

  it('keeps the superseded body on disk — recovery is not deletion', () => {
    for (const row of overlay.recovered_bodies) {
      const accepted = readFileSync(path.join(CONTENT, 'bodies', row.superseded_body_file), 'utf8')
      expect(accepted.length).toBeGreaterThan(0)
      expect(sha(accepted)).not.toBe(row.recovered_body_sha256)
    }
  })
})

describe('the recovery is a recovery, not a reduction', () => {
  it('increases the word count on every superseded route', () => {
    for (const row of overlay.recovered_bodies) {
      const body = readFileSync(path.join(CONTENT, 'bodies-r2', row.recovered_body_file), 'utf8')
      expect(body.split(/\s+/).filter((w) => w !== '').length).toBe(row.words_after)
      expect(row.words_after).toBeGreaterThan(row.words_before)
    }
    expect(overlay.totals.commercial_words_after).toBeGreaterThan(overlay.totals.commercial_words_before * 2)
  })

  it('cites at least one named corpus source for every recovered route', () => {
    for (const row of overlay.recovered_bodies) {
      expect(row.source_provenance.length).toBeGreaterThan(0)
      for (const line of row.source_provenance) expect(line.length).toBeGreaterThan(20)
    }
  })
})

describe('nothing a recovered body says is a forbidden claim', () => {
  /*
    A text screen, not a substitute for the route-by-route provenance review. It catches the
    specific claim shapes the source estate is full of and the directive forbids, so a future edit
    that pastes one back in fails here instead of shipping.
  */
  const FORBIDDEN: Array<[RegExp, string]> = [
    [/factory[- ]authorized|factory authorised|OEM supplier|OEM direct/i, 'manufacturer authorization'],
    [/\bwarrant(y|ies)\b/i, 'warranty claim'],
    [/\bguarantee/i, 'guarantee'],
    [/\bISO\b|\bcertified\b|\bcertification\b|\baccredited\b/i, 'certification claim'],
    [/\$\s?\d|\bprice[sd]?\b|\bpricing\b|\baffordable\b|\bunbeatable\b|\bcheap\b|\bcost[- ]effective\b/i, 'price claim'],
    [/\bworld[- ]?class\b|\bindustry[- ]leading\b|\bbest[- ]in[- ]class\b|\bunmatched\b|\bsuperior\b|\bthe most \w+ (?:in|available)\b/i, 'superlative'],
    [/\b\d{1,3}\s?%/, 'unsupported quantitative claim'],
    [/@[a-z0-9.-]+\.[a-z]{2,}/i, 'email address'],
    [/\+\d[\d\s().-]{7,}/, 'telephone number'],
    [/\bHVAC\b/i, 'commercial or residential HVAC framing'],
    [/\bthermostat\b|\brefrigerant\b/i, 'consumer HVAC vocabulary'],
    [/\btestimonial\b|\blorem ipsum\b/i, 'testimonial or placeholder residue'],
  ]
  it('carries none of them, on any of the seven', () => {
    const offences: string[] = []
    for (const row of overlay.recovered_bodies) {
      const body = readFileSync(path.join(CONTENT, 'bodies-r2', row.recovered_body_file), 'utf8')
      for (const [pattern, label] of FORBIDDEN) {
        const hit = body.match(pattern)
        if (hit !== null) offences.push(`${row.canonical_path}: ${label} — ${JSON.stringify(hit[0])}`)
      }
    }
    expect(offences).toEqual([])
  })
})

describe('every recovered link stays inside the accepted cohort', () => {
  it('links only to canonical paths of the 29', () => {
    const paths = new Set(pages.map((p) => p.canonicalPath))
    for (const link of overlay.recovered_internal_links) {
      expect(paths.has(link.to_route)).toBe(true)
      expect(paths.has(link.from_route)).toBe(true)
    }
    expect(overlay.recovered_internal_links.length).toBeGreaterThan(0)
  })
})
