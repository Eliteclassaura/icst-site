/**
 * H2O Phase 2D — a strict renderer for the accepted body subset.
 *
 * The 29 accepted bodies use exactly four block constructs (`#`, `##`, `###`, `- `, and paragraphs)
 * and three inline ones (`**bold**`, `*emphasis*`, `[text](/path/)`). This renderer implements that
 * subset and **refuses everything else**, rather than passing it through.
 *
 * Refusing is the point. A permissive renderer would let a future edit introduce raw HTML, a script
 * tag, an image, an external link or a table into a page whose copy nobody re-reviewed. Here an
 * unknown construct is a build failure with the route and line named, so the copy and the markup
 * can never drift apart silently. It also means no markdown dependency is added to the lockfile.
 *
 * The renderer emits React elements, not HTML strings, so nothing is ever `dangerouslySetInnerHTML`.
 */
import type { ReactNode } from 'react'

export class BodyMarkdownError extends Error {}

export type Block =
  | { items: InlineNode[][]; kind: 'list' }
  | { level: 1 | 2 | 3; kind: 'heading'; text: InlineNode[] }
  | { kind: 'paragraph'; text: InlineNode[] }

export type InlineNode =
  | { href: string; kind: 'link'; text: string }
  | { kind: 'emphasis'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'text'; text: string }

/** Anything that would carry markup, a remote reference or a construct nobody reviewed. */
const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/<[a-zA-Z/!?]/, 'raw HTML'],
  [/!\[/, 'an image'],
  [/^\s{0,3}>/, 'a block quote'],
  [/^\s{0,3}```/, 'a code fence'],
  [/^\s{0,3}\|/, 'a table'],
  [/^\s{0,3}\d+\.\s/, 'an ordered list'],
  [/^\s{0,3}(\*\s\*\s\*|---|___)\s*$/, 'a thematic break'],
]

/**
 * Link targets a body may carry: site-relative directory URLs only. No scheme, ever.
 *
 * The character class alone is not enough, and a test caught it: `//evil.example/` begins with a
 * slash and contains only permitted characters, so a naive check accepts it — and a browser handed
 * that value navigates off-site. The same trap catches `/a/../../x`, which is traversal made
 * entirely of permitted characters. Both are refused explicitly.
 */
const INTERNAL_HREF_CHARACTERS = /^\/[A-Za-z0-9\-._~/]*$/

const isInternalHref = (href: string): boolean => {
  if (!INTERNAL_HREF_CHARACTERS.test(href)) return false
  if (href.startsWith('//')) return false
  return !href.split('/').includes('..')
}

const parseInline = (raw: string, where: string): InlineNode[] => {
  const nodes: InlineNode[] = []
  // One pass, longest-token-first, so `**` is never mistaken for two `*`.
  const token = /(\[([^\]]*)\]\(([^)]*)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/
  let rest = raw
  while (rest !== '') {
    const match = token.exec(rest)
    if (match === null || match.index === undefined) {
      nodes.push({ kind: 'text', text: rest })
      break
    }
    if (match.index > 0) nodes.push({ kind: 'text', text: rest.slice(0, match.index) })
    if (match[1] !== undefined) {
      const href = match[3] ?? ''
      if (!isInternalHref(href)) {
        throw new BodyMarkdownError(`${where}: link target "${href}" is not a site-relative path`)
      }
      nodes.push({ href, kind: 'link', text: match[2] ?? '' })
    } else if (match[4] !== undefined) {
      nodes.push({ kind: 'strong', text: match[5] ?? '' })
    } else {
      nodes.push({ kind: 'emphasis', text: match[7] ?? '' })
    }
    rest = rest.slice(match.index + match[0].length)
  }
  return nodes.filter((node) => node.kind !== 'text' || node.text !== '')
}

/** Parse an accepted body into blocks, refusing any construct outside the accepted subset. */
export const parseBody = (markdown: string, routeId: string): Block[] => {
  const blocks: Block[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: InlineNode[][] | null = null

  const flushParagraph = (lineNo: number) => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', text: parseInline(paragraph.join(' ').trim(), `${routeId}:${lineNo}`) })
    paragraph = []
  }
  const flushList = () => {
    if (list === null) return
    blocks.push({ items: list, kind: 'list' })
    list = null
  }

  lines.forEach((line, i) => {
    const where = `${routeId}:${i + 1}`
    for (const [pattern, what] of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) throw new BodyMarkdownError(`${where}: accepted bodies may not contain ${what}`)
    }

    if (line.trim() === '') {
      flushParagraph(i + 1)
      flushList()
      return
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      flushParagraph(i + 1)
      flushList()
      const level = (heading[1] ?? '').length
      if (level > 3)
        throw new BodyMarkdownError(`${where}: heading level ${level} is outside the accepted subset`)
      blocks.push({ kind: 'heading', level: level as 1 | 2 | 3, text: parseInline(heading[2] ?? '', where) })
      return
    }

    const item = /^[-*]\s+(.*)$/.exec(line)
    if (item !== null) {
      flushParagraph(i + 1)
      if (list === null) list = []
      list.push(parseInline(item[1] ?? '', where))
      return
    }

    flushList()
    paragraph.push(line.trim())
  })

  flushParagraph(lines.length)
  flushList()
  return blocks
}

/** Every internal link a body carries, in order. Used to validate against the accepted link plan. */
export const linksIn = (blocks: Block[]): string[] => {
  const hrefs: string[] = []
  const walk = (nodes: InlineNode[]) => {
    for (const node of nodes) if (node.kind === 'link') hrefs.push(node.href)
  }
  for (const block of blocks) {
    if (block.kind === 'list') block.items.forEach(walk)
    else walk(block.text)
  }
  return hrefs
}

/** Headings by level, so byline and heading parity can be checked against the accepted counts. */
export const headingCounts = (blocks: Block[]): { h1: number; h2: number; h3: number } => {
  const counts = { h1: 0, h2: 0, h3: 0 }
  for (const block of blocks) {
    if (block.kind !== 'heading') continue
    if (block.level === 1) counts.h1 += 1
    if (block.level === 2) counts.h2 += 1
    if (block.level === 3) counts.h3 += 1
  }
  return counts
}

/** Plain text of a block's inline run — for the H1 parity check and for tests. */
export const inlineText = (nodes: InlineNode[]): string => nodes.map((node) => node.text).join('')

export type RenderOptions = {
  /** Renders one inline node. Supplied by the page so this module imports no JSX. */
  link: (node: { href: string; key: string; text: string }) => ReactNode
}
