/**
 * Comparable form of a page element's value (shared by build-slot-fixes and apply-seo-pass). Payload round-trips rich text
 * with extra keys (textFormat, textStyle, version …), so compare what renders: text runs with their bold/italic format, links
 * with their URL, and line breaks.
 */
export function lexicalCanon(state) {
  const out = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'text') out.push(['t', n.text ?? '', Number(n.format ?? 0) & 3])
    else if (n.type === 'linebreak') out.push(['br'])
    else if (n.type === 'link') {
      out.push(['a', n.fields?.url ?? ''])
      ;(n.children ?? []).forEach(walk)
      out.push(['/a'])
    } else (n.children ?? []).forEach(walk)
    if (n.type === 'paragraph') out.push(['p'])
  }
  walk(state?.root)
  return JSON.stringify(out)
}
/** The comparable value of one slot field. */
export const slotFieldCanon = (slot, field) => (field === 'text' ? lexicalCanon(slot?.text) : JSON.stringify(slot?.[field] ?? ''))
