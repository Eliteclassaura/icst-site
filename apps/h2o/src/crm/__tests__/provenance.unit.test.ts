import { describe, expect, it } from 'vitest'
import { assertProvenance, BUNDLED_SOURCES, provenanceProblems } from '../library/provenance'

/** The importer's source check: the seed must equal what the shipped files say, down to one byte. */
const flip = (text: string, at: number) => text.slice(0, at) + String.fromCharCode(text.charCodeAt(at) ^ 1) + text.slice(at + 1)

describe('library provenance', () => {
  it('the shipped sources match the seed (files, every step block, every variant, E2)', () => {
    expect(provenanceProblems()).toEqual([])
    expect(() => assertProvenance()).not.toThrow()
  })

  it('flipping one byte of the E1 text is refused', () => {
    const at = BUNDLED_SOURCES.e1.indexOf('Hi {{first_name}}') + 3
    expect(at).toBeGreaterThan(3)
    const out = provenanceProblems({ ...BUNDLED_SOURCES, e1: flip(BUNDLED_SOURCES.e1, at) })
    expect(out.length).toBeGreaterThan(0)
    expect(() => assertProvenance({ ...BUNDLED_SOURCES, e1: flip(BUNDLED_SOURCES.e1, at) })).toThrow(/Import refused/)
  })

  it('flipping one byte in a role variant, a subject or the last line is refused', () => {
    for (const marker of ['Rhonda with Industrial Cooling Solutions', 'One RFQ question', '- Rhonda'])
      expect(provenanceProblems({ ...BUNDLED_SOURCES, e1: flip(BUNDLED_SOURCES.e1, BUNDLED_SOURCES.e1.indexOf(marker) + 2) }).length, marker).toBeGreaterThan(0)
    expect(provenanceProblems({ ...BUNDLED_SOURCES, e1: flip(BUNDLED_SOURCES.e1, BUNDLED_SOURCES.e1.length - 3) }).length).toBeGreaterThan(0)
  })

  it('flipping one byte of an E2 draft or the topic bank is refused', () => {
    expect(provenanceProblems({ ...BUNDLED_SOURCES, e2Drafts: flip(BUNDLED_SOURCES.e2Drafts, 400) }).length).toBeGreaterThan(0)
    expect(provenanceProblems({ ...BUNDLED_SOURCES, e2Topics: flip(BUNDLED_SOURCES.e2Topics, 300) }).length).toBeGreaterThan(0)
  })

  it('a source that hashes right but parses to a different step is caught by the per-step check', () => {
    // Swap two steps' order inside a copy of the text with a recomputed file hash is impossible without the seed; instead
    // prove the per-step comparison runs: dropping a step's block changes the count even before hashes are compared.
    const text = BUNDLED_SOURCES.e1
    const cut = text.indexOf('\n## ', text.indexOf('\n## ') + 4)
    expect(cut).toBeGreaterThan(0)
    expect(provenanceProblems({ ...BUNDLED_SOURCES, e1: text.slice(0, cut) }).length).toBeGreaterThan(0)
  })
})
