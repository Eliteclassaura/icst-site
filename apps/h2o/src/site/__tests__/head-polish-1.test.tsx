/**
 * HEAD-POLISH-1 (CT 2026-10-09): the head carries nothing from the retired WordPress stack, the four legal pages have a full social
 * set and a WebPage node, the browser colour is the ICS blue, an indexable production page states its snippet allowance, and a
 * product's JSON-LD names its own URL and the manufacturer its title leads with.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {resolveRobots} from 'next/dist/lib/metadata/resolvers/resolve-basics'
import Page,{generateMetadata} from '../../app/(site)/[[...slug]]/page'
import {viewport} from '../../app/(site)/layout'
import {SalmonSeo} from '../SalmonCanonical'
import {salmonDocument,salmonRoutes,staleHeadMeta} from '../salmon'
import {LEGAL_PAGES} from '../legal-routes'
import {legalWebPage} from '../LegalPage'
import {PRODUCT_BRANDS,productBrand} from '../schema-graph'
import {INDEXABLE_ROBOTS,richRobots} from '../../content/config'
import {dispatch} from './seo-fix-1.test'

const APP=process.cwd()
const env={...process.env}
afterEach(()=>{process.env={...env}})
const params=(p:string)=>({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})})
const metaNames=(html:string)=>[...html.matchAll(/<meta\b[^>]*?\b(?:name|property)="([^"]+)"/g)].map(m=>m[1]!)
const docs=()=>salmonRoutes().map(salmonDocument)
const ARCHIVES=new Set(['categories','tags','product_cat','product_tag'])

describe('HEAD-POLISH-1 (1): no WordPress, Elementor or WooCommerce leftovers in any head',()=>{
  it('the head of every imported document names no generator, tile image or price/availability tag (all documents)',()=>{
    let n=0
    for(const doc of docs()){
      const names=metaNames(renderToStaticMarkup(<SalmonSeo doc={doc}/>))
      for(const stale of ['generator','msapplication-TileImage','product:price:currency','product:availability'])expect(names,`${doc.targetPath} ${stale}`).not.toContain(stale)
      n++
    }
    expect(n).toBeGreaterThan(1000)
  },240000)
  it('a taxonomy archive is a website, not an article: no article:*, og:updated_time or "Written by" labels; posts keep theirs',()=>{
    const counts={archives:0,posts:0}
    for(const doc of docs()){
      const names=metaNames(renderToStaticMarkup(<SalmonSeo doc={doc}/>))
      if(ARCHIVES.has(doc.type)){
        counts.archives++
        expect(names.filter(n=>/^article:|^og:updated_time$|^twitter:(?:label|data)\d*$/.test(n)),doc.targetPath).toEqual([])
        const html=renderToStaticMarkup(<SalmonSeo doc={doc}/>)
        expect(html,doc.targetPath).toMatch(/property="og:type" content="website"/)
      }
      if(doc.type==='posts'&&counts.posts<40){
        counts.posts++
        expect(names,doc.targetPath).toContain('og:type')
      }
    }
    expect(counts.archives).toBeGreaterThan(50)
    const post=docs().find(d=>d.type==='posts'&&d.seo.meta.some(m=>m.name==='article:published_time'))!
    const html=renderToStaticMarkup(<SalmonSeo doc={post}/>)
    expect(html).toMatch(/property="article:published_time"/)
    expect(html).toMatch(/property="og:type" content="article"/)
  },240000)
  it('only the named tags are filtered: description, canonical-bearing and ordinary social tags are not',()=>{
    const page=docs().find(d=>d.type==='pages')!
    const post=docs().find(d=>d.type==='posts')!
    for(const m of ['og:title','og:description','twitter:card','og:image','article:published_time','og:updated_time'])expect(staleHeadMeta({name:m,value:'x'},post),m).toBe(false)
    expect(staleHeadMeta({name:'generator',value:'WordPress 7.0.5'},page)).toBe(true)
    expect(staleHeadMeta({name:'generator',value:'Elementor 3.27.0; features: e_dom_optimization'},post)).toBe(true)
    expect(staleHeadMeta({name:'msapplication-TileImage',value:'https://x/y.png'},page)).toBe(true)
  })
  it('a rendered page of each document type carries no generator meta (whole page, not just the SEO block)',()=>{
    const seen=new Set<string>()
    for(const doc of docs()){
      if(seen.has(doc.type))continue
      seen.add(doc.type)
      const html=renderToStaticMarkup(dispatch(doc))
      expect(metaNames(html),`${doc.type} ${doc.targetPath}`).not.toContain('generator')
      expect(html,doc.targetPath).not.toMatch(/WordPress \d|Elementor \d/)
    }
    expect(seen.size).toBeGreaterThanOrEqual(5)
  },240000)
})

describe('HEAD-POLISH-1 (2): the legal pages',()=>{
  it('have a 20–65 character title, OG and Twitter tags with the default share image, and a WebPage node with dateModified',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const page of LEGAL_PAGES){
      expect(page.title.length,page.title).toBeGreaterThanOrEqual(20)
      expect(page.title.length,page.title).toBeLessThanOrEqual(65)
      expect(page.title).toMatch(/\| ICS Industrial Cooling Solutions$/)
      const html=renderToStaticMarkup(await Page(params(page.path)))
      const names=metaNames(html)
      for(const n of ['og:title','og:description','og:url','og:site_name','og:type','og:image','twitter:card','twitter:title','twitter:description','twitter:image'])expect(names,`${page.path} ${n}`).toContain(n)
      expect(html,page.path).toContain(`property="og:url" content="https://h2ocooling.com${page.path}"`)
      expect(html,page.path).toContain(`property="og:title" content="${page.title}"`)
      const ld=[...html.matchAll(/<script type="application\/ld\+json" data-legal-webpage="">([^<]+)<\/script>/g)].map(m=>JSON.parse(m[1]!))
      expect(ld,page.path).toHaveLength(1)
      expect(ld[0]).toMatchObject({'@type':'WebPage',name:page.title,url:`https://h2ocooling.com${page.path}`,dateModified:page.modified})
      expect(ld[0]).toEqual(legalWebPage(page))
    }
  },240000)
  it('dateModified is the effective date the text states (accessibility: the date it was prepared)',()=>{
    const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December']
    for(const page of LEGAL_PAGES){
      const text=readFileSync(path.join(APP,'content/legal',page.file),'utf8')
      const m=text.match(/(?:Effective date:\*\*|prepared this statement on) (\d{1,2}) (\w+) (\d{4})/)
      expect(m,page.path).not.toBeNull()
      const iso=`${m![3]}-${String(MONTHS.indexOf(m![2]!)+1).padStart(2,'0')}-${m![1]!.padStart(2,'0')}`
      expect(page.modified,page.path).toBe(iso)
    }
  })
})

describe('HEAD-POLISH-1 (3): theme colour and icons',()=>{
  it('theme-color is the ICS blue of the favicon tile and the manifest; the apple touch icon is a 180×180 PNG; icon.svg is the tile',()=>{
    expect(viewport.themeColor).toBe('#1B60A8')
    const manifest=JSON.parse(readFileSync(path.join(APP,'public/site.webmanifest'),'utf8')) as {theme_color:string}
    expect(manifest.theme_color).toBe(viewport.themeColor)
    const png=readFileSync(path.join(APP,'public/apple-touch-icon.png'))
    expect(png.subarray(1,4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([180,180])
    const svg=readFileSync(path.join(APP,'public/icon.svg'),'utf8')
    expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*viewBox="0 0 256 256"/)
    expect(svg).toContain('fill="#1B60A8"')
    expect(svg.trim()).toMatch(/<\/svg>$/)
  })
})

describe('HEAD-POLISH-1 (4): production robots',()=>{
  it('an indexed and followed page states the full allowance; a noindex or private page never gains a max-* directive',()=>{
    expect(INDEXABLE_ROBOTS).toBe('index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')
    expect(richRobots({index:true,follow:true})).toBe(INDEXABLE_ROBOTS)
    for(const r of [{index:false,follow:true},{index:false,follow:false}])expect(richRobots(r)).toEqual(r)
    expect(INDEXABLE_ROBOTS).not.toMatch(/noindex|nofollow/)
  })
  it('Next emits that string unchanged as the robots meta (no reordering, no googlebot twin)',()=>{
    expect(resolveRobots(INDEXABLE_ROBOTS)).toEqual({basic:INDEXABLE_ROBOTS,googleBot:null})
  })
  it('the legal pages: production states it; staging is noindex, nofollow',async()=>{
    process.env.H2O_INDEXING_POLICY='production'
    expect((await generateMetadata(params('/cookie-notice/'))).robots).toBe(INDEXABLE_ROBOTS)
    process.env.H2O_INDEXING_POLICY='private'
    expect((await generateMetadata(params('/cookie-notice/'))).robots).toEqual({index:false,follow:false})
    delete process.env.H2O_INDEXING_POLICY
    expect((await generateMetadata(params('/cookie-notice/'))).robots).toEqual({index:false,follow:false})
  })
  it('no X-Robots-Tag is compiled into a payload build (the proxy sends none for an indexable page under production: indexing-policy-r25.test.ts)',()=>{
    const cfg=readFileSync(path.join(APP,'next.config.ts'),'utf8')
    // the payload runtime returns before the repository-mode header is reached (MEDIA-CACHE-1 puts its media rules first)
    expect(cfg.indexOf('if (payloadRuntime) return [...mediaCache, adminFraming]')).toBeGreaterThan(0)
    expect(cfg.indexOf('if (payloadRuntime) return [...mediaCache, adminFraming]')).toBeLessThan(cfg.indexOf("key:'X-Robots-Tag'"))
    expect(cfg.match(/key:'X-Robots-Tag'/g)?.length).toBe(1)
  })
})

describe('HEAD-POLISH-1 (5): Product JSON-LD',()=>{
  const productNodes=(html:string)=>[...html.matchAll(/<script data-source-schema="\d+" type="application\/ld\+json">([^<]+)<\/script>/g)]
    .flatMap(m=>{const j=JSON.parse(m[1]!.replace(/\\u003c/g,'<'));return (j['@graph']??[j]) as Array<Record<string,unknown>>})
    .filter(n=>n['@type']==='Product')
  it('every product page has one Product with its own url; a leading manufacturer name becomes its brand; no offers, price or sku',()=>{
    let products=0,branded=0
    for(const doc of docs().filter(d=>d.type==='product')){
      const nodes=productNodes(renderToStaticMarkup(<SalmonSeo doc={doc}/>))
      expect(nodes,doc.targetPath).toHaveLength(1)
      const node=nodes[0]!
      expect(node.url,doc.targetPath).toBe(`https://h2ocooling.com${doc.targetPath}`)
      for(const k of ['offers','price','sku','mpn','aggregateRating','review'])expect(node,`${doc.targetPath} ${k}`).not.toHaveProperty(k)
      const brand=productBrand(String(node.name))
      if(brand){branded++;expect(node.brand,doc.targetPath).toEqual({'@type':'Brand',name:brand==='ICS'?'Industrial Cooling Solutions (ICS)':brand})}
      else expect(node,doc.targetPath).not.toHaveProperty('brand')
      products++
    }
    expect(products).toBeGreaterThan(150)
    expect(branded).toBeGreaterThan(100)
  },240000)
  it('productBrand reads the leading manufacturer only',()=>{
    expect(productBrand('Amarillo A Series Single Reduction Gearbox')).toBe('Amarillo')
    expect(productBrand('TUF-LITE III – 5000K Series Hub Fan Assemblies')).toBe('TUF-LITE')
    expect(productBrand('C.E. Shepherd SDRU-XF Drift Reduction Units')).toBe('C.E. Shepherd')
    expect(productBrand('Howden PRO D-Series 26′-36′ Fans')).toBe('Howden')
    expect(productBrand('Rexnord Addax Drive Shaft Composite Coupling LRR485.625')).toBe('Rexnord')
    for(const generic of ['FRP Angles','Splash Fill','Counterflow Nozzles','Tower Components Opti-Cell 150 Drift Eliminator','Amarilloo X'])expect(productBrand(generic),generic).toBeUndefined()
    expect(PRODUCT_BRANDS).toContain('Hudson')
  })
})
