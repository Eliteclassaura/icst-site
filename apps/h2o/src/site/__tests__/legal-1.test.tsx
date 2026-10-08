/**
 * LEGAL-1 (owner: legal pages approved, publish at launch; CT 2026-10-08): the four pages carry OGCS's LEGAL-FINAL-1 text
 * unchanged, no drafting brackets remain, and the pages are indexable, in the sitemap and linked from the footer.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page,{generateMetadata,generateStaticParams} from '../../app/(site)/[[...slug]]/page'
import {LuxuryFooter,FOOTER_LEGAL_LINKS} from '../LuxuryShell'
import {LEGAL_PAGES,LEGAL_NEW_ROWS,legalPageForPath,withLegalRows} from '../legal-routes'
import {markdownBlocks} from '../markdown-lite'
import {sitemapEntries} from '../../content/sitemap'
import NotFound from '../../app/(site)/not-found'

const APP=process.cwd()
const env={...process.env}
afterEach(()=>{process.env={...env}})
const read=(f:string)=>readFileSync(path.join(APP,'content/legal',f),'utf8')
const sha=(s:string)=>createHash('sha256').update(s).digest('hex')
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const SOURCE:Record<string,string>={'privacy-policy.md':'PRIVACY_NOTICE.md','terms-of-use.md':'TERMS_OF_USE.md','cookie-notice.md':'COOKIE_NOTICE.md','accessibility.md':'ACCESSIBILITY_STATEMENT.md','form-notice.md':'FORM_NOTICE.md'}

describe('the texts',()=>{
  it('are OGCS\'s files byte for byte (the sums of the sealed LEGAL-FINAL-1 folder)',()=>{
    const sums=new Map(read('SOURCE_SHA256SUMS').trim().split('\n').map(l=>{const [h,f]=l.split(/\s+/);return [f!,h!] as const}))
    for(const [file,original] of Object.entries(SOURCE))expect(sha(read(file)),file).toBe(sums.get(original))
  })
  it('hold no drafting bracket: the only brackets are Markdown links',()=>{
    for(const file of Object.keys(SOURCE)){
      const text=read(file)
      expect(text.replace(/\[[^\]]+\]\([^)\s]+\)/g,''),file).not.toMatch(/[[\]]/)
      expect(text,file).not.toMatch(/\b(?:COUNSEL|DRAFT|TODO|TBD)\b|lorem ipsum/)
    }
  })
})

describe('the pages',()=>{
  it('render each text as one H1 and its headings, with every Markdown link as a link and no bracket left',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const page of LEGAL_PAGES){
      const html=await render(page.path)
      const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'))
      expect((main.match(/<h1\b/g)??[]).length,page.path).toBe(1)
      const title=read(page.file).split('\n')[0]!.replace(/^# /,'')
      expect(main,page.path).toContain(`>${title}</h1>`)
      const headings=read(page.file).split('\n').filter(l=>/^## /.test(l)).map(l=>l.replace(/^## /,''))
      for(const heading of headings)expect(main,`${page.path} ${heading}`).toContain(`>${heading.replace(/&/g,'&amp;')}</h2>`)
      expect(main.replace(/<[^>]+>/g,' '),page.path).not.toMatch(/[[\]]/)
      expect(main,page.path).not.toMatch(/\*\*|\]\(/)
    }
  },240000)
  it('state their date and the quote-request facts exactly as written',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const privacy=await render('/privacy-policy/')
    expect(privacy).toContain('<strong>Effective date:</strong> 9 October 2026')
    expect(privacy).toContain('<table>')
    expect(privacy).toContain('privacy@h2ocooling.com')
    // the nested provider list is a list inside a list item
    expect(privacy).toMatch(/<li><strong>Service providers<\/strong>[^<]*<ul><li><strong>Google Workspace<\/strong>/)
    expect(await render('/terms-of-use/')).toContain('<strong>Effective date:</strong> 9 October 2026')
    expect(await render('/cookie-notice/')).toContain('<code>h2o.rfq.draft.v1</code>')
    const accessibility=await render('/accessibility/')
    expect(accessibility).toContain('We prepared this statement on 9 October 2026.')
    expect(accessibility).toContain('+662-661-7723')
    expect(accessibility).not.toMatch(/260-6598|\+66-2-/)
  },240000)
  it('are indexable under the production policy, with their own canonical, and answered before any lookup',async()=>{
    process.env.H2O_INDEXING_POLICY='production'
    for(const page of LEGAL_PAGES){
      const meta=await generateMetadata({params:Promise.resolve({slug:page.path.split('/').filter(Boolean)}),searchParams:Promise.resolve({})})
      expect(meta.alternates?.canonical,page.path).toBe(`https://h2ocooling.com${page.path}`)
      expect(meta.robots,page.path).toEqual({index:true,follow:true})
      expect(JSON.stringify(meta.title),page.path).toContain(page.title)
    }
    expect(legalPageForPath('/terms-of-use/')?.file).toBe('terms-of-use.md')
    expect(legalPageForPath('/other/')).toBeUndefined()
    const params=generateStaticParams().map(p=>p.slug.join('/'))
    for(const slug of ['terms-of-use','cookie-notice','accessibility'])expect(params).toContain(slug)
  })
})

describe('the release',()=>{
  const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;state:string;sitemap?:boolean;indexable?:boolean;canonical?:string|null;routeClass?:string}>}
  it('adds the three new pages as PUBLIC, indexable, sitemap rows once; /privacy-policy/ keeps its imported row',()=>{
    const with1=withLegalRows(ledger)
    expect(with1.routes.length).toBe(ledger.routes.length+3)
    expect(withLegalRows(with1).routes.length).toBe(with1.routes.length)
    expect(LEGAL_NEW_ROWS.map(r=>r.path)).toEqual(['/terms-of-use/','/cookie-notice/','/accessibility/'])
    for(const row of LEGAL_NEW_ROWS)expect(row).toMatchObject({state:'PUBLIC',indexable:true,sitemap:true,canonical:`https://h2ocooling.com${row.path}`})
    expect(with1.routes.filter(r=>r.path==='/privacy-policy/')).toHaveLength(1)
  })
  it('lists all four pages in the page sitemap',()=>{
    const entries=sitemapEntries({rows:withLegalRows(ledger).routes,origin:'https://h2ocooling.com',redirected:new Set(),gone:new Set(),noindexFollow:new Set(),locale:{clusters:[],languages:{}}})
    for(const page of LEGAL_PAGES){
      const entry=entries.find(e=>e.loc===`https://h2ocooling.com${page.path}`)
      expect(entry,page.path).toBeDefined()
      expect(entry!.child,page.path).toBe('page-sitemap.xml')
    }
  })
  it('links all four from the footer\'s legal row, and leaves the privacy link to the chrome content',()=>{
    const footer=renderToStaticMarkup(<LuxuryFooter/>)
    const legal=footer.slice(footer.indexOf('class="sp-footer-legal"'))
    for(const href of ['/privacy-policy/','/terms-of-use/','/cookie-notice/','/accessibility/'])expect(legal,href).toContain(`href="${href}"`)
    expect(FOOTER_LEGAL_LINKS.map(l=>l.label)).toEqual(['Terms of Use','Cookie Notice','Accessibility'])
  })
})

describe('markdown-lite',()=>{
  it('renders the forms the texts use and nothing else',()=>{
    const html=renderToStaticMarkup(<>{markdownBlocks('# T\n\nA **b** `c` [d](/e/) f\n- one\n  - two\n- three\n\n| H | I |\n|---|---|\n| x | y |\n')}</>)
    expect(html).toContain('<h1>T</h1>')
    expect(html).toContain('<p>A <strong>b</strong> <code>c</code> <a href="/e/">d</a> f</p>')
    expect(html).toContain('<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul>')
    // a table that can scroll sideways is a keyboard-reachable, named region (axe scrollable-region-focusable)
    expect(html).toContain('<div class="legal-table" role="region" aria-label="T, table" tabindex="0">')
    expect(html).toContain('<th scope="col">H</th>')
    expect(html).toContain('<th scope="row">x</th><td>y</td>')
  })
})

// Owner via CT 2026-10-08: Terms of Use is approved and sits in the footer with the other three legal pages.
const LEGAL_HREFS=['/privacy-policy/','/terms-of-use/','/cookie-notice/','/accessibility/']
const TEMPLATES:Array<[string,string]>=[
  ['home','/'],['about','/about-ics/'],['contact','/contact-us/'],['article','/cooling-tower-approach/'],['article index','/tech-articles/'],['resources','/resources/'],
  ['product','/product/frp-angles/'],['parts hub','/cooling-tower-parts-online/'],['parts category','/fans/'],['parts series','/class-1000/'],
  ['projects','/all-projects/'],['project','/all-projects/kbr/'],['service','/crossflow-cooling-tower-repair-maintenance/'],['R4 service','/thermal-upgrade/'],
  ['location','/cooling-tower-thailand/'],['legal','/terms-of-use/'],['legal','/privacy-policy/'],
]
describe('the footer carries all four legal links (owner via CT 2026-10-08)',()=>{
  const row=(html:string)=>{const at=html.indexOf('class="sp-footer-legal"');expect(at,'footer legal row present').toBeGreaterThan(-1);return html.slice(at,html.indexOf('</div>',at))}
  it('on every page template, each link a trailing-slash URL',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const [name,target] of TEMPLATES){
      const legal=row(await render(target))
      for(const href of LEGAL_HREFS)expect(legal,`${name} ${target} ${href}`).toContain(`href="${href}"`)
      expect([...legal.matchAll(/href="([^"]+)"/g)].every(m=>m[1]!.endsWith('/')),`${name} trailing slashes`).toBe(true)
    }
  },600000)
  it('on the 404 page',()=>{
    const legal=row(renderToStaticMarkup(<NotFound/>))
    for(const href of LEGAL_HREFS)expect(legal).toContain(`href="${href}"`)
  })
  it('one row at every width: the row wraps and keeps its tap size (the 390 mobile footer is the same markup)',()=>{
    const css=readFileSync(path.join(APP,'src/app/(site)/design-r5.css'),'utf8')
    expect(css).toMatch(/\.global-chrome \.sp-footer-legal a \{\s*padding-block: 4px;/)
    expect(readFileSync(path.join(APP,'src/app/(site)/salmon-families.css'),'utf8')).toMatch(/\.global-chrome \.sp-footer-legal \{\s*display: flex;\s*flex-wrap: wrap;/)
  })
  it('each of the four answers: a page renders for every href (no 404)',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const href of LEGAL_HREFS)expect(await render(href),href).toContain('class="legal-doc"')
  },240000)
})
