import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { composePublicDocument } from '../compose'
import { emailShapedCount, NEUTRAL_AUTHOR_LABEL, projectPublicAuthor } from '../public-author'

/** ADR-028 with a SYNTHETIC marker only (the real author value is never written into tests or evidence). */
const MARK = 'synthetic.author.marker@example.test'
const APP = path.resolve(__dirname, '../../..')
const base = () => JSON.parse(readFileSync(path.join(APP, 'content/salmon/documents/SALMON-posts-3968.json'), 'utf8')) as Record<string, unknown>

describe('public author projection (ADR-028)', () => {
  it('an author archive: title, H1, SEO, schema, body and captured structures carry no email; route kept', () => {
    const doc = { routeId: 'SALMON-x', targetPath: '/author/x/', title: `Author: ${MARK}`, seo: { title: MARK, h1: [MARK], meta: [{ name: 'description', value: `Posts by ${MARK}` }], schema: [JSON.stringify({ '@type': 'Person', name: MARK, email: MARK })] }, children: [{ tag: 'h1', attrs: {}, children: [MARK] }, { tag: 'a', attrs: { href: `mailto:${MARK}` }, children: ['mail'] }], structures: [{ text: `Author: ${MARK}` }] }
    const out = projectPublicAuthor(doc)
    expect(emailShapedCount(out)).toBe(0)
    expect(JSON.stringify(out)).toContain(NEUTRAL_AUTHOR_LABEL)
    expect(out.targetPath).toBe('/author/x/')
    expect(JSON.stringify(out)).toContain('/contact-us/')
    expect(JSON.stringify(out)).not.toMatch(/synthetic\.author|Synthetic Author/i) // never a name inferred from the local part
  })
  it('an article: "Written by" meta and the avatar caption in JSON-LD lose the email; body content is untouched', () => {
    const d = base() as { seo: { meta: Array<{ name: string; value: string }>; schema: string[] }; children: unknown[] }
    d.seo.meta.push({ name: 'twitter:data1', value: MARK })
    d.seo.schema = [JSON.stringify({ '@graph': [{ '@type': 'ImageObject', caption: MARK }, { '@type': 'BlogPosting', author: { name: MARK } }] })]
    const composed = composePublicDocument({ routeId: 'SALMON-posts-3968', path: '/ai-cooling-tower-optimization/', family: 'salmon', title: 'T', document: d })
    expect(emailShapedCount(composed.seo)).toBe(0)
    expect(JSON.stringify(composed.children)).toBe(JSON.stringify(d.children))
  })
})
