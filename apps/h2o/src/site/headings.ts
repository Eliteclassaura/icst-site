/**
 * H2O Phase 2D — PV-02: the leading heading-level correction.
 *
 * Twelve accepted editorial bodies open `# Title` and then jump straight to `###`, while the rest
 * of the document runs its top-level sections at `##`. The skipped level is a real accessibility
 * defect: a screen-reader user navigating by heading level meets an H3 with no H2 above it.
 *
 * The correction is applied **at render time, to the parsed block list** — never to the accepted
 * markdown. That matters for three reasons: the accepted bodies stay byte-identical and keep
 * passing the `final_body_sha256` gate that makes "verbatim" checkable; no accepted table has to be
 * rewritten to accommodate a Factory edit; and the change is reversible by deleting this module.
 * Wording, order, claims and business intent are untouched — only the level of a heading changes.
 *
 * **The ordinary rule.** The unbroken run of H3s between the H1 and the document's first H2 is
 * promoted to H2. Those leading H3s are introductory sections the document itself treats as peers
 * of the H2s that follow, so promoting them reads the document's own structure rather than imposing
 * one. Ten bodies are corrected this way.
 *
 * **The lettered-series rule.** Two bodies open on a lettered series — `A. Approach`, `B. Range`,
 * … — and were previously left alone as ambiguous. They are now corrected, because the lettering is
 * a presentation device and cannot justify invalid heading order:
 *
 *   - promoting only the leading pair would make the document's later lettered items children of
 *     one of their own peers, which distorts the meaning;
 *   - so **every member of that leading lettered series is promoted**, wherever it appears in the
 *     document, and they become siblings of each other and of the document's other H2 sections.
 *
 * That is the smallest correction that yields exactly one H1 with no H1→H3 skip while leaving every
 * word, every heading and every ordering exactly as accepted. Nothing is added: in both bodies the
 * grouping those series sit under is already carried by the body's own text — `**Category 1:**`,
 * `**Category 2:**`, `**Category 3:**` in one, and the surrounding prose in the other — and that
 * text is untouched. A lettered heading that is *not* part of a leading series is never moved, so a
 * correctly-nested `A.` subsection elsewhere in the cohort stays exactly where it is.
 */
import type { Block } from './markdown'

/** A heading whose text opens with a single-letter enumerator, e.g. `A. Approach`. */
const LETTERED = /^[A-Z]\.\s/

export type HeadingCorrection = {
  from: 3
  headingIndex: number
  text: string
  to: 2
}

export type HeadingOutcome = {
  blocks: Block[]
  corrections: HeadingCorrection[]
  /** Set when a jump was observed but deliberately left in place. */
  retainedReason: string | null
}

const textOf = (block: Extract<Block, { kind: 'heading' }>): string =>
  block.text.map((node) => node.text).join('')

/**
 * Correct the leading heading run, or explain why it was left alone.
 *
 * Returns the blocks unchanged when there is nothing to correct, so a body without the defect
 * passes through untouched and no ledger row is produced for it.
 */
export const correctLeadingHeadings = (blocks: Block[]): HeadingOutcome => {
  const headings = blocks
    .map((block, index) => ({ block, index }))
    .filter(
      (entry): entry is { block: Extract<Block, { kind: 'heading' }>; index: number } =>
        entry.block.kind === 'heading',
    )

  if (headings.length < 2 || headings[0]?.block.level !== 1) {
    return { blocks, corrections: [], retainedReason: null }
  }

  // The unbroken run of H3s between the H1 and the first H2.
  const run: typeof headings = []
  for (const entry of headings.slice(1)) {
    if (entry.block.level !== 3) break
    run.push(entry)
  }
  if (run.length === 0) return { blocks, corrections: [], retainedReason: null }

  const afterRun = headings[1 + run.length]
  if (afterRun === undefined || afterRun.block.level !== 2) {
    return {
      blocks,
      corrections: [],
      retainedReason:
        'RETAINED_AMBIGUOUS_NO_H2_BASELINE: the document does not establish H2 as its top-level section level, so promoting the leading run would assert a hierarchy the body does not state.',
    }
  }

  /**
   * When the leading run is a lettered series, the whole series moves with it.
   *
   * Promoting only the leading members would leave the document's later lettered items nested
   * under one of their own peers — `A. High Approach Temperature` becoming a subsection of
   * `B. Increased Motor Amp Draw` — which is a worse statement about the content than the skipped
   * level was. Promoting every member of the series keeps them peers of each other, which is what
   * the lettering already says, and peers of the document's other H2 sections, which is what their
   * position in the body already says.
   */
  const lettered = run.some((entry) => LETTERED.test(textOf(entry.block)))
  const promote = lettered
    ? headings.filter((entry) => entry.block.level === 3 && LETTERED.test(textOf(entry.block)))
    : run

  const corrections: HeadingCorrection[] = []
  const corrected = blocks.map((block, index) => {
    const entry = promote.find((candidate) => candidate.index === index)
    if (entry === undefined) return block
    corrections.push({
      from: 3,
      headingIndex: headings.findIndex((h) => h.index === index),
      text: textOf(entry.block),
      to: 2,
    })
    return { ...entry.block, level: 2 as const }
  })

  return { blocks: corrected, corrections, retainedReason: null }
}
