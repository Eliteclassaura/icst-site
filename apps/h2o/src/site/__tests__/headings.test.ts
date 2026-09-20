/**
 * H2O Phase 2D — PV-02: the heading correction, and the cases it refuses.
 */
import { describe, expect, it } from 'vitest'
import { cohort } from '../cohort'
import { correctLeadingHeadings } from '../headings'
import { parseBody } from '../markdown'

const outcomeFor = (routeId: string) => {
  const page = cohort().find((candidate) => candidate.routeId === routeId)
  if (page === undefined) throw new Error(`no cohort route ${routeId}`)
  return correctLeadingHeadings(parseBody(page.bodyMarkdown, page.routeId))
}

const levels = (blocks: ReturnType<typeof parseBody>): number[] =>
  blocks.filter((b) => b.kind === 'heading').map((b) => (b.kind === 'heading' ? b.level : 0))

describe('the leading heading run is corrected where the document is unambiguous', () => {
  it.each([
    ['RT-0241', 1],
    ['RT-0318', 1],
    ['RT-0325', 1],
    ['RT-0335', 1],
    ['RT-1203', 1],
    ['RT-0350', 2],
    ['RT-0360', 2],
    ['RT-0403', 2],
    ['RT-0732', 2],
    ['RT-0495', 2],
  ])('promotes the leading run on %s', (routeId, expected) => {
    const outcome = outcomeFor(routeId)
    expect(outcome.corrections.length).toBe(expected)
    for (const c of outcome.corrections) {
      expect(c.from).toBe(3)
      expect(c.to).toBe(2)
    }
    const seq = levels(outcome.blocks)
    expect(seq[0]).toBe(1)
    expect(seq[1]).toBe(2)
  })

  it('leaves no H1 -> H3 jump on any corrected route', () => {
    for (const routeId of [
      'RT-0241',
      'RT-0318',
      'RT-0325',
      'RT-0335',
      'RT-1203',
      'RT-0350',
      'RT-0360',
      'RT-0403',
      'RT-0732',
      'RT-0495',
    ]) {
      const seq = levels(outcomeFor(routeId).blocks)
      for (let i = 1; i < seq.length; i += 1) {
        if (seq[i - 1] === 1) expect((seq[i] ?? 0) - 1).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('an ambiguous hierarchy is retained and flagged, never rewritten', () => {
  it.each([
    ['RT-0356', 4],
    ['RT-1236', 6],
  ])('promotes every member of %s\u2019s lettered series', (routeId, expected) => {
    const outcome = outcomeFor(routeId)
    expect(outcome.retainedReason).toBeNull()
    expect(outcome.corrections.length).toBe(expected)
    // Every correction is a lettered heading, and every one is 3 -> 2.
    for (const c of outcome.corrections) {
      expect(c.text).toMatch(/^[A-Z]\.\s/)
      expect(c.from).toBe(3)
      expect(c.to).toBe(2)
    }
    // No lettered heading is left behind at H3.
    const left = outcome.blocks.filter(
      (b) => b.kind === 'heading' && b.level === 3 && /^[A-Z]\.\s/.test(b.text.map((n) => n.text).join('')),
    )
    expect(left).toEqual([])
  })

  it('leaves a correctly nested lettered subsection where it is', () => {
    // RT-0480 carries one lettered H3, but it sits under an H2 rather than opening the document,
    // so it is not part of a leading series and must not move.
    const outcome = outcomeFor('RT-0480')
    expect(outcome.corrections.some((c) => /^[A-Z]\.\s/.test(c.text))).toBe(false)
  })
})

describe('PV-02 closure: the rendered hierarchy is valid on every route', () => {
  it('gives every route exactly one H1', () => {
    for (const page of cohort()) {
      const out = correctLeadingHeadings(parseBody(page.bodyMarkdown, page.routeId)).blocks
      const h1 = out.filter((b) => b.kind === 'heading' && b.level === 1)
      expect(h1.length).toBe(1)
    }
  })

  it('leaves no H1 -> H3 skip anywhere in the cohort', () => {
    const offenders: string[] = []
    for (const page of cohort()) {
      const seq = levels(correctLeadingHeadings(parseBody(page.bodyMarkdown, page.routeId)).blocks)
      for (let i = 1; i < seq.length; i += 1)
        if ((seq[i] ?? 0) - (seq[i - 1] ?? 0) > 1) offenders.push(`${page.routeId} ${seq[i - 1]}->${seq[i]}`)
    }
    expect(offenders).toEqual([])
  })
})

describe('the correction touches nothing but heading levels', () => {
  it('changes no heading text, no block order and no block count on any route', () => {
    for (const page of cohort()) {
      const before = parseBody(page.bodyMarkdown, page.routeId)
      const after = correctLeadingHeadings(before).blocks
      expect(after.length).toBe(before.length)
      for (let i = 0; i < before.length; i += 1) {
        const a = before[i]
        const b = after[i]
        expect(b?.kind).toBe(a?.kind)
        expect(JSON.stringify(b?.kind === 'heading' ? b.text : b)).toBe(
          JSON.stringify(a?.kind === 'heading' ? a.text : a),
        )
      }
    }
  })

  it('leaves a body with no leading H3 run completely untouched', () => {
    for (const page of cohort()) {
      const before = parseBody(page.bodyMarkdown, page.routeId)
      const seq = levels(before)
      if (seq[1] === 2) {
        const outcome = correctLeadingHeadings(before)
        expect(outcome.corrections).toEqual([])
        expect(outcome.retainedReason).toBeNull()
        expect(levels(outcome.blocks)).toEqual(seq)
      }
    }
  })

  it('corrects exactly 12 of the 29 routes and flags none', () => {
    const corrected = cohort().filter(
      (p) => correctLeadingHeadings(parseBody(p.bodyMarkdown, p.routeId)).corrections.length > 0,
    )
    const flagged = cohort().filter(
      (p) => correctLeadingHeadings(parseBody(p.bodyMarkdown, p.routeId)).retainedReason !== null,
    )
    expect(corrected.length).toBe(12)
    expect(flagged.length).toBe(0)
  })
})
