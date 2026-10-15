import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {salmonDocument,salmonRoutes,liveRoutes} from '../salmon'
import {LuxuryCanonical} from '../LuxuryCanonical'
import {LiveEnglishDetail} from '../Wave4Presentation'
import {drySodaRankingR4,DRY_SODA_RANKING_PATH,DRY_SODA_RANKING_ROUTE_ID} from '../dry-soda-ranking-r4'
import {r4Media} from '../design-r4-media'

const ledger=JSON.parse(readFileSync('content/release/route-ledger.json','utf8')) as {routes:Array<{path:string;routeId:string;canonical:string;state:string;sitemap:boolean;redirect?:string}>}
const ranking=ledger.routes.find(row=>row.path===DRY_SODA_RANKING_PATH)!
const old=ledger.routes.find(row=>row.path==='/dry-soda-blasting/')!
vi.mock('next/server',()=>({connection:async()=>{}}))
vi.mock('../../content/page-bridge',()=>({
  resolvePublicPath:async(page:string)=>page===ranking.path?{record:{...ranking,family:'live',seo:{canonical:ranking.canonical},disposition:{state:'PUBLIC',indexable:true}},dispatchPath:page,preview:false}:null,
  canonicalFor:(row:{canonical:string})=>row.canonical,
  robotsFor:()=>({index:true,follow:true}),
}))
import Page,{generateMetadata} from '../../app/(site)/[[...slug]]/page'

let directory=''
const previous={...process.env}
beforeAll(()=>{
  directory=mkdtempSync(path.join(os.tmpdir(),'h2o-dry-soda-r4-'))
  const generation=path.join(directory,'generations','dry-soda')
  mkdirSync(generation,{recursive:true})
  mkdirSync(path.join(directory,'releases'))
  symlinkSync(path.join(process.cwd(),'content/salmon/documents'),path.join(generation,'documents'))
  writeFileSync(path.join(generation,'ledger.json'),JSON.stringify(ledger))
  writeFileSync(path.join(generation,'english-services.json'),readFileSync('content/english-completion/service-pages.json'))
  writeFileSync(path.join(generation,'routes.salmon.json'),readFileSync('content/salmon/active-routes.json'))
  writeFileSync(path.join(generation,'routes.live.json'),JSON.stringify([...JSON.parse(readFileSync('content/salmon/r2-live-routes.json','utf8')),...JSON.parse(readFileSync('content/salmon/r3-locale-routes.json','utf8'))]))
  writeFileSync(path.join(directory,'releases','dry-soda.json'),JSON.stringify({content:'dry-soda'}))
  symlinkSync('releases/dry-soda.json',path.join(directory,'release'))
  process.env.H2O_CONTENT_SOURCE='payload'
  process.env.CONTENT_SNAPSHOT_DIR=directory
})
afterAll(()=>{process.env={...previous};rmSync(directory,{recursive:true,force:true})})

describe('Dry Soda ranking URL reuses accepted 7-OCT Design R4',()=>{
  it('retains the accepted source and media with the ranking URL SEO identity',()=>{
    expect(ranking).toMatchObject({routeId:DRY_SODA_RANKING_ROUTE_ID,state:'PUBLIC',sitemap:true,canonical:`https://h2ocooling.com${DRY_SODA_RANKING_PATH}`})
    expect(old).toMatchObject({state:'REDIRECT',redirect:DRY_SODA_RANKING_PATH})
    const accepted=salmonDocument(salmonRoutes().find(row=>row.routeId==='SALMON-pages-1722')!)
    const live=salmonDocument(liveRoutes().find(row=>row.routeId===DRY_SODA_RANKING_ROUTE_ID)!)
    const reused=drySodaRankingR4(live)
    expect(accepted.targetPath).toBe('/dry-soda-blasting/')
    expect(accepted.sourceIdentity.sha256).toBe('ebffdd8e143dfed91b60438021c0767b9fa45a9a2f182e5f143ac540f57ffe6a')
    const mediaLedger=JSON.parse(readFileSync('content/design/design-r4-media.json','utf8')) as {slots:Record<string,{figma?:{fileKey:string}}>}
    expect(mediaLedger.slots['drysoda.hero']?.figma?.fileKey).toBe('Q6BhVIQ48ZSeuZahmcNv34')
    expect(reused.sourceIdentity.sha256).toBe(live.sourceIdentity.sha256)
    expect(reused.children).toEqual(live.children)
    expect(reused.seo).toEqual(live.seo)
    const html=renderToStaticMarkup(<LuxuryCanonical doc={reused}/>)
    expect(html).toContain(`data-r4-route="${DRY_SODA_RANKING_PATH}"`)
    expect(html).toContain('data-salmon-document="LIVE-pages-5010"')
    expect(html).toContain('<h1 class="dr4-hero-title" id="r4-hero-title">DRY SODA BLAST CLEANING SERVICES</h1>')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain(`https://h2ocooling.com${DRY_SODA_RANKING_PATH}`)
    expect(html).toContain(r4Media('drysoda.hero').variants[0]!.src)
    expect(html).toContain('data-r4-media="drysoda.chart1"')
    expect(html).toContain('data-r4-media="drysoda.chart2"')
    const visibleText=html.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()
    const sourceText:string[]=[]
    const visit=(node:unknown):void=>{
      if(!node||typeof node==='string')return
      const item=node as {tag:string;children:unknown[]}
      if(['h2','h3','p'].includes(item.tag)){
        const collect=(part:unknown):string=>typeof part==='string'?part:part&&typeof part==='object'?(part as {children:unknown[]}).children.map(collect).join(''):''
        sourceText.push(collect(item).replace(/\s+/g,' ').trim())
        return
      }
      item.children.forEach(visit)
    }
    live.children.forEach(visit)
    for(const text of sourceText.filter(Boolean))expect(visibleText).toContain(text)
  })
  it('renders through the promoted Payload route and keeps the LIVE canonical',async()=>{
    const args={params:Promise.resolve({slug:DRY_SODA_RANKING_PATH.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}
    const html=renderToStaticMarkup(await Page(args))
    expect(html).toContain(`data-r4-route="${DRY_SODA_RANKING_PATH}"`)
    expect(html).toContain('data-salmon-document="LIVE-pages-5010"')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect((await generateMetadata(args)).alternates?.canonical).toBe(`https://h2ocooling.com${DRY_SODA_RANKING_PATH}`)
  })
  const jsonLd=(html:string)=>[...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m)=>JSON.parse(m[1]!.replace(/\\u003c/g,'<')) as Record<string,unknown>)
  const crumbs=(html:string)=>{const b=jsonLd(html).flatMap((j)=>(Array.isArray(j['@graph'])?j['@graph'] as Record<string,unknown>[]:[j])).find((j)=>j['@type']==='BreadcrumbList');return b?(b.itemListElement as Array<Record<string,unknown>>).map((e)=>[e.position,e.name,(e.item as {'@id'?:string}|string)&&typeof e.item==='object'?(e.item as {'@id'?:string})['@id']:e.item]):null}
  it('keeps the 94c breadcrumb and JSON-LD for the ranking route (Home > Resources > Dry Soda Blast Cleaning Services, 3 ListItems)',()=>{
    const live=salmonDocument(liveRoutes().find((r)=>r.routeId===DRY_SODA_RANKING_ROUTE_ID)!)
    const before=renderToStaticMarkup(<LiveEnglishDetail doc={live}/>)
    const after=renderToStaticMarkup(<LuxuryCanonical doc={drySodaRankingR4(live)}/>)
    expect(crumbs(before)).not.toBeNull()
    expect(crumbs(after)).toEqual(crumbs(before))
    expect(crumbs(after)!.map((c)=>c[1])).toEqual(['Home','Resources','Dry Soda Blast Cleaning Services'])
    expect(crumbs(after)).toHaveLength(3)
    expect(jsonLd(after).map((j)=>JSON.stringify(j['@type']??Object.keys(j))).sort()).toEqual(jsonLd(before).map((j)=>JSON.stringify(j['@type']??Object.keys(j))).sort())
  })
  it('introduces no heading that is not in the LIVE-pages-5010 text',()=>{
    const live=salmonDocument(liveRoutes().find((r)=>r.routeId===DRY_SODA_RANKING_ROUTE_ID)!)
    const strings:string[]=[];const walk=(n:unknown)=>{if(typeof n==='string')strings.push(n.replace(/\s+/g,' ').trim().toLowerCase());else if(n&&typeof n==='object')((n as {children?:unknown[]}).children??[]).forEach(walk)}
    live.children.forEach(walk)
    const html=renderToStaticMarkup(<LuxuryCanonical doc={drySodaRankingR4(live)}/>)
    const text=(h:string)=>h.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim().toLowerCase()
    const heads=[...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m)=>text(m[2]!)).filter(Boolean)
    expect(heads.length).toBeGreaterThan(3)
    const known=new Set(strings)
    const novel=heads.filter((h)=>![...known].some((k)=>k.includes(h)||h.includes(k)))
    expect(novel).toEqual([])
    expect(html).not.toContain('Our Dry Soda Blast Cleaning Process')
    // no empty heading element anywhere (WCAG 2.4.6): every h1-h6 has text, and the outline never skips a level
    const levels=[...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)]
    expect(levels.filter((m)=>!text(m[2]!))).toEqual([])
    let prev=0
    for(const m of levels){const l=Number(m[1]);expect(l-prev).toBeLessThanOrEqual(1);prev=l}
  })
})
