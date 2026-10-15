/**
 * 1.3a-S2: the LIVE Brochures (LIVE-pages-2873) and Tools (LIVE-pages-2852) pages hold their accordions as WPBakery shortcode text. They are served through the R4
 * /resources/ hub library composition (hero, sticky aside with chips, numbered accordion), with their own wording and exact download links. The hosted site reads the
 * promoted snapshot, so the render test runs the Payload-mode catch-all page over a snapshot generation.
 */
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {liveRoutes,salmonDocument,type SalmonDocument} from '../salmon'
import {liveLibrary,LIVE_LIBRARY_ROUTES} from '../wave4'
import {Wave4Library} from '../Wave4Presentation'

type Row={path:string;routeId:string;canonical:string;state:string;sitemap:boolean}
const ledger=JSON.parse(readFileSync('content/release/route-ledger.json','utf8')) as {routes:Row[]}
const PAGES=[
  {id:'LIVE-pages-2873',path:'/resources/cooling-tower-brochures/',h1:'Cooling Tower Brochures',titles:['ICS – Your Geothermal Cooling Tower Parts Resource','ICS: 2024 Brochure','ICS: Cooling Tower Repair'],pdfs:['/wp-content/uploads/2024/04/ICS-Cooling-Tower-Parts.pdf','/wp-content/uploads/2024/04/ICS-Catalog.pdf','/wp-content/uploads/2024/04/ICS-Cooling-Tower-Repair.pdf']},
  {id:'LIVE-pages-2852',path:'/resources/tools/',h1:'Tools',titles:['Drive Shaft Inquiry Form','Fan Inquiry Form','Gear Box Inquiry Form','New Cooling Tower Data Sheet R0','Psychrometric Chart'],pdfs:['/wp-content/uploads/2024/06/Drive-Shaft-Inquiry-Form.pdf','/wp-content/uploads/2024/06/Fan-Inquiry-Form.pdf','/wp-content/uploads/2024/06/Gear-Box-Inquiry-Form.pdf','/wp-content/uploads/2024/06/New-Cooling-Tower-Data-Sheet-R0.pdf','/wp-content/uploads/2021/11/Psychrometric-Chart.pdf']},
]
const row=(p:string)=>ledger.routes.find((r)=>r.path===p)!
vi.mock('next/server',()=>({connection:async()=>{}}))
vi.mock('../../content/page-bridge',()=>({
  resolvePublicPath:async(page:string)=>{const r=ledger.routes.find((x)=>x.path===page);return r?{record:{...r,family:'live',seo:{canonical:r.canonical},disposition:{state:'PUBLIC',indexable:true}},dispatchPath:page,preview:false}:null},
  canonicalFor:(r:{canonical:string})=>r.canonical,
  robotsFor:()=>({index:true,follow:true}),
}))
import Page,{generateMetadata} from '../../app/(site)/[[...slug]]/page'

let directory=''
const previous={...process.env}
beforeAll(()=>{
  directory=mkdtempSync(path.join(os.tmpdir(),'h2o-live-library-'))
  const generation=path.join(directory,'generations','live-library')
  mkdirSync(generation,{recursive:true})
  mkdirSync(path.join(directory,'releases'))
  symlinkSync(path.join(process.cwd(),'content/salmon/documents'),path.join(generation,'documents'))
  writeFileSync(path.join(generation,'ledger.json'),JSON.stringify(ledger))
  writeFileSync(path.join(generation,'english-services.json'),readFileSync('content/english-completion/service-pages.json'))
  writeFileSync(path.join(generation,'routes.salmon.json'),readFileSync('content/salmon/active-routes.json'))
  writeFileSync(path.join(generation,'routes.live.json'),JSON.stringify([...JSON.parse(readFileSync('content/salmon/r2-live-routes.json','utf8')),...JSON.parse(readFileSync('content/salmon/r3-locale-routes.json','utf8'))]))
  writeFileSync(path.join(directory,'releases','live-library.json'),JSON.stringify({content:'live-library'}))
  symlinkSync('releases/live-library.json',path.join(directory,'release'))
  process.env.H2O_CONTENT_SOURCE='payload'
  process.env.CONTENT_SNAPSHOT_DIR=directory
})
afterAll(()=>{process.env={...previous};rmSync(directory,{recursive:true,force:true})})

const text=(html:string)=>html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ')
/** Every anchor in the source tree, in document order. */
const sourceAnchors=(doc:SalmonDocument):string[]=>{const out:string[]=[];const walk=(n:unknown)=>{if(!n||typeof n==='string')return;const x=n as {tag:string;attrs:Record<string,string>;children:unknown[]};if(x.tag==='a'&&x.attrs.href)out.push(x.attrs.href);x.children.forEach(walk)};doc.children.forEach(walk);return out}

describe('the library reader',()=>{
  it('reads the three brochures and the five tools in document order, with their exact links and copy',()=>{
    for(const p of PAGES){
      const doc=salmonDocument(liveRoutes().find((r)=>r.routeId===p.id)!)
      const lib=liveLibrary(doc)
      expect(lib.items.map((i)=>i.title.replace(/^Ashrae /,'')),p.id).toEqual(p.titles)
      expect(lib.items.map((i)=>i.href),p.id).toEqual(p.pdfs)
      expect(lib.items.every((i)=>i.extraLinks.length===0),p.id).toBe(true)
      expect(lib.orphanLinks,p.id).toEqual([])
      expect(lib.outside.join(' '),p.id).not.toMatch(/\[\/?vc_|tab_id/)
      expect(lib.items.some((i)=>/\[|tab_id/.test(i.title+i.description)),p.id).toBe(false)
    }
    expect(PAGES.map((p)=>liveLibrary(salmonDocument(liveRoutes().find((r)=>r.routeId===p.id)!)).items.length)).toEqual([3,5])
  })
  it('fails closed: an unreadable section keeps its words and every link on the page',()=>{
    const doc=salmonDocument(liveRoutes().find((r)=>r.routeId==='LIVE-pages-2873')!)
    const broken={...doc,children:[{tag:'p',attrs:{},children:['[vc_tta_section tab_id=”x”]','Words of an untitled section ',{tag:'a',attrs:{href:'https://h2ocooling.com/wp-content/uploads/1999/01/not-held.pdf'},children:['Download/View']},'[/vc_tta_section]','[vc_tta_section title=”Titled” tab_id=”y”]',{tag:'a',attrs:{href:'https://example.test/other.pdf'},children:['Other file']},'[/vc_tta_section]']},{tag:'a',attrs:{href:'/stray/'},children:['Stray']}]} as unknown as SalmonDocument
    const lib=liveLibrary(broken)
    expect(lib.outside.join(' ')).toContain('Words of an untitled section')
    expect(lib.items.map((i)=>i.title)).toEqual(['Titled'])
    expect(lib.items[0]!.extraLinks).toEqual([{href:'https://example.test/other.pdf',text:'Other file'}])
    expect(lib.orphanLinks.map((l)=>l.href).sort()).toEqual(['/stray/','https://h2ocooling.com/wp-content/uploads/1999/01/not-held.pdf'])
    const html=renderToStaticMarkup(<Wave4Library doc={broken}/>)
    for(const href of ['https://example.test/other.pdf','/stray/','https://h2ocooling.com/wp-content/uploads/1999/01/not-held.pdf'])expect(html).toContain(`href="${href}"`)
  })
})

describe('link policy for anchors that are not held PDFs',()=>{
  const BAD=['javascript:alert(1)','JaVaScRiPt:alert(1)',' javascript:alert(1)','\tjavascript:alert(1)','\u0001javascript:alert(1)','java\nscript:alert(1)','data:text/html,<script>alert(1)</script>','vbscript:x','//evil.example/x','\\\\evil.example','  https://example.test/x','file:///etc/passwd']
  it('renders unsafe or unverified hrefs as plain text with no href, in items and in the stray-link list',()=>{
    const doc=salmonDocument(liveRoutes().find((r)=>r.routeId==='LIVE-pages-2873')!)
    const a=(href:string,text:string)=>({tag:'a',attrs:{href},children:[text]})
    const broken={...doc,children:[{tag:'p',attrs:{},children:[
      '[vc_tta_section title=”Titled” tab_id=”y”]',...BAD.map((h,i)=>a(h,`bad-item-${i}`)),a('https://example.test/ok.pdf','good-item'),'[/vc_tta_section]',
      ...BAD.map((h,i)=>a(h,`bad-stray-${i}`)),a('/safe/','good-stray')]}]} as unknown as SalmonDocument
    const lib=liveLibrary(broken)
    for(const l of [...lib.items[0]!.extraLinks,...lib.orphanLinks])expect(l.href===undefined?l.text.startsWith('bad-'):/^(https?:\/\/|\/(?![/\\]))/.test(l.href)).toBe(true)
    expect(lib.items[0]!.extraLinks.filter((l)=>l.href).map((l)=>l.href)).toEqual(['https://example.test/ok.pdf'])
    const html=renderToStaticMarkup(<Wave4Library doc={broken}/>)
    expect(html).not.toMatch(/href="\s*(javascript|data|vbscript|file):/i)
    expect(html).not.toMatch(/href="(\/\/|\\)/)
    for(let i=0;i<BAD.length;i++){expect(html).toContain(`bad-item-${i}`);expect(html).toContain(`bad-stray-${i}`)}
    expect(html).toContain('href="https://example.test/ok.pdf"')
    expect(html).toContain('href="/safe/"')
  })
})

describe('served pages (Payload-mode catch-all over a snapshot generation)',()=>{
  for(const p of PAGES){
    it(`${p.path}: R4 library composition, exact links and copy, no builder fragments, SEO identity unchanged`,async()=>{
      expect(LIVE_LIBRARY_ROUTES.has(p.id)).toBe(true)
      expect(row(p.path)).toMatchObject({routeId:p.id,state:'PUBLIC',sitemap:true,canonical:`https://h2ocooling.com${p.path}`})
      const args={params:Promise.resolve({slug:p.path.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}
      const html=renderToStaticMarkup(await Page(args))
      const plain=text(html)
      // R4 hub composition, the LIVE document, one H1 with the page's own heading
      expect(html).toContain(`data-r4-route="${p.path}"`)
      expect(html).toContain(`data-salmon-document="${p.id}"`)
      expect(html.match(/<h1\b/g)).toHaveLength(1)
      expect(text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)||['',''])[1]!).trim()).toBe(p.h1)
      expect(html).toContain('dr4-library-aside')
      expect(html).toContain('dr4-library-list')
      expect(plain).toContain(`RESOURCE LIBRARY / ${p.titles.length} documents`)
      // outline (WCAG 1.3.1): effective heading levels (aria-level overrides the tag) never skip a level and no heading is empty
      const outline=[...html.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g)].map((m)=>({level:Number(/aria-level="(\d)"/.exec(m[2]!)?.[1]??m[1]),text:text(m[3]!).trim()}))
      expect(outline.filter((h)=>!h.text)).toEqual([])
      expect(outline[0]).toMatchObject({level:1,text:p.h1})
      outline.reduce((prev,h)=>{expect(h.level-prev,`${h.text} follows level ${prev}`).toBeLessThanOrEqual(1);return h.level},0)
      expect(outline.some((h)=>h.level===2),"document titles sit at level 2 under the H1").toBe(true)
      // the builder fragments are gone
      expect(plain).not.toMatch(/\[\/?vc_|tab_id|R0”/)
      // every title and every download link of the source is in the output, once, in order
      for(const t of p.titles)expect(plain,t).toContain(t.replace(/^Psychrometric/,'Psychrometric'))
      const doc=salmonDocument(liveRoutes().find((r)=>r.routeId===p.id)!)
      const downloads=sourceAnchors(doc).filter((h)=>/\.pdf$/i.test(h)).map((h)=>new URL(h).pathname)
      expect(downloads).toEqual(p.pdfs)
      const out=[...html.matchAll(/<a [^>]*href="(\/wp-content\/uploads\/[^"]+\.pdf)"/g)].map((m)=>m[1]!)
      expect(out).toEqual(p.pdfs)
      expect(out).toHaveLength(p.titles.length)
      // the source intro wording is the hero lead; nothing is invented
      const lib=liveLibrary(doc)
      expect(plain).toContain(lib.outside[0]!)
      for(const para of lib.outside)expect(plain).toContain(para)
      for(const item of lib.items)if(item.description)expect(plain).toContain(item.description)
      expect((await generateMetadata(args)).alternates?.canonical).toBe(`https://h2ocooling.com${p.path}`)
    })
  }
})
