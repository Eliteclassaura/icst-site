/**
 * R2.5 pre-launch fix pack (Control Tower ruling on the SEO Checker's Round 9 pre-flight, 2026-10-05): the public author
 * description (CS153), the decided per-page meta on paginated archives, redirect sources never PUBLIC and links preferring the
 * redirect, the product-gallery derivative accounting, CS161 and the OGCS R2.5 cost/title/meta rows, the author aliases owned
 * by the batch, and the live-chain intermediate 301s.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {PUBLIC_AUTHOR_DESCRIPTION} from '../public-author-identity'
import {servedDescription} from '../SalmonCanonical'
import {liveRoutes,releaseRouteFor,salmonDocument,salmonRoutes} from '../salmon'
import {authorProblems,PUBLIC_AUTHOR_DESCRIPTION as CHECKER_DESCRIPTION} from '../../../ops/seo-pass/head-assertions.mjs'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const slugOf=(p:string)=>p.split('/').filter(Boolean).map(decodeURIComponent)
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:slugOf(p)}),searchParams:Promise.resolve({})}))
const tsv=(f:string)=>{const [h,...l]=readFileSync(path.join(APP,'ops/seo-pass/data',f),'utf8').trimEnd().split('\n');const c=h!.split('\t');return l.map(x=>Object.fromEntries(x.split('\t').map((v,i)=>[c[i]!,v])))}
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean;redirect?:string|null}>}
/** The original CS153 biography's phrases (OGCS claims sweep R1): none may reach any public JSON-LD. */
const CS153_ORIGINAL=['seasoned leader','proven track record','clients worldwide','cutting-edge','passionate about delivering']

describe('public author description (CS153, item 1)',()=>{
  it('no public document emits the original biography in its JSON-LD; every public-author Person node carries the approved text',()=>{
    const pub=new Set(ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export).map(r=>r.routeId))
    let tim=0
    for(const route of [...salmonRoutes(),...liveRoutes()]){
      if(!pub.has(route.routeId))continue
      let doc
      try{doc=salmonDocument(route)}catch{continue}
      for(const raw of doc.seo.schema){
        for(const phrase of CS153_ORIGINAL)expect(raw.includes(phrase),`${route.targetPath}: "${phrase}"`).toBe(false)
        const walk=(v:unknown)=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){const o=v as Record<string,unknown>;if([o['@type']].flat().includes('Person')&&o.name==='Tim Bozic'&&'description' in o){tim++;expect(o.description,route.targetPath).toBe(PUBLIC_AUTHOR_DESCRIPTION)}Object.values(o).forEach(walk)}}
        walk(JSON.parse(raw))
      }
    }
    expect(tim).toBeGreaterThan(240) // 235 original biographies + 12 "Meet Tim Bozic…" variants (EN and locale)
  },300_000)
  it('an article page serves the approved description (and the conformance checker rule agrees)',async()=>{
    const html=await render('/best-for-cooling-tower/')
    expect(CHECKER_DESCRIPTION).toBe(PUBLIC_AUTHOR_DESCRIPTION)
    const checked=authorProblems(html)
    expect(checked.problems).toEqual([])
    expect(checked.described).toBeGreaterThan(0)
    expect(authorProblems(html.replace(JSON.stringify(PUBLIC_AUTHOR_DESCRIPTION).slice(1,-1),'Tim is a seasoned leader')).problems.length).toBeGreaterThan(0)
    expect(html).toContain(JSON.stringify(PUBLIC_AUTHOR_DESCRIPTION).slice(1,-1))
    for(const phrase of CS153_ORIGINAL)expect(html).not.toContain(phrase)
  },120_000)
})

describe('paginated archive meta precedence (item 3)',()=>{
  it('a decided per-page meta wins; the "Page N:" inheritance only fills a page without one',()=>{
    const doc=salmonDocument(releaseRouteFor(slugOf('/product-category/drive-shafts-assemblies/page/2/'))!)
    const decided='Page 2 of ICS drive shafts and assemblies: Addax LRX composite couplings and Amarillo Drive Shaft CF52 and CF60 models. Quote on request.'
    const withDecided={...doc,seo:{...doc.seo,decidedDescription:true,meta:doc.seo.meta.map(m=>m.name==='description'?{...m,value:decided}:m)}}
    expect(servedDescription(withDecided)).toBe(decided)
    expect(servedDescription(doc)).toMatch(/^Page 2: /)
  })
  it('the batch holds the 7 decided per-page metas the pre-flight named',()=>{
    const seo=new Map(tsv('seo-fields.tsv').map(r=>[r.path,r.meta]))
    for(const p of ['/category/blog/page/2/','/product-category/drive-shafts-assemblies/page/2/','/product-category/drive-shafts-assemblies/page/3/','/product-category/drive-shafts-assemblies/page/4/','/product-category/gearboxes/page/2/','/product-category/gearboxes/page/3/','/product-tag/drive-shafts/page/2/'])
      expect(seo.get(p),p).toBeTruthy()
  })
})

describe('redirects win over route rows (item 4) and the batch owns every redirect (item 7)',()=>{
  const redirects=new Map(tsv('redirects.tsv').map(r=>[r.source,r]))
  it('the five redirect sources and the two author aliases are withdrawn to their 301s, never PUBLIC',()=>{
    for(const [p,to] of [['/contact/','/contact-us/'],['/cart/','/contact-us/'],['/checkout/','/contact-us/'],['/my-account/','/contact-us/'],['/my-account/lost-password/','/contact-us/'],['/author/tbozic/','/author/timbozic/'],['/author/faizasyed-ai/','/author/timbozic/']]){
      expect(ledger.routes.find(r=>r.path===p),p).toMatchObject({state:'REDIRECT',export:false,redirect:to})
      expect(redirects.get(p),p).toMatchObject({destination:to,status:'301'})
      expect(tsv('route-dispositions.tsv').find(r=>r.path===p),p).toMatchObject({action:'WITHDRAW_TO_REDIRECT',redirect:to})
    }
  })
  it('no ledger row is both a redirect source and PUBLIC',()=>{
    const sources=new Set([...redirects.keys()].map(s=>decodeURIComponent(s)))
    expect(ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&sources.has(decodeURIComponent(r.path))).map(r=>r.path)).toEqual([])
  })
  it('a body link to /contact/ resolves to /contact-us/ (the environmental-advantage article)',async()=>{
    const html=await render('/environmental-advantage-cooling-towers-vs-cooling-systems/')
    const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'))
    expect(main).not.toContain('href="/contact/"')
    expect(main).toContain('href="/contact-us/"')
  },120_000)
  it('the eleven live-chain middle addresses 301 one hop to their final page',()=>{
    const rows=tsv('r25-ct-decisions.tsv')
    expect(rows).toHaveLength(11)
    const pub=new Set(ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export).map(r=>r.path))
    for(const r of rows){const src=new URL(r.url!).pathname,dst=new URL(r.redirect_target!).pathname;expect(redirects.get(src),src).toMatchObject({destination:dst,status:'301'});expect(pub.has(dst),dst).toBe(true)}
    expect(redirects.get('/look-cooling-tower-fan-efficiency-pt-2/')?.destination).toBe('/cooling-tower-fan-analysis/')
  })
})

describe('product-gallery derivatives (item 5)',()=>{
  it('all 123 derivative references map to a held original of the same upload, its bytes as recorded',()=>{
    const m=JSON.parse(readFileSync(path.join(APP,'content/salmon/r25-gallery-derivatives.json'),'utf8')) as {items:Array<{url:string;file:string;sha256:string;state:string}>}
    expect(m.items).toHaveLength(123)
    const seen=new Map<string,string>()
    for(const i of m.items){
      expect(i.state).toBe('MAPPED_TO_HELD_ORIGINAL')
      expect(i.url).toMatch(/^https:\/\/salmon-rhinoceros-754457\.hostingersite\.com\/wp-content\/uploads\/.+-\d+x\d+\.(?:jpe?g|png|webp)$/)
      const file=path.join(APP,'public',i.file)
      expect(existsSync(file),i.file).toBe(true)
      if(!seen.has(file))seen.set(file,createHash('sha256').update(readFileSync(file)).digest('hex'))
      expect(seen.get(file),i.url).toBe(i.sha256)
    }
  })
})

describe('recorded edits: CS161 and the OGCS R2.5 rows (items 6, 8)',()=>{
  const fixes=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/slot-fixes.json'),'utf8')) as Record<string,{slots:Array<{afterCanon:string}>}>
  const after=(p:string)=>(fixes[p]?.slots??[]).map(s=>s.afterCanon).join('\n')
  it('every OGCS R2.5 body and table edit and CS161 is in the batch, the current strings gone',()=>{
    const rows=readFileSync(path.join(APP,'ops/seo-pass/data/claim-edits.json'),'utf8')
    const edits=(JSON.parse(rows) as {edits:Array<{row?:string;path:string;find:string;replace?:string}>}).edits.filter(e=>e.row==='CS161'||e.row?.startsWith('R25-OGCS-'))
    expect(edits).toHaveLength(24)
    for(const e of edits)expect(after(e.path),`${e.path}: ${e.replace}`).toContain(JSON.stringify(e.replace).slice(1,-1))
    expect(after('/cooling-tower-operating-cost/')).not.toContain('$22,200')
    expect(after('/cooling-tower-operating-cost/')).not.toContain('ICS Optimized')
    expect(after('/cooling-tower-operating-cost/')).toContain('industry estimates, not an ICS quote')
    expect(after('/cooling-tower-maintenance-a-step-by-step/')).not.toContain('premium services')
  })
  it('the /cooling-tower-construction/ title and the Robertshaw meta are the batch values',()=>{
    const seo=new Map(tsv('seo-fields.tsv').map(r=>[r.path,r]))
    expect(seo.get('/cooling-tower-construction/')?.title).toBe('Industrial Cooling Tower Construction Guide (2026)')
    expect(seo.get('/product/robertshaw-vibration-switch-365a-366a/')?.meta).toBe('Robertshaw 365A & 366A vibration switches respond to excess vibration on cooling tower fans, motors, and pumps. Request a quote from ICS for your model.')
  })
})
