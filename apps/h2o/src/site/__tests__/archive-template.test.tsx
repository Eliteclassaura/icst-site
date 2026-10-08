/**
 * Archive template and quote-only cleanup (Control Tower ruling 2026-10-02): every public product/article archive
 * renders through the styled archive template with one H1, verified cards and public page links only, and no sort
 * control, rating, price or WooCommerce UI anywhere in it. Product pages carry no review schema and no empty
 * literature panel.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {mkdirSync,mkdtempSync,readFileSync,renameSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {NextRequest} from 'next/server'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonDocument,salmonRoutes} from '../salmon'
import {ARCHIVE_PATH,archiveModel,decodeEntities} from '../ArchivePresentation'
import {R5ProductDetail} from '../r5/R5Product' // Design R5a: the shipped product detail
import {activeProductRoutes,productPanels} from '../Wave3Products'
import {categoryAndFamilyGate} from '../gate'
import {ProductCard} from '../SalmonComposer'
import {EMPTY_ARCHIVE_PAGES,EMPTY_ARCHIVE_PATHS} from '../../content/empty-archives'

type Row={path:string;routeId:string;state:string;export:boolean;sitemap:boolean;searchable?:boolean}
const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Row[]}
const publicPaths=new Set(ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export).map(row=>row.path))
const archives=ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&ARCHIVE_PATH.test(row.path))
const FORBIDDEN=/orderby|Sort by|Default sorting|star-rating|Rated\s*<|Rated \d|out of 5|woocommerce|add_to_cart|Add to cart|Read more|Price-amount|"price"|aggregateRating|"Review"/i
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})

describe('archive template',()=>{
  it('covers the 365 public archive routes (product-category, product-tag, category, tag)',()=>{
    expect(archives).toHaveLength(365)
  })
  it('renders every public archive through the styled template with no sort, ratings, prices or WooCommerce UI',async()=>{
    let products=0,articles=0
    // R2.4 R2: an empty archive's page N is a 404 (seo-fixes-r24.test.tsx)
    for(const row of archives.filter(r=>!EMPTY_ARCHIVE_PAGES.has(r.path))){
      const html=await render(row.path)
      const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'))
      expect(html,row.path).toContain('data-archive-template="SALMON_ARCHIVE_R1"')
      expect(main.match(/<h1\b/g),row.path).toHaveLength(1)
      expect(main,row.path).not.toMatch(FORBIDDEN)
      expect(main,row.path).not.toMatch(/&amp;(?:amp|#\d+|#x[0-9a-f]+|[a-z]+);/i)
      expect(html.slice(html.indexOf('<script'),html.lastIndexOf('</script>')),row.path).not.toMatch(/aggregateRating|"@type":"Review"/)
      for(const [,href] of main.matchAll(/<nav class="sp-section-inner sp-archive-pages"[\s\S]*?<\/nav>/g).next().value?.[0].matchAll(/href="([^"]+)"/g)??[])expect(publicPaths.has(href!),`${row.path} → ${href}`).toBe(true)
      if(main.includes('data-salmon-product-card')){products++;for(const [,route] of main.matchAll(/data-product-route="([^"]+)"/g))expect(publicPaths.has(route!),`${row.path} card ${route}`).toBe(true)}
      if(main.includes('sp-archive-article')){articles++;for(const [,route] of main.matchAll(/data-article-route="([^"]+)"/g))expect(publicPaths.has(route!),`${row.path} article ${route}`).toBe(true)}
    }
    expect(products).toBe(168) // SEO-CONTENT-1 round 2: the vibration-switch placeholder's only archive is now empty
    // Locale Part B: the published Thai Salmon page lists on two more archives.
    expect(articles).toBe(53)
  },240000)
  it('keeps the archive name as H1, the source breadcrumb, the result count and the pagination',()=>{
    const doc=salmonDocument(salmonRoutes().find(route=>route.targetPath==='/product-category/fans/')!)
    const model=archiveModel(doc)
    expect(model.name).toBe('Fans')
    expect(model.breadcrumb).toEqual([{label:'Home',href:'/'},{label:'Fans'}])
    expect(model.resultCount).toBe('Showing 1–16 of 22 results')
    expect(model.products).toHaveLength(16)
    expect(model.pages).toEqual([{label:'1',current:true},{label:'2',href:'/product-category/fans/page/2/'},{label:'Next',href:'/product-category/fans/page/2/',rel:'next'}])
    const blog=archiveModel(salmonDocument(salmonRoutes().find(route=>route.targetPath==='/category/blog/page/2/')!))
    expect(blog.name).toBe('Blog')
    expect(blog.pages.map(link=>link.rel)).toEqual(['prev','next'])
  })
  it('opens Request a Quote with genuine product context on product archives only (D1 extension)',()=>{
    const routes=ledger.routes.map(row=>({...row,routeClass:(row as Row&{routeClass?:string}).routeClass??''}))
    const product=salmonDocument(activeProductRoutes().find(route=>route.targetPath==='/product/amarillo-a-series-double-reduction-gearbox/')!)
    const options={env:{H2O_TYPEFORM_FORM_ID:'F22cAgx3',H2O_TYPEFORM_ORIGIN:'https://form.typeform.com'},routes:routes as never}
    for(const listing of ['/product-tag/amarillo/','/product-tag/amarillo/page/2/','/product-category/fans/'])expect(categoryAndFamilyGate(listing,product,product.targetPath,options),listing).toMatchObject({mounted:true,productId:'4791'})
    expect(categoryAndFamilyGate('/category/blog/',product,product.targetPath,options)).toMatchObject({mounted:false,reason:'MOUNT_NOT_AUTHORIZED_FOR_PUBLIC'})
  })
})

describe('archive edge cases (Control Tower amendments)',()=>{
  it('empty archives: the generated set is exact, each renders the empty state with Parts and Contact links',async()=>{
    const empties:string[]=[]
    for(const row of archives){const doc=salmonDocument(salmonRoutes().find(route=>route.targetPath===row.path)!);const model=archiveModel(doc);if(!model.products.length&&!model.articles.length)empties.push(row.path)}
    expect(empties.sort()).toEqual([...EMPTY_ARCHIVE_PATHS])
    expect(EMPTY_ARCHIVE_PATHS).toHaveLength(144) // + /product-category/uncategorized/ (SEO-CONTENT-1 round 2)
    for(const p of ['/category/cooling-tower-cost/',EMPTY_ARCHIVE_PATHS.find(path=>path.startsWith('/product-tag/'))!]){
      const html=await render(p)
      expect(html,p).toMatch(/<p class="sp-archive-empty">Nothing is listed here yet\. <a href="\/cooling-tower-parts-online\/">Browse cooling tower parts<\/a> or <a href="\/contact-us\/">contact us<\/a>\.<\/p>/)
      expect(html.slice(html.indexOf('<main'),html.indexOf('</main>')).match(/<h1\b/g),p).toHaveLength(1)
    }
    for(const p of EMPTY_ARCHIVE_PATHS)expect(ledger.routes.find(row=>row.path===p),p).toMatchObject({state:'PUBLIC',export:true,searchable:false})
  },120000)
  it('empty archives are noindex,follow and out of the sitemap under the production policy, even where the ledger says indexable',async()=>{
    const root=mkdtempSync(path.join(tmpdir(),'h2o-empty-'))
    mkdirSync(path.join(root,'generations','g'),{recursive:true})
    const rows=ledger.routes.filter(row=>EMPTY_ARCHIVE_PATHS.includes(row.path)||row.path==='/contact-us/').map(row=>({...row}))
    expect(rows.filter(row=>EMPTY_ARCHIVE_PATHS.includes(row.path)&&(row as Row&{indexable:boolean}).indexable).length).toBe(28) // Locale Part B: one indexable archive now lists the published Thai page
    writeFileSync(path.join(root,'generations','g','ledger.json'),JSON.stringify({routes:rows,redirects:[]}))
    mkdirSync(path.join(root,'releases'),{recursive:true})
    writeFileSync(path.join(root,'releases','r-g.json'),JSON.stringify({format:1,id:'r-g',content:'g',search:'s-g'}))
    symlinkSync('releases/r-g.json',path.join(root,'release.tmp'));renameSync(path.join(root,'release.tmp'),path.join(root,'release'))
    process.env.H2O_CONTENT_SOURCE='payload';process.env.CONTENT_SNAPSHOT_DIR=root;process.env.H2O_INDEXING_POLICY='production'
    const {proxy}=await import('../../proxy')
    for(const p of EMPTY_ARCHIVE_PATHS)expect(proxy(new NextRequest(`https://h2ocooling.com${p}`)).headers.get('x-robots-tag'),p).toBe('noindex, follow')
    const sitemap=((await import('../../content/sitemap-response')).sitemapEntriesFor()??[]).map(e=>`<loc>${e.loc}</loc>`).join('\n')
    for(const p of EMPTY_ARCHIVE_PATHS)expect(sitemap,p).not.toContain(`https://h2ocooling.com${p}<`)
    expect(sitemap).toContain('<loc>https://h2ocooling.com/contact-us/</loc>')
  })
  it('a one-item archive renders a single card; product images fill the card up to native size; a missing image shows a text fallback',async()=>{
    const html=await render('/product-category/fill-media/hybrid-fill/')
    expect(html.match(/data-salmon-product-card=""/g)).toHaveLength(1)
    const doc=salmonDocument(salmonRoutes().find(route=>route.targetPath==='/product-category/fill-media/hybrid-fill/')!)
    const card=archiveModel(doc).products[0]!
    expect(html).toContain(`max-inline-size:min(100%, ${card.media!.width}px)`)
    const bare=renderToStaticMarkup(<ProductCard product={{...card,media:undefined}} ctx={{mediaFallback:'Image not available',fillMedia:true}}/>)
    expect(bare).toContain('<span class="sp-product-media sp-product-media--none" aria-hidden="true">Image not available</span>')
  })
  it('decodes double-escaped source names once (no &amp;amp;)',()=>{
    expect(decodeEntities('Fans &amp;amp; Motors &#8211; A&amp;B')).toBe('Fans & Motors – A&B')
  })
})

describe('product pages: quote-only',()=>{
  // 17 panels printed "none", one a bare "Manual" label, and one (Addax LRX650-425) links only a catalogue PDF that
  // is not held, which the public projection already unlinks: 19 panels with no document are omitted.
  it('omit the literature panel when it holds no document link',()=>{
    let hidden=0
    for(const route of activeProductRoutes()){
      const doc=salmonDocument(route)
      const literature=productPanels(doc).find(panel=>panel.kind==='literature')
      const html=renderToStaticMarkup(<R5ProductDetail doc={doc}/>)
      const shown=html.includes('data-product-module="literature"')
      if(literature&&!shown)hidden++
      if(shown)expect(html.slice(html.indexOf('data-product-module="literature"')).slice(0,4000),route.targetPath).toMatch(/<a [^>]*href=/)
    }
    expect(hidden).toBe(19)
  },120000)
  it('carry no rating or review schema',()=>{
    const doc=salmonDocument(activeProductRoutes().find(route=>route.targetPath==='/product/amarillo-a-series-double-reduction-gearbox/')!)
    expect(doc.seo.schema.join('')).toMatch(/aggregateRating/)
    const html=renderToStaticMarkup(<R5ProductDetail doc={doc}/>)
    expect(html).not.toMatch(/aggregateRating|"@type":"(?:Review|AggregateRating)"|"review"/)
  })
})

describe('shop remnants',()=>{
  it('are out of the sitemap and search; their 301s to /contact-us/ are admin redirect records',()=>{
    for(const remnant of ['/cart/','/checkout/','/my-account/','/my-account/lost-password/']){
      const row=ledger.routes.find(candidate=>candidate.path===remnant)!
      expect(row,remnant).toMatchObject({sitemap:false,searchable:false})
    }
  })
})
