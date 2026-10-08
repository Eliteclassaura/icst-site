import {salmonMedia,salmonNodeText,type SalmonDocument,type SalmonNode} from './salmon'

/**
 * IMG-FIX-1 (Design Director ruling 2026-10-08, OGCS image flags): five article images are not shown. Each is a stock or AI-style
 * photograph of equipment that is not a cooling tower, and each hash is used on its own page only, whose copy already carries the
 * slide's content. They are dropped with their figure wrapper: no empty gap, no `<figure>` shell. The fifth flagged slide
 * (efficiency formula, "Range ÷ (Range + Approach) × 100") was a false positive: it stays, and its alt states the formula in words.
 */
export const DROPPED_ARTICLE_IMAGES: ReadonlyMap<string, string> = new Map([
  ['9f051ec8fef008a2144ce903d7404cd747e762a661aa8b7cbff08c0fbed29175', '/cooling-tower-efficiency-calculation/ (rooftop comfort-cooling condensers, not a tower)'],
  ['2babb003161430c95d9a5e4bbc2ab7cd776a6e694a604d9464049166a52ad9cb', '/cooling-tower-ton-calculation/ (wrapped residential AC outdoor unit)'],
  ['97b7063dc9d1c8eab0f1140badad9bd47d4fc0ad3959d48f450bfa3d53068544', '/cooling-tower-replacement-cost/ (AC condenser service photo with a third-party company name)'],
  ['41b0b8ff0f7487778ff10439a01111d2304495b7e22fcf30700c156864522c42', '/cooling-tower-makeup-water-calculation/ (AI illustration of towers among solar panels; "Drift Loss ($D$)" and "Blowdown ($B$)" baked into the slide; row 48, DD and CT 2026-10-08)'],
  ['2d5391cd8ac86e22a1b8a4cf0aeee3cb8ddabebe87371b7ca4a37875ad4c7dee', '/cooling-tower-buying-guide/ (HVAC ductwork installer; unsupported "Acoustic Certification" bullets)'],
])

export const ARTICLE_IMAGE_ALT: ReadonlyMap<string, string> = new Map([
  ['27aee0e42b506aeb4ccc48342261e81306813d3f3975f43194a393a7e4ee0227', 'Cooling tower efficiency in percent equals the range divided by the sum of the range and the approach, multiplied by 100.'],
])

const shaOf = (doc: SalmonDocument, node: Exclude<SalmonNode, string>): string | undefined =>
  node.tag === 'img' ? salmonMedia(node.attrs['data-src'] || node.attrs.src || '', doc.sourceUrl)?.sha256 : undefined

const imagesIn = (node: SalmonNode): Array<Exclude<SalmonNode, string>> =>
  typeof node === 'string' ? [] : node.tag === 'img' ? [node] : node.children.flatMap(imagesIn)

/** An image on the drop list, or a figure/paragraph that holds nothing but such images (and no text). */
export function isDroppedArticleImage(doc: SalmonDocument, node: Exclude<SalmonNode, string>): boolean {
  if (doc.type !== 'posts') return false
  if (node.tag === 'img') return DROPPED_ARTICLE_IMAGES.has(shaOf(doc, node) ?? '')
  if (!['figure', 'p', 'div'].includes(node.tag)) return false
  const images = imagesIn(node)
  return images.length > 0 && images.every((image) => DROPPED_ARTICLE_IMAGES.has(shaOf(doc, image) ?? '')) && salmonNodeText(node).replace(/\s+/g, '') === ''
}

export const articleImageAlt = (doc: SalmonDocument, node: Exclude<SalmonNode, string>): string | undefined =>
  doc.type === 'posts' ? ARTICLE_IMAGE_ALT.get(shaOf(doc, node) ?? '') : undefined
