/**
 * H2O Phase 2D — accepted bodies, partitioned by their own section headings.
 *
 * The visual implementation has to compose the accepted copy into a designed page without changing
 * a single word of it. That is only safe if the composition reads the body's **own** structure
 * rather than a hand-written copy of it, so this module does exactly one thing: it cuts the parsed
 * block list at each H2 and hands back the pieces.
 *
 * Three properties make that a safe basis for a redesign:
 *
 *   1. **Nothing is rewritten.** A section carries the heading block and the body blocks that
 *      followed it, verbatim and in order. The markdown is untouched, so `final_body_sha256` still
 *      gates it and the accepted copy meaning is preserved by construction.
 *   2. **Nothing is dropped.** `partitionByHeading` is total: every block in equals exactly one
 *      block out, and `assertTotal` proves it. A composition that forgets a section is a bug the
 *      test catches, not a silent content loss.
 *   3. **Nothing is matched by prose.** Sections are identified by *position* and by the heading
 *      text the accepted body already carries, never by a keyword the build invented. A body whose
 *      headings change produces different sections rather than a page that silently drops content.
 *
 * What a composition may then decide is presentation only: which section becomes the hero, which
 * become pathway cards, which list becomes a grid. That is the line the directive draws, and this
 * module is where it is drawn.
 */
import type { Block } from './markdown'

export type BodySection = {
  /** Blocks after the heading, in order. */
  body: Block[]
  /** The H2 block itself, or null for the lead-in before the first H2. */
  heading: Extract<Block, { kind: 'heading' }> | null
  /** The heading's plain text, for identification. Empty for the lead-in. */
  title: string
}

export class SectionPartitionError extends Error {}

const textOf = (block: Extract<Block, { kind: 'heading' }>): string =>
  block.text.map((node) => node.text).join('')

/**
 * Cut a parsed body into its H2 sections.
 *
 * The first element is always the lead-in: everything before the first H2, which on every accepted
 * body is the H1 and nothing else. Callers that have already consumed the H1 pass the remainder.
 */
export const partitionByHeading = (blocks: Block[]): BodySection[] => {
  const sections: BodySection[] = [{ body: [], heading: null, title: '' }]
  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 2) {
      sections.push({ body: [], heading: block, title: textOf(block) })
      continue
    }
    const current = sections[sections.length - 1]
    if (current === undefined) throw new SectionPartitionError('partition lost its current section')
    current.body.push(block)
  }
  return sections
}

/**
 * Prove the partition lost nothing.
 *
 * Exported so a test can assert the property rather than trust it: the flattened sections must
 * equal the input block list exactly, element for element, in order.
 */
export const flatten = (sections: BodySection[]): Block[] =>
  sections.flatMap((section) => (section.heading === null ? section.body : [section.heading, ...section.body]))

export const assertTotal = (blocks: Block[], sections: BodySection[]): void => {
  const out = flatten(sections)
  if (out.length !== blocks.length) {
    throw new SectionPartitionError(
      `partition is not total: ${blocks.length} blocks in, ${out.length} out`,
    )
  }
  for (let i = 0; i < blocks.length; i += 1) {
    if (out[i] !== blocks[i]) {
      throw new SectionPartitionError(`partition reordered or replaced the block at index ${i}`)
    }
  }
}

/**
 * The section whose heading is exactly this text, or null.
 *
 * Exact equality, never a substring or a fuzzy match: a composition that asks for a section the
 * body does not have must get nothing back and render nothing, rather than capture a neighbouring
 * section whose heading happens to contain the word.
 */
export const sectionTitled = (sections: BodySection[], title: string): BodySection | null =>
  sections.find((section) => section.title === title) ?? null

/** Every section except the lead-in and the ones a composition has already placed. */
export const remaining = (sections: BodySection[], placed: readonly string[]): BodySection[] =>
  sections.filter((section) => section.heading !== null && !placed.includes(section.title))

/** The single list a section carries, or null when it carries none or several. */
export const soleList = (section: BodySection | null): Extract<Block, { kind: 'list' }> | null => {
  if (section === null) return null
  const lists = section.body.filter(
    (block): block is Extract<Block, { kind: 'list' }> => block.kind === 'list',
  )
  return lists.length === 1 ? (lists[0] ?? null) : null
}

/** The paragraphs a section carries, in order. */
export const paragraphs = (
  section: BodySection | null,
): Array<Extract<Block, { kind: 'paragraph' }>> =>
  section === null
    ? []
    : section.body.filter(
        (block): block is Extract<Block, { kind: 'paragraph' }> => block.kind === 'paragraph',
      )
