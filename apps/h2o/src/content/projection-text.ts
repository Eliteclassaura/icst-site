/**
 * Public text projection (R1B, Control Tower F2/F3).
 *
 * Search content and every derived text field come from the **validated, composed public document**, the
 * same projection the templates render, and never from an independently stored summary. For the salmon and
 * live families this means the rendered node tree (after exclusions); for English services, every editable
 * copy field; for editorial pages, the typed sections.
 *
 * Tags that never render as readable text (script/style/template/noscript/svg) contribute nothing. Block
 * elements are separated by a space, as a browser's rendered text would be.
 */
type Node = string | { tag: string; attrs?: Record<string, string>; children?: Node[] }
type Doc = Record<string, unknown>

const SILENT = new Set(['script', 'style', 'template', 'noscript', 'svg', 'head', 'meta', 'link'])
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'])

export const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()

export function nodeText(nodes: Node[]): string {
  const out: string[] = []
  const walk = (n: Node) => {
    if (typeof n === 'string') {
      out.push(n)
      return
    }
    if (SILENT.has(n.tag)) return
    const block = !INLINE.has(n.tag)
    if (block) out.push(' ')
    for (const c of n.children ?? []) walk(c)
    if (block) out.push(' ')
  }
  for (const n of nodes) walk(n)
  return normalize(out.join(''))
}

const flat = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(flat) : [])

/** English service copy: every editable text field of the service record (not image paths or ids). */
const SERVICE_TEXT = ['title', 'eyebrow', 'lead', 'overviewTitle', 'overview', 'principleTitle', 'principles', 'servicesTitle', 'services', 'signsTitle', 'signs', 'supportTitle', 'support', 'processTitle', 'process', 'decisionTitle', 'decision', 'faq', 'closing']

/** Typed editorial sections (new pages created in Payload). */
export function sectionsText(sections: unknown): string {
  const out: string[] = []
  for (const s of (Array.isArray(sections) ? sections : []) as Doc[]) {
    for (const k of ['heading', 'text', 'label', 'caption', 'alt', 'question', 'answer']) if (typeof s[k] === 'string') out.push(s[k] as string)
    if (Array.isArray(s.items)) for (const i of s.items as unknown[]) out.push(...(typeof i === 'object' && i ? Object.values(i as Doc).flatMap(flat) : flat(i)))
  }
  return normalize(out.join(' '))
}

/** The searchable body text of a composed public document, per family. */
export function publicBodyText(family: string, doc: Doc): string {
  if (family === 'english-service') return normalize(SERVICE_TEXT.flatMap((k) => flat(doc[k])).join(' '))
  if (family === 'editorial') return normalize(`${String(doc.lead ?? '')} ${sectionsText(doc.sections)}`)
  return nodeText((doc.children as Node[] | undefined) ?? [])
}
