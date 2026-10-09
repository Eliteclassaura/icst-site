import {describe,it,expect} from 'vitest'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {renderToStaticMarkup} from 'react-dom/server'
import {salmonRoutes,salmonRedirects,salmonRouteFor,salmonDocument,type SalmonMedia} from '../salmon'
import {SalmonCanonical} from '../SalmonCanonical'
import {generateMetadata} from '../../app/(site)/[[...slug]]/page'

describe('Salmon activation authority and safety',()=>{
  it('hash-verifies every effective source document and retains complete source trees',()=>{
    const rows=salmonRoutes();expect(rows).toHaveLength(1216)
    for(const r of rows){const doc=salmonDocument(r);expect(doc.text.length).toBeGreaterThan(0);expect(doc.children.length).toBeGreaterThan(0)}
  })
  it('activates all 583 articles and 194 products without duplicate effective URLs',()=>{
    const docs=salmonRoutes().map(salmonDocument)
    expect(docs.filter(d=>d.type==='posts')).toHaveLength(583)
    expect(docs.filter(d=>d.type==='product')).toHaveLength(194)
    expect(new Set(docs.map(d=>d.sourceUrl)).size).toBe(1216)
  })
  it('uses only verified alias destinations and has no redirect cycles',()=>{
    const active=new Set(salmonRoutes().map(r=>r.targetPath)),redirects=salmonRedirects()
    expect(redirects).toHaveLength(44)
    for(const r of redirects){expect(active.has(r.destination)).toBe(true);expect(active.has(r.source)).toBe(false)}
  })
  it('fails closed for unknown paths and the unavailable home alias',()=>{
    expect(salmonRouteFor(['not-authorized-by-salmon'])).toBeNull()
    expect(salmonRouteFor(['home'])).toBeNull()
    expect(salmonRouteFor(['about-ics-industrial-cooling-solutions'])).toBeNull()
  })
  it('preserves encoded multilingual authority paths',()=>{
    for(const r of salmonRoutes().filter(r=>r.targetPath.includes('%'))){const parts=r.targetPath.split('/').filter(Boolean);expect(salmonRouteFor(parts)?.routeId).toBe(r.routeId);expect(salmonRouteFor(parts.map(decodeURIComponent))?.routeId).toBe(r.routeId)}
  })
  it('locks runtime robots without mutating source metadata',async()=>{
    const r=salmonRoutes()[0]!,doc=salmonDocument(r),before=JSON.stringify(doc.seo)
    const meta=await generateMetadata({params:Promise.resolve({slug:r.targetPath.split('/').filter(Boolean).map(decodeURIComponent)})})
    expect(meta.robots).toEqual({index:false,follow:false});expect(JSON.stringify(salmonDocument(r).seo)).toBe(before)
  })
  it('activates byte-identical held media and rejects the invalid BEE HTML-as-PDF asset',()=>{
    const media=JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon/media-identities.json'),'utf8')) as SalmonMedia[]
    expect(media.filter(m=>!m.file)).toHaveLength(36)
    const invalid=media.find(m=>m.url==='https://beeindia.gov.in/sites/default/files/3Ch7.pdf')
    expect(invalid?.state).toBe('SOURCE_UNAVAILABLE')
    expect(invalid?.file).toBeUndefined()
    expect(existsSync(path.join(process.cwd(),'public/media/salmon/311bdf0bf6ce45b6f8a2130ca6f91c5c05ee471174071731304b4ed309b1ca60.pdf'))).toBe(false)
    for(const m of media.filter(m=>m.file)){const bytes=readFileSync(path.join(process.cwd(),'public/media/salmon',path.basename(m.file!)));expect(createHash('sha256').update(bytes).digest('hex')).toBe(m.sha256)}
  })
  it('preserves product content data while suppressing public prices and executable commerce',()=>{
    const r=salmonRouteFor(['product','frp-angles'])!,doc=salmonDocument(r)
    expect(doc.text).toContain('$3.29')
    const html=renderToStaticMarkup(<SalmonCanonical doc={doc}/>)
    expect(html).not.toContain('$3.29');expect(html.slice(html.indexOf('<main'))).not.toContain('<form');expect(html).not.toContain('<iframe');expect(html).not.toContain('onerror=')
    expect(html).not.toContain('$0.00');expect(html).not.toContain('product:price:currency')
    expect(salmonDocument(r).text).toContain('$3.29')
  })
})
