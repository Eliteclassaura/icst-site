import type { Block, Field } from 'payload'
import { RESTRICTED_RICH_TEXT } from './editorial'
import { lexicalParts, lexicalToNodes, type LexicalState } from './content-slots'

/**
 * Restored sections (content model change approved by the owner and Control Tower, 2026-10-05; SEO parity Part 2 R2).
 *
 * The imported page tree (`document`) stays restricted provenance: only the reviewed import writes it. Sections a page lost
 * against the live site, or a live body that replaces a different staging version, are restored as **typed blocks** on the
 * route record, edited through the normal Payload lifecycle (drafts, versions, publish). Composition (./compose) turns them
 * into ordinary nodes of the page tree, so every template, the table of contents, public search, structured data, the
 * author projection, the mojibake repair and the robots policy treat them exactly like source content.
 *
 * Each group has an explicit anchor. An anchor that does not resolve to exactly one heading (or a known template slot) is a
 * validation error on save and a build error in the batch; composition never appends a group it cannot place.
 *
 *   after-section   after the whole section headed by the anchor (up to the next heading of the same or a higher level)
 *   before-heading  immediately before the anchor heading
 *   replace-body    the article body that starts with the anchor heading is replaced by the blocks
 *   template-slot   a template-owned slot (intro, description, body-end) on templates with a fixed layout
 */
type Node = string | { tag: string; attrs: Record<string, string>; children: Node[] }
type El = Exclude<Node, string>
type Doc = Record<string, unknown>

export const RESTORED_MODES = ['after-section', 'before-heading', 'replace-body', 'template-slot'] as const
export const RESTORED_SLOTS = ['intro', 'description', 'body-end'] as const
export type RestoredMode = (typeof RESTORED_MODES)[number]

const rich = (name: string): Field => ({ name, type: 'richText', required: true, editor: RESTRICTED_RICH_TEXT })
/** Block slugs are distinct from the editorial blocks of the same collection; short dbNames keep Postgres identifiers short. */
export const RESTORED_BLOCKS: Block[] = [
  { slug: 'restoredHeading', dbName: 'rs_h', labels: { singular: 'Heading', plural: 'Headings' }, fields: [{ name: 'text', type: 'text', required: true }, { name: 'level', type: 'select', options: ['2', '3', '4'], defaultValue: '2', required: true }] },
  { slug: 'restoredParagraph', dbName: 'rs_p', labels: { singular: 'Paragraph', plural: 'Paragraphs' }, fields: [rich('content')] },
  {
    slug: 'restoredList',
    dbName: 'rs_l',
    labels: { singular: 'List', plural: 'Lists' },
    fields: [{ name: 'ordered', type: 'checkbox', defaultValue: false }, { name: 'items', type: 'array', dbName: 'rs_l_items', minRows: 1, required: true, fields: [rich('content')] }],
  },
  {
    slug: 'restoredTable',
    dbName: 'rs_t',
    labels: { singular: 'Table', plural: 'Tables' },
    fields: [
      { name: 'header', type: 'array', dbName: 'rs_t_head', fields: [{ name: 'text', type: 'text', required: true }] },
      { name: 'rows', type: 'array', dbName: 'rs_t_rows', minRows: 1, required: true, fields: [{ name: 'cells', type: 'array', dbName: 'rs_t_cells', minRows: 1, required: true, fields: [{ name: 'text', type: 'text' }] }] },
    ],
  },
  { slug: 'restoredFaq', dbName: 'rs_f', labels: { singular: 'FAQ', plural: 'FAQs' }, fields: [{ name: 'items', type: 'array', dbName: 'rs_f_items', minRows: 1, required: true, fields: [{ name: 'question', type: 'text', required: true }, { name: 'answer', type: 'textarea', required: true }] }] },
  {
    slug: 'restoredImage',
    dbName: 'rs_i',
    labels: { singular: 'Image', plural: 'Images' },
    fields: [
      { name: 'image', type: 'upload', relationTo: 'media', required: true },
      { name: 'alt', type: 'text', required: true },
      { name: 'caption', type: 'text' },
      { name: 'imageUrl', type: 'text', admin: { hidden: true } },
      { name: 'imageWidth', type: 'number', admin: { hidden: true } },
      { name: 'imageHeight', type: 'number', admin: { hidden: true } },
    ],
  },
]

export const restoredSectionsField: Field = {
  name: 'restoredSections',
  type: 'array',
  dbName: 'rs',
  label: 'Restored sections',
  labels: { singular: 'Restored section', plural: 'Restored sections' },
  admin: {
    condition: (data) => data?.family === 'salmon' || data?.family === 'live',
    description: 'Sections restored from the live site. Each is placed at its anchor (a heading on this page, or a template slot); an anchor that does not exist cannot be saved.',
  },
  fields: [
    { name: 'mode', type: 'select', required: true, options: RESTORED_MODES.map((value) => ({ label: value, value })) },
    { name: 'anchor', type: 'text', required: true, admin: { description: 'The exact heading text on this page, or the slot name (intro, description, body-end).' } },
    { name: 'source', type: 'text', admin: { description: 'Where the text was restored from (live URL and evidence).' } },
    { name: 'blocks', type: 'blocks', blocks: RESTORED_BLOCKS, minRows: 1, required: true },
  ],
}

export type RestoredBlock =
  | { blockType: 'restoredHeading'; text: string; level: '2' | '3' | '4' }
  | { blockType: 'restoredParagraph'; content: LexicalState }
  | { blockType: 'restoredList'; ordered?: boolean | null; items: Array<{ content: LexicalState }> }
  | { blockType: 'restoredTable'; header?: Array<{ text: string }> | null; rows: Array<{ cells: Array<{ text?: string | null }> }> }
  | { blockType: 'restoredFaq'; items: Array<{ question: string; answer: string }> }
  | { blockType: 'restoredImage'; imageUrl?: string | null; imageWidth?: number | null; imageHeight?: number | null; alt: string; caption?: string | null; image?: unknown }
export type RestoredGroup = { mode: RestoredMode; anchor: string; source?: string | null; blocks: RestoredBlock[] }

/* ---------- blocks → nodes ---------- */
const el = (tag: string, attrs: Record<string, string>, children: Node[]): El => ({ tag, attrs, children })
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (n: Node): string => (typeof n === 'string' ? n : n.children.map(textOf).join(''))
export const headingKey = (s: string) => norm(s.replace(/&nbsp;|\u00a0/g, ' ')).toLowerCase()
const slugify = (s: string) => headingKey(s).normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'section'

export function restoredBlockNodes(blocks: RestoredBlock[], usedIds: Set<string>): Node[] {
  const out: Node[] = []
  const mark = { 'data-restored': '1' }
  for (const b of blocks) {
    if (b.blockType === 'restoredHeading') {
      let id = slugify(b.text)
      for (let i = 2; usedIds.has(id); i++) id = `${slugify(b.text)}-${i}`
      usedIds.add(id)
      out.push(el(`h${b.level}`, { ...mark, id }, [norm(b.text)]))
    } else if (b.blockType === 'restoredParagraph') out.push(el('p', mark, lexicalToNodes(b.content)))
    else if (b.blockType === 'restoredList') out.push(el(b.ordered ? 'ol' : 'ul', mark, b.items.map((item) => el('li', {}, lexicalToNodes(item.content)))))
    else if (b.blockType === 'restoredTable') {
      const head = (b.header ?? []).filter((h) => norm(h.text ?? ''))
      out.push(
        el('table', mark, [
          ...(head.length ? [el('thead', {}, [el('tr', {}, head.map((h) => el('th', {}, [norm(h.text)])))])] : []),
          el('tbody', {}, b.rows.map((row) => el('tr', {}, row.cells.map((cell) => el('td', {}, [norm(cell.text ?? '')]))))),
        ]),
      )
    } else if (b.blockType === 'restoredFaq') out.push(el('div', { ...mark, class: 'restored-faq' }, b.items.flatMap((item) => [el('h3', {}, [norm(item.question)]), el('p', {}, [norm(item.answer)])])))
    else if (b.blockType === 'restoredImage' && b.imageUrl && /^\/api\/media\/file\/[A-Za-z0-9._-]+$/.test(b.imageUrl))
      out.push(el('figure', mark, [el('img', { src: b.imageUrl, alt: norm(b.alt), 'data-payload-media': '1', ...(b.imageWidth ? { width: String(b.imageWidth) } : {}), ...(b.imageHeight ? { height: String(b.imageHeight) } : {}) }, []), ...(b.caption ? [el('figcaption', {}, [norm(b.caption)])] : [])]))
  }
  return out
}

/* ---------- anchors ---------- */
type HeadingAt = { list: Node[]; index: number; level: number; text: string }
const HEADING = /^h([1-6])$/
/** The heading's own item in its list: a single-child wrapper (an Elementor widget) is climbed to the list that holds it. */
function headings(children: Node[]): HeadingAt[] {
  const out: HeadingAt[] = []
  const walk = (list: Node[], climb: Array<{ list: Node[]; index: number }>) => {
    list.forEach((n, index) => {
      if (typeof n === 'string') return
      if (n.attrs?.['data-restored-slot']) return
      const m = HEADING.exec(n.tag)
      if (m) {
        // Climb out of wrappers that hold nothing but this heading.
        let at = { list, index }
        for (let i = climb.length - 1; i >= 0; i--) {
          const parent = climb[i]!
          const node = parent.list[parent.index] as El
          if (node.children.filter((c) => typeof c !== 'string' || c.trim()).length !== 1) break
          at = parent
        }
        out.push({ ...at, level: Number(m[1]), text: norm(textOf(n)) })
        return
      }
      walk(n.children, [...climb, { list, index }])
    })
  }
  walk(children, [])
  return out
}
const levelOf = (n: Node): number | null => {
  if (typeof n === 'string') return null
  const m = HEADING.exec(n.tag)
  if (m) return Number(m[1])
  const kids = n.children.filter((c) => typeof c !== 'string' || c.trim())
  return kids.length === 1 ? levelOf(kids[0]!) : null
}
const idsOf = (children: Node[]): Set<string> => {
  const ids = new Set<string>()
  const walk = (n: Node) => {
    if (typeof n === 'string') return
    if (n.attrs?.id) ids.add(n.attrs.id)
    n.children.forEach(walk)
  }
  children.forEach(walk)
  return ids
}

/** Where a group goes, or why it cannot be placed. */
function locate(children: Node[], group: RestoredGroup): { at?: HeadingAt; problem?: string } {
  if (group.mode === 'template-slot') return (RESTORED_SLOTS as readonly string[]).includes(group.anchor) ? {} : { problem: `unknown template slot "${group.anchor}"` }
  const matches = headings(children).filter((h) => headingKey(h.text) === headingKey(group.anchor))
  if (!matches.length) return { problem: `anchor heading not found: "${group.anchor}"` }
  if (matches.length > 1) return { problem: `anchor heading is ambiguous (${matches.length} matches): "${group.anchor}"` }
  const at = matches[0]!
  if (group.mode === 'replace-body') {
    const first = at.list.findIndex((n) => levelOf(n) !== null && (levelOf(n) ?? 9) >= 2)
    if (first !== at.index) return { problem: `replace-body anchor is not the first heading of its body: "${group.anchor}"` }
  }
  return { at }
}

/** Validation for a save or a batch build: every group must resolve, and every block must be well formed. */
export function validateRestoredSections(doc: Doc, groups: RestoredGroup[] | null | undefined): string[] {
  const problems: string[] = []
  if (!groups?.length) return problems
  let working = structuredClone((doc.children as Node[]) ?? [])
  groups.forEach((group, i) => {
    if (!(RESTORED_MODES as readonly string[]).includes(group.mode)) problems.push(`group ${i + 1}: unknown mode "${group.mode}"`)
    if (!group.blocks?.length) problems.push(`group ${i + 1}: no blocks`)
    for (const b of group.blocks ?? []) {
      const states = b.blockType === 'restoredParagraph' ? [b.content] : b.blockType === 'restoredList' ? b.items.map((it) => it.content) : []
      for (const state of states) {
        const { types, urls } = lexicalParts(state)
        if (types.some((t) => !['root', 'paragraph', 'text', 'link', 'linebreak'].includes(t))) problems.push(`group ${i + 1}: unsupported rich text`)
        for (const url of urls) if (!/^\/(?!\/)[^\s]*$/.test(url)) problems.push(`group ${i + 1}: link must be an internal path: ${url}`)
      }
      if (b.blockType === 'restoredHeading' && !norm(b.text ?? '')) problems.push(`group ${i + 1}: empty heading`)
    }
    const { problem } = locate(working, group)
    if (problem) problems.push(`group ${i + 1}: ${problem}`)
    else working = placeGroup(working, group)
  })
  return problems
}

function placeGroup(children: Node[], group: RestoredGroup): Node[] {
  const out = children
  const nodes = restoredBlockNodes(group.blocks, idsOf(out))
  if (group.mode === 'template-slot') {
    out.push(el('section', { 'data-restored-slot': group.anchor }, nodes))
    return out
  }
  const { at } = locate(out, group)
  if (!at) return out
  if (group.mode === 'before-heading') at.list.splice(at.index, 0, ...nodes)
  else if (group.mode === 'replace-body') at.list.splice(0, at.list.length, ...nodes)
  else {
    let end = at.list.length
    for (let i = at.index + 1; i < at.list.length; i++) {
      const level = levelOf(at.list[i]!)
      if (level !== null && level <= at.level) {
        end = i
        break
      }
    }
    at.list.splice(end, 0, ...nodes)
  }
  return out
}

/** Compose: place every resolvable group, in order. A group whose anchor no longer resolves is skipped (never appended). */
export function applyRestoredSections(doc: Doc, groups: RestoredGroup[] | null | undefined): Doc {
  if (!groups?.length || !Array.isArray(doc.children)) return doc
  const out = structuredClone(doc)
  let children = out.children as Node[]
  for (const group of groups) {
    if (!group?.blocks?.length || locate(children, group).problem) continue
    children = placeGroup(children, group)
  }
  out.children = children
  return out
}

/** Nodes a template renders in one of its slots. */
export function restoredSlot(children: Node[], slot: string): Node[] {
  return children.flatMap((n) => (typeof n !== 'string' && n.attrs?.['data-restored-slot'] === slot ? n.children : []))
}
/** The tree without slot sections (for templates that walk the whole tree but render slots in their own place). */
export const withoutRestoredSlots = <T extends Node>(children: T[]): T[] => children.filter((n) => typeof n === 'string' || !n.attrs?.['data-restored-slot'])
