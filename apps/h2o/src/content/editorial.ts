import type { Block, Field } from 'payload'
import { BoldFeature, FixedToolbarFeature, ItalicFeature, lexicalEditor, LinkFeature, ParagraphFeature } from '@payloadcms/richtext-lexical'
import { lexicalToNodes, type LexicalState } from './content-slots'
import type { RouteRecord } from './compose'

/**
 * Pages created in Payload (family `editorial`, R1B, Control Tower F1/C5).
 *
 * New pages and articles are composed from typed blocks, never from a document tree: heading, rich-text
 * paragraph (bold, italic, links), image (media upload + alt + caption), button (label, destination, quote
 * intent) and FAQ. They render through the runtime `EditorialPage` template inside the accepted site chrome.
 * Identity (route id, path key, canonical, family, disposition) is set by the server from the validated slug
 * and publication policy; an editor cannot supply them.
 */
/** Rich text the templates render: paragraphs, bold, italic, links. Shared by page elements and sections. */
export const RESTRICTED_RICH_TEXT = lexicalEditor({ features: () => [ParagraphFeature(), BoldFeature(), ItalicFeature(), LinkFeature({ enabledCollections: [] }), FixedToolbarFeature()] })

export const EDITORIAL_BLOCKS: Block[] = [
  { slug: 'heading', labels: { singular: 'Heading', plural: 'Headings' }, fields: [{ name: 'text', type: 'text', required: true }, { name: 'level', type: 'select', options: ['2', '3'], defaultValue: '2', required: true }] },
  { slug: 'paragraph', labels: { singular: 'Paragraph', plural: 'Paragraphs' }, fields: [{ name: 'content', type: 'richText', required: true, editor: RESTRICTED_RICH_TEXT }] },
  {
    slug: 'image',
    labels: { singular: 'Image', plural: 'Images' },
    fields: [
      { name: 'image', type: 'upload', relationTo: 'media', required: true },
      { name: 'alt', type: 'text', admin: { description: 'Leave empty to use the media item’s alt text.' } },
      { name: 'caption', type: 'text' },
      { name: 'imageUrl', type: 'text', admin: { hidden: true } },
      { name: 'imageWidth', type: 'number', admin: { hidden: true } },
      { name: 'imageHeight', type: 'number', admin: { hidden: true } },
      { name: 'mediaAlt', type: 'text', admin: { hidden: true } },
    ],
  },
  {
    slug: 'button',
    labels: { singular: 'Button', plural: 'Buttons' },
    fields: [
      { name: 'label', type: 'text', required: true },
      { name: 'href', type: 'text', admin: { description: 'Internal path (e.g. /contact-us/). A quote button uses the approved quote form instead.' } },
      { name: 'intent', type: 'select', options: [{ label: 'Link', value: 'none' }, { label: 'Request a quote (approved quote form)', value: 'quote' }], defaultValue: 'none', required: true },
    ],
  },
  { slug: 'faq', labels: { singular: 'FAQ', plural: 'FAQs' }, fields: [{ name: 'items', type: 'array', fields: [{ name: 'question', type: 'text', required: true }, { name: 'answer', type: 'textarea', required: true }] }] },
]

export const editorialFields: Field[] = [
  { name: 'lead', type: 'textarea', admin: { condition: (d) => d?.family === 'editorial', description: 'Intro shown under the page heading.' } },
  { name: 'sections', type: 'blocks', blocks: EDITORIAL_BLOCKS, admin: { condition: (d) => d?.family === 'editorial' } },
]

/** Allowed shape of a new page path: one or two lower-case slug segments, trailing slash. */
export const EDITORIAL_PATH = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?$/
/** Namespaces owned by the application, imported families or other surfaces. */
export const RESERVED_PREFIXES = ['/api/', '/admin/', '/crm/', '/_next/', '/media/', '/pagefind/', '/search/', '/product/', '/product-category/', '/product-tag/', '/category/', '/tag/', '/author/', '/my-account/', '/cart/', '/checkout/', '/shop/', '/feed/', '/wp-', '/preview/', '/internal/', '/ja/', '/jp/', '/th/']

export function editorialPathProblem(path: string): string | null {
  if (!EDITORIAL_PATH.test(path)) return 'Use lower-case words separated by hyphens, e.g. /cooling-tower-news/ or /news/new-tower-launch/.'
  if (RESERVED_PREFIXES.some((p) => path.startsWith(p) || `${path}` === p)) return 'That address belongs to another part of the site.'
  return null
}

type Doc = Record<string, unknown>
export function composeEditorial(record: RouteRecord, _stored: Doc): Doc {
  void _stored
  const sections = ((record.sections ?? []) as Doc[]).map((s) => {
    if (s.blockType === 'paragraph') return { blockType: 'paragraph', nodes: lexicalToNodes(s.content as LexicalState), text: plain(s.content as LexicalState) }
    if (s.blockType === 'image') return { blockType: 'image', src: s.imageUrl ?? null, width: s.imageWidth ?? null, height: s.imageHeight ?? null, alt: (s.alt as string) || (s.mediaAlt as string) || '', caption: s.caption ?? null }
    if (s.blockType === 'faq') return { blockType: 'faq', items: ((s.items as Doc[]) ?? []).map((i) => ({ question: String(i.question ?? ''), answer: String(i.answer ?? '') })) }
    if (s.blockType === 'button') return { blockType: 'button', label: String(s.label ?? ''), href: String(s.href ?? ''), intent: s.intent === 'quote' ? 'quote' : 'none' }
    return { blockType: 'heading', text: String(s.text ?? ''), level: s.level === '3' ? 3 : 2 }
  })
  return {
    family: 'editorial', routeId: record.routeId, targetPath: record.path, title: record.title, lead: record.lead ?? '',
    seo: { title: record.seo?.title || record.title, description: record.seo?.description || record.lead || '' },
    sections,
  }
}

function plain(state: LexicalState | null | undefined): string {
  const out: string[] = []
  const walk = (n: { text?: string; children?: unknown[] }) => {
    if (typeof n.text === 'string') out.push(n.text)
    for (const c of (n.children ?? []) as never[]) walk(c)
  }
  if (state?.root) walk(state.root as never)
  return out.join(' ')
}
