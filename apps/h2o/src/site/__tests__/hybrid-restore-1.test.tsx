/**
 * HYBRID-RESTORE-1 (FBG-12, OGCS 2026-10-11): the article that ranks at /hybrid-cooling-tower/ (29 clicks) is served there again: the same article
 * (SALMON-posts-4083), same title and meta, a self canonical; the old slug /hybrid-cooling-tower-repair/ answers 301 to it; the old redirect row is gone.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {articleAliases,articleDirectoryDocuments,matchedWave4Article} from '../wave4'
import {aliasReleaseDocument} from '../release-document'
import {salmonDocument,salmonRoutes} from '../salmon'
import {GONE_PATHS} from '../../content/config'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
type Row={path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean;canonical:string;redirect:string|null;matchedArticle?:boolean}
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {origin:string;routes:Row[];redirects:Array<{source:string;destination:string}>}
const OLD='/hybrid-cooling-tower-repair/',NEW='/hybrid-cooling-tower/'

describe('HYBRID-RESTORE-1: the ledger',()=>{
  it('the ranking address is a PUBLIC, indexable, sitemap alias row of the article route with a self canonical; the old slug is a REDIRECT row to it',()=>{
    const rows=ledger.routes.filter(r=>r.routeId==='SALMON-posts-4083')
    expect(rows.map(r=>r.path)).toEqual([OLD,NEW])
    const old=rows[0]!,restored=rows[1]!
    expect(old).toMatchObject({state:'REDIRECT',export:false,indexable:false,sitemap:false,redirect:NEW})
    expect(restored).toMatchObject({state:'PUBLIC',export:true,indexable:true,sitemap:true,redirect:null,canonical:`https://h2ocooling.com${NEW}`})
    expect(restored.canonical).not.toContain('repair')
  })
  it('no redirect row sends /hybrid-cooling-tower/ anywhere; no other ledger redirect points at the old slug; a different article stays untouched',()=>{
    expect(ledger.redirects.filter(r=>r.source===NEW)).toEqual([])
    expect(ledger.redirects.filter(r=>r.destination===OLD)).toEqual([])
    const other=ledger.routes.find(r=>r.path==='/hybrid-cooling-tower-repair-diagnose-maximize-efficiency/')!
    expect(other.state).toBe('REVIEW_HOLD') // unchanged: still a held, different article
  })
  it('the data names the alias: seo-pass-r1 aliases, a redirect source, the dropped old redirect',()=>{
    const d=JSON.parse(readFileSync(path.join(APP,'content/release/seo-pass-r1.json'),'utf8')) as {aliases:Record<string,string>;droppedRedirects:string[];redirectSources:Record<string,string>}
    expect(d.aliases).toEqual({[OLD]:NEW})
    expect(d.droppedRedirects).toEqual([NEW])
    expect(d.redirectSources[OLD]).toBe(NEW)
  })
})

describe('HYBRID-RESTORE-1: the article at its restored address',()=>{
  const route=()=>salmonRoutes().find(r=>r.routeId==='SALMON-posts-4083')!
  it('the alias document is the same article (title, meta, body) with the address and canonical of the restored URL',()=>{
    const src=salmonDocument(route())
    const alias=aliasReleaseDocument(src,NEW,`https://h2ocooling.com${NEW}`)
    expect(alias.targetPath).toBe(NEW)
    expect(alias.seo.canonical).toEqual([`https://h2ocooling.com${NEW}`])
    expect(alias.seo.title).toBe(src.seo.title)
    expect(alias.children).toEqual(src.children)
    expect(JSON.stringify(alias.seo.meta)).toContain(`https://h2ocooling.com${NEW}`)
    expect(JSON.stringify(alias.seo.schema)).not.toContain('hybrid-cooling-tower-repair/')
    expect(matchedWave4Article(alias)?.routeId).toBe('SALMON-posts-4083') // the article layout is chosen for the alias address too
    expect(matchedWave4Article({...alias,targetPath:'/elsewhere/'})).toBeUndefined()
    expect(articleAliases()).toEqual({[OLD]:NEW})
  })
  it('the Tech Articles index lists the article once, at the restored address',()=>{
    const dir=articleDirectoryDocuments().filter(d=>d.doc.routeId==='SALMON-posts-4083')
    expect(dir.map(d=>d.doc.targetPath)).toEqual([NEW])
    expect(dir[0]!.indexable).toBe(true)
    const all=articleDirectoryDocuments().map(d=>d.doc.targetPath)
    expect(all).not.toContain(OLD)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('OGCS Part 3: junk draft and nested repair URLs',()=>{
  it('/hello-world-2/ answers 410 Gone (the junk WordPress draft, 0 clicks); the four extra nested repair URLs are 301 rows to live pages',()=>{
    expect(GONE_PATHS.has('/hello-world-2/')).toBe(true)
    const pub=new Set(ledger.routes.filter(r=>r.state==='PUBLIC').map(r=>r.path))
    for(const [src,dst] of [['crossflow-cooling-tower-repair','/crossflow-cooling-tower-repair-maintenance/'],['counterflow-cooling-tower-repair','/counterflow-cooling-tower-repair-maintenance/'],['low-drift-solutions','/low-drift-cooling-tower-solutions/'],['cooling-tower-rebuild','/cooling-tower-rebuilds-new-towers/']]){
      const row=ledger.redirects.find(r=>r.source===`/cooling-tower-maintenance-repair-upgrade/${src}/`)
      expect(row?.destination,src).toBe(dst)
      expect(pub.has(dst),dst).toBe(true)
    }
  })
})

describe('HYBRID-RESTORE-1: the alias renders the repository document, so the batch fixes of the article apply at read time',()=>{
  const doc=()=>salmonDocument(salmonRoutes().find(r=>r.routeId==='SALMON-posts-4083')!)
  const flat=(nodes:unknown):string=>JSON.stringify(nodes)
  it('no "Large HVAC plants" bullet (TO-084), and the two slide images carry their OGCS alt text (live-image-alt registry)',()=>{
    const d=doc()
    expect(flat(d.children)).not.toContain('Large HVAC plants')
    const alts=[...flat(d.children).matchAll(/"alt":"([^"]*)"/g)].map(m=>m[1]!)
    expect(alts).toContain('Slide titled Why Industrial Facilities Choose Hybrid Cooling Tower: lower water use, reduced visible plume, seasonal adaptability')
    expect(alts).toContain('Slide titled Hybrid Cooling Tower Design Considerations, with engineers reviewing drawings at a cooling tower site')
  })
})
