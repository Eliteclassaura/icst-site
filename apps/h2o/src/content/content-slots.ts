import { createHash } from 'node:crypto'

/**
 * Typed editor fields over the provenance page tree (R1B, Control Tower F1).
 *
 * The imported page tree (`document`) is restricted provenance: editors never see or edit it as JSON. What
 * editors edit is a list of **content slots** extracted from that tree, one per visible element:
 *
 *   - `heading`  (h1–h6)          → plain text
 *   - `text`     (p, li, blockquote, table cells …, inline content only) → rich text (bold, italic, links)
 *   - `action`   (a button or stand-alone link) → label, destination, product relation, quote intent
 *   - `image`    (img)            → a Payload media upload + alt text
 *
 * Main Factory's layout stays code/provenance-owned: slots change words, links, media and action intent, never
 * structure, classes or geometry. A slot is keyed by its node path in the provenance tree and records the
 * nearest Elementor element id (for exclusion checks) and a hash of its imported value. Composition applies a
 * slot only when its value differs from that hash, so an unedited page renders byte-for-byte as imported.
 * Server-side validation (`validateSlots`) refuses unknown keys, kind/tag mismatches, unsafe URLs, withheld
 * elements and unsupported rich-text nodes.
 */
type Node = string | { tag: string; attrs: Record<string, string>; children: Node[] }
type El = Exclude<Node, string>
type Doc = Record<string, unknown>

export type SlotKind = 'heading' | 'text' | 'action' | 'image' | 'copy'
export type ContentSlot = {
  key: string
  kind: SlotKind
  tag: string
  elementId?: string | null
  /** Short read-only description shown to editors ("H2 · Our Promise"). */
  title?: string | null
  heading?: string | null
  /** Plain copy of a structured record field (English service pages). */
  copy?: string | null
  text?: LexicalState | null
  label?: string | null
  href?: string | null
  /** Public product route id when the action points at a product page (validated relation). */
  productRouteId?: string | null
  intent?: 'none' | 'quote' | null
  image?: string | number | null
  imageUrl?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  alt?: string | null
  sourceHash: string
}

const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'br'])
const TEXT_TAGS = new Set(['p', 'li', 'blockquote', 'figcaption', 'td', 'th', 'dt', 'dd'])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (n: Node): string => (typeof n === 'string' ? n : n.children.map(textOf).join(''))
const inlineOnly = (n: El): boolean => n.children.every((c) => typeof c === 'string' || (INLINE.has(c.tag) && inlineOnly(c)))
export const hashValue = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 32)

/* ---------- Lexical (restricted: paragraph, text with bold/italic, link, linebreak) ---------- */
type LText = { type: 'text'; text: string; format: number; detail: 0; mode: 'normal'; style: ''; version: 1 }
type LLink = { type: 'link'; fields: { url: string; newTab: boolean; linkType: 'custom' }; children: LText[]; format: ''; indent: 0; version: 3; direction: 'ltr' }
type LBreak = { type: 'linebreak'; version: 1 }
type LInline = LText | LLink | LBreak
type LPara = { type: 'paragraph'; children: LInline[]; format: ''; indent: 0; version: 1; direction: 'ltr'; textFormat: 0; textStyle: '' }
export type LexicalState = { root: { type: 'root'; children: LPara[]; format: ''; indent: 0; version: 1; direction: 'ltr' } }

const BOLD = 1
const ITALIC = 2
const ltext = (text: string, format: number): LText => ({ type: 'text', text, format, detail: 0, mode: 'normal', style: '', version: 1 })

export function nodesToLexical(children: Node[]): LexicalState {
  const out: LInline[] = []
  const walk = (n: Node, format: number, link: LLink | null) => {
    if (typeof n === 'string') {
      if (!n) return
      ;(link ? link.children : out).push(ltext(n, format) as never)
      return
    }
    if (n.tag === 'br') {
      if (!link) out.push({ type: 'linebreak', version: 1 })
      return
    }
    const f = format | (n.tag === 'strong' || n.tag === 'b' ? BOLD : 0) | (n.tag === 'em' || n.tag === 'i' ? ITALIC : 0)
    if (n.tag === 'a' && !link) {
      const l: LLink = { type: 'link', fields: { url: (n.attrs.href ?? '').trim().replace(/\s/g, '%20'), newTab: false, linkType: 'custom' }, children: [], format: '', indent: 0, version: 3, direction: 'ltr' }
      for (const c of n.children) walk(c, f, l)
      out.push(l)
      return
    }
    for (const c of n.children) walk(c, f, link)
  }
  for (const c of children) walk(c, 0, null)
  return { root: { type: 'root', children: [{ type: 'paragraph', children: out, format: '', indent: 0, version: 1, direction: 'ltr', textFormat: 0, textStyle: '' }], format: '', indent: 0, version: 1, direction: 'ltr' } }
}

const wrap = (text: string, format: number): Node => {
  let n: Node = text
  if (format & ITALIC) n = { tag: 'em', attrs: {}, children: [n] }
  if (format & BOLD) n = { tag: 'strong', attrs: {}, children: [n] }
  return n
}

export function lexicalToNodes(state: LexicalState): Node[] {
  const out: Node[] = []
  const paras = state?.root?.children ?? []
  paras.forEach((p, i) => {
    if (i > 0) out.push({ tag: 'br', attrs: {}, children: [] })
    for (const c of p.children ?? []) {
      if (c.type === 'text') out.push(wrap(c.text, c.format ?? 0))
      else if (c.type === 'linebreak') out.push({ tag: 'br', attrs: {}, children: [] })
      else if (c.type === 'link') out.push({ tag: 'a', attrs: { href: c.fields?.url ?? '' }, children: (c.children ?? []).map((t) => wrap(t.text, t.format ?? 0)) })
    }
  })
  return out
}

/** Every node type and link URL inside a Lexical value (for validation). */
export function lexicalParts(state: LexicalState | null | undefined): { types: string[]; urls: string[] } {
  const types: string[] = []
  const urls: string[] = []
  const walk = (n: { type?: string; children?: unknown[]; fields?: { url?: string } }) => {
    types.push(String(n.type))
    if (n.type === 'link') urls.push(String(n.fields?.url ?? ''))
    for (const c of (n.children ?? []) as never[]) walk(c)
  }
  if (state?.root) walk(state.root as never)
  return { types, urls }
}

/* ---------- extraction ---------- */
function walkTree(children: Node[], visit: (n: El, key: string, elementId: string | null, insideText: boolean) => 'skip' | void) {
  const rec = (n: Node, key: string, elementId: string | null, insideText: boolean) => {
    if (typeof n === 'string') return
    const id = n.attrs?.['data-id'] ?? elementId
    if (visit(n, key, id, insideText) === 'skip') return
    n.children.forEach((c, i) => rec(c, `${key}.${i}`, id, insideText))
  }
  children.forEach((c, i) => rec(c, `body.${i}`, null, false))
}

const PRODUCT_PATH = /^\/product\/[^/]+\/$/
const sameSitePath = (href: string, base?: string): string | null => {
  try {
    const u = new URL(href, base ?? 'https://h2ocooling.com/')
    return ['h2ocooling.com', 'www.h2ocooling.com', 'salmon-rhinoceros-754457.hostingersite.com'].includes(u.hostname) ? u.pathname : null
  } catch {
    return null
  }
}

/**
 * Slots for a provenance tree. `productIds` maps a product page path to its route id, so a product link is
 * exposed as a product relation rather than a free URL. `quoteKeys` are the action keys whose quote intent
 * was established at migration by source identity (see ./rfq-intent).
 */
export function extractSlots(doc: Doc, opts: { productIds?: Map<string, string>; quoteKeys?: Set<string>; skipElementIds?: Set<string> } = {}): ContentSlot[] {
  const slots: ContentSlot[] = []
  const base = String(doc.sourceUrl ?? '')
  walkTree((doc.children as Node[]) ?? [], (n, key, elementId) => {
    if (elementId && opts.skipElementIds?.has(elementId)) return 'skip'
    if (n.attrs?.['data-public-exclusion']) return 'skip'
    const t = norm(textOf(n))
    if (HEADINGS.has(n.tag) && t) {
      slots.push({ key, kind: 'heading', tag: n.tag, elementId, title: `${n.tag.toUpperCase()} · ${t.slice(0, 60)}`, heading: t, sourceHash: hashValue(t) })
      return 'skip'
    }
    if (TEXT_TAGS.has(n.tag) && t && inlineOnly(n)) {
      const lex = nodesToLexical(n.children)
      slots.push({ key, kind: 'text', tag: n.tag, elementId, title: `${n.tag === 'p' ? 'Paragraph' : n.tag.toUpperCase()} · ${t.slice(0, 60)}`, text: lex, sourceHash: hashValue(lex) })
      return 'skip'
    }
    if (n.tag === 'a') {
      const href = n.attrs.href ?? ''
      const label = norm(textOf(n))
      const path = sameSitePath(href, base)
      const productRouteId = n.attrs['data-rfq-product'] ?? (path && PRODUCT_PATH.test(path) ? (opts.productIds?.get(path) ?? null) : null)
      const intent = n.attrs['data-rfq-intent'] === 'quote' || opts.quoteKeys?.has(key) ? 'quote' : 'none'
      const value = { label, href, productRouteId, intent }
      slots.push({ key, kind: 'action', tag: 'a', elementId, title: `${/elementor-button/.test(n.attrs.class ?? '') ? 'Button' : 'Link'} · ${label.slice(0, 60) || href.slice(0, 60)}`, label, href, productRouteId, intent, sourceHash: hashValue(value) })
      return 'skip'
    }
    if (n.tag === 'img') {
      const alt = n.attrs.alt ?? ''
      slots.push({ key, kind: 'image', tag: 'img', elementId, title: `Image · ${alt.slice(0, 60) || (n.attrs['data-src'] || n.attrs.src || '').split('/').pop()}`, alt, image: null, sourceHash: hashValue({ alt, image: null }) })
    }
  })
  return seal(slots)
}

/* ---------- composition ---------- */
/**
 * Canonical value hash of a slot. Stored values round-trip through Payload (jsonb reorders keys, Lexical adds
 * `textFormat`/`textStyle`, empty text becomes null), so the hash is taken over a canonical form: rich text as
 * the node tree it renders to, empty strings and nulls unified. An unedited slot therefore always matches.
 */
const slotValueHash = (s: ContentSlot): string =>
  s.kind === 'copy'
    ? hashValue(s.copy ?? '')
    : s.kind === 'heading'
      ? hashValue(s.heading ?? '')
      : s.kind === 'text'
        ? hashValue(s.text ? lexicalToNodes(s.text) : [])
        : s.kind === 'action'
          ? hashValue({ label: s.label ?? '', href: s.href ?? '', productRouteId: s.productRouteId || null, intent: s.intent || 'none' })
          : hashValue({ alt: s.alt ?? '', image: relIdOf(s.image) })
const relIdOf = (v: unknown): string | null => (v && typeof v === 'object' ? String((v as { id?: unknown }).id ?? '') || null : v ? String(v) : null)
const seal = (slots: ContentSlot[]): ContentSlot[] => {
  for (const s of slots) s.sourceHash = slotValueHash(s)
  return slots
}

export const slotEdited = (s: ContentSlot) => slotValueHash(s) !== s.sourceHash

function nodeAt(children: Node[], key: string): { parent: Node[]; index: number; node: El } | null {
  const parts = key.split('.').slice(1).map(Number)
  let list = children
  let node: Node | undefined
  for (let i = 0; i < parts.length; i++) {
    node = list[parts[i]!]
    if (!node || typeof node === 'string') return null
    if (i < parts.length - 1) list = node.children
  }
  return node && typeof node !== 'string' ? { parent: list, index: parts[parts.length - 1]!, node } : null
}

/** Apply edited slots to a copy of the provenance tree. Unedited slots change nothing. */
export function applyContentSlots(doc: Doc, slots: ContentSlot[] | null | undefined): Doc {
  if (!slots?.length || !Array.isArray(doc.children)) return doc
  const edited = slots.filter((s) => s && slotEdited(s))
  if (!edited.length) return doc
  const out = structuredClone(doc) as Doc
  const children = out.children as Node[]
  for (const s of edited) {
    const at = nodeAt(children, s.key)
    if (!at || at.node.tag !== s.tag) continue
    const n = at.node
    if (s.kind === 'heading') n.children = [s.heading ?? '']
    else if (s.kind === 'text' && s.text) n.children = lexicalToNodes(s.text)
    else if (s.kind === 'action') {
      // For a product relation the save hook stores the product's own path in `href` (denormalised).
      n.attrs = { ...n.attrs, href: s.href ?? n.attrs.href ?? '' }
      if (s.intent === 'quote') n.attrs['data-rfq-intent'] = 'quote'
      else delete n.attrs['data-rfq-intent']
      if (s.intent === 'quote' && s.productRouteId) n.attrs['data-rfq-product'] = s.productRouteId
      else delete n.attrs['data-rfq-product']
      replaceLabel(n, s.label ?? '')
    } else if (s.kind === 'image') {
      if (s.imageUrl) {
        const { srcset: _s, 'data-src': _d, 'data-srcset': _ds, sizes: _z, ...rest } = n.attrs
        void _s
        void _d
        void _ds
        void _z
        n.attrs = { ...rest, src: s.imageUrl, 'data-payload-media': String(s.image ?? ''), ...(s.imageWidth ? { width: String(s.imageWidth) } : {}), ...(s.imageHeight ? { height: String(s.imageHeight) } : {}) }
      }
      n.attrs.alt = s.alt ?? ''
    }
  }
  return out
}

/** Replace a link's visible text, keeping the innermost wrapper spans (button text span) intact. */
function replaceLabel(a: El, label: string): void {
  const deepest = (n: El): El => {
    const els = n.children.filter((c): c is El => typeof c !== 'string')
    const texts = n.children.filter((c) => typeof c === 'string' && c.trim())
    return els.length === 1 && !texts.length ? deepest(els[0]!) : n
  }
  const target = deepest(a)
  target.children = [label]
}

/** Quote intent marked on an action node (./rfq-controls renders it through the approved adapter). */
export const nodeQuoteIntent = (n: { attrs?: Record<string, string> }) => n.attrs?.['data-rfq-intent'] === 'quote'

/* ---------- validation ---------- */
const SAFE_EXTERNAL = /^https:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/
/** `knownFile`: a held public file verified to exist in the served public tree (./public-files); the only non-route site link. */
export type SlotContext = { knownPaths: Set<string>; knownFile?: (href: string) => boolean; productRouteIds: Set<string>; withheldElementIds: Set<string> }

export function validateSlots(doc: Doc, slots: ContentSlot[], ctx: SlotContext, original?: ContentSlot[] | null): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const originalHref = new Map((original ?? []).map((s) => [s.key, s.href ?? '']))
  const originalSlot = new Map((original ?? []).map((s) => [s.key, s]))
  // Imported values stay valid as imported (an icon link without text, a long source heading); a value the
  // editor changes must satisfy the rule.
  const changed = (s: ContentSlot, k: keyof ContentSlot) => !originalSlot.has(s.key) || JSON.stringify(originalSlot.get(s.key)![k] ?? null) !== JSON.stringify(s[k] ?? null)
  for (const s of slots) {
    if (seen.has(s.key)) errors.push(`${s.key}: duplicate slot`)
    seen.add(s.key)
    const at = nodeAt((doc.children as Node[]) ?? [], s.key)
    if (!at) {
      errors.push(`${s.key}: no such element`)
      continue
    }
    if (at.node.tag !== s.tag) errors.push(`${s.key}: element kind cannot change`)
    if (s.elementId && ctx.withheldElementIds.has(s.elementId)) errors.push(`${s.key}: withheld content cannot be edited or published`)
    const checkHref = (href: string) => {
      if (!href) return
      if (href === originalHref.get(s.key)) return // an unchanged imported destination stays as imported
      if (href.startsWith('/')) {
        if (href.startsWith('//')) errors.push(`${s.key}: protocol-relative links are not allowed`)
        else if (!ctx.knownPaths.has(href.split(/[?#]/)[0]!) && !ctx.knownFile?.(href)) errors.push(`${s.key}: ${href} is not a site route`)
      } else if (href.startsWith('#')) {
        /* same-page anchor */
      } else if (!SAFE_EXTERNAL.test(href)) errors.push(`${s.key}: only site paths or https links are allowed`)
    }
    if (s.kind === 'heading' && changed(s, 'heading') && (!s.heading || s.heading.length > 300)) errors.push(`${s.key}: heading must be 1–300 characters`)
    if (s.kind === 'text') {
      const { types, urls } = lexicalParts(s.text)
      if (types.some((t) => !['root', 'paragraph', 'text', 'link', 'linebreak'].includes(t))) errors.push(`${s.key}: only paragraphs, bold, italic and links are allowed`)
      for (const u of urls) checkHref(u)
    }
    if (s.kind === 'action') {
      if (changed(s, 'label') && (!s.label || s.label.length > 200)) errors.push(`${s.key}: label must be 1–200 characters`)
      if (s.productRouteId && !ctx.productRouteIds.has(s.productRouteId)) errors.push(`${s.key}: the product is not a published product`)
      checkHref(s.href ?? '')
      if (s.intent && !['none', 'quote'].includes(s.intent)) errors.push(`${s.key}: unknown action intent`)
    }
    if (s.kind === 'image' && (s.alt ?? '').length > 300) errors.push(`${s.key}: alt text is limited to 300 characters`)
  }
  return errors
}

/* ---------- English service records (structured copy, not a node tree) ---------- */
const SERVICE_COPY = ['title', 'eyebrow', 'lead', 'overviewTitle', 'overview', 'principleTitle', 'principles', 'servicesTitle', 'services', 'signsTitle', 'signs', 'supportTitle', 'support', 'processTitle', 'process', 'decisionTitle', 'decision', 'faq', 'closing']
const SERVICE_IMAGES = ['hero', 'detailImage', 'diagramImage', 'evidenceImage', 'supportImage', 'decisionImage', 'closingImage', 'processImage']
const SERVICE_LABEL: Record<string, string> = { principles: 'Principle', services: 'Service', signs: 'Sign', process: 'Process step', faq: 'FAQ' }

export function extractServiceSlots(doc: Doc): ContentSlot[] {
  const out: ContentSlot[] = []
  const push = (key: string, title: string, value: string) => out.push({ key, kind: 'copy', tag: 'field', title, copy: value, sourceHash: hashValue(value) })
  for (const f of SERVICE_COPY) {
    const v = doc[f]
    if (typeof v === 'string') push(`service:${f}`, `${f} · ${v.slice(0, 50)}`, v)
    else if (Array.isArray(v))
      v.forEach((item, i) => {
        if (typeof item === 'string') push(`service:${f}:${i}`, `${SERVICE_LABEL[f] ?? f} ${i + 1} · ${item.slice(0, 50)}`, item)
        else if (Array.isArray(item)) item.forEach((part, j) => typeof part === 'string' && push(`service:${f}:${i}:${j}`, `${SERVICE_LABEL[f] ?? f} ${i + 1}.${j + 1} · ${part.slice(0, 50)}`, part))
      })
  }
  for (const f of SERVICE_IMAGES)
    if (typeof doc[f] === 'string') out.push({ key: `service:${f}`, kind: 'image', tag: 'field', title: `Image · ${f}`, alt: '', image: null, sourceHash: hashValue({ alt: '', image: null }) })
  return seal(out)
}

export function applyServiceSlots(doc: Doc, slots: ContentSlot[] | null | undefined): Doc {
  const edited = (slots ?? []).filter((s) => s && slotEdited(s))
  if (!edited.length) return doc
  const out = structuredClone(doc) as Doc
  for (const s of edited) {
    const [, f, i, j] = s.key.split(':')
    if (!f) continue
    if (s.kind === 'image') {
      if (s.imageUrl && typeof out[f] === 'string') out[f] = s.imageUrl
      continue
    }
    if (s.kind !== 'copy') continue
    if (i === undefined) {
      if (typeof out[f] === 'string') out[f] = s.copy ?? ''
    } else if (Array.isArray(out[f])) {
      const list = out[f] as unknown[]
      if (j === undefined) {
        if (typeof list[Number(i)] === 'string') list[Number(i)] = s.copy ?? ''
      } else if (Array.isArray(list[Number(i)]) && typeof (list[Number(i)] as unknown[])[Number(j)] === 'string') (list[Number(i)] as unknown[])[Number(j)] = s.copy ?? ''
    }
  }
  return out
}

export function validateServiceSlots(doc: Doc, slots: ContentSlot[]): string[] {
  const valid = new Set(extractServiceSlots(doc).map((s) => `${s.key}|${s.kind}`))
  const errors: string[] = []
  for (const s of slots) {
    if (!valid.has(`${s.key}|${s.kind}`)) errors.push(`${s.key}: no such service field`)
    if (s.kind === 'copy' && (!s.copy || s.copy.length > 4000)) errors.push(`${s.key}: text must be 1–4000 characters`)
  }
  return errors
}
