/**
 * Locale Part B (owner decision 2026-10-05; OGCS Locale Preservation Part A, CT accepted): the preserved live locale pages
 * as a provenance-recorded LIVE route family, their language, hreflang and sitemap membership.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,renameSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {languageFor} from '../../content/locale-language'
import {sitemapEntries,pathKey,type LocaleData} from '../../content/sitemap'
import {GONE_PATHS,NOINDEX_FOLLOW_PATHS} from '../../content/config'

const APP=process.cwd()
type Route={routeId:string;targetPath:string;file:string;sha256:string;sourceUrl:string}
type Row={path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean;searchable:boolean;canonical:string;routeClass:string}
const routes=JSON.parse(readFileSync(path.join(APP,'content/salmon/r3-locale-routes.json'),'utf8')) as Route[]
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Row[];redirects:Array<{source:string}>}
const locale=JSON.parse(readFileSync(path.join(APP,'content/locale/sitemap-locale.json'),'utf8')) as LocaleData&{contentLanguages:Record<string,string>}
const SWAPPED=['/th/工業プロセスにおける冷却塔の用途を理解する/','/ja/工業プロセスにおける冷却塔の用途を理解する/']
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env};vi.doUnmock('next/headers')})

describe('the preserved locale pages: a provenance-recorded LIVE route family',()=>{
  it('166 documents, one per OGCS Part A PRESERVE URL that has no source record and serves a body; hashes and live provenance recorded',()=>{
    // 168 Part A PRESERVE URLs: the held Thai Salmon record publishes in place, and the empty live /th/ duplicate of it
    // 301s to it (CT override of Part A, 2026-10-05: an empty body is junk under the brief).
    expect(routes).toHaveLength(166)
    const byLang:Record<string,number>={}
    for(const r of routes){
      const bytes=readFileSync(path.join(APP,'content/salmon',r.file))
      expect(createHash('sha256').update(bytes).digest('hex'),r.routeId).toBe(r.sha256)
      const doc=JSON.parse(bytes.toString()) as {routeId:string;language:string;sourceIdentity:{status:number;restUrl:string;sha256:string;htmlSha256:string;htmlLang:string};publicationStatus:string;children:unknown[];seo:{canonical:string[]}}
      expect(doc.routeId).toBe(r.routeId)
      expect(r.routeId).toMatch(new RegExp(`^LIVE-LOCALE-${doc.language}-\\d+$`))
      expect(doc.sourceIdentity.restUrl).toMatch(/^https:\/\/h2ocooling\.com\/wp-json\/wp\/v2\/(posts|pages)\/\d+$/)
      expect(doc.sourceIdentity).toMatchObject({status:200})
      expect(doc.sourceIdentity.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(doc.sourceIdentity.htmlLang.slice(0,2)).toBe(doc.language)
      expect(doc.publicationStatus).toBe('publish')
      expect(doc.children.length).toBeGreaterThan(0)
      expect(pathKey(new URL(doc.seo.canonical[0]!).pathname)).toBe(pathKey(r.targetPath))
      expect(locale.languages[pathKey(r.targetPath)],r.targetPath).toBe(doc.language)
      byLang[doc.language]=(byLang[doc.language]??0)+1
    }
    expect(byLang).toEqual({id:42,ja:41,th:41,vi:42})
    // The 168th preserved page is the held Salmon record at the same path (published through the content check).
    expect(Object.keys(locale.languages)).toHaveLength(168)
  })
  it('every locale row is published PUBLIC, self-canonical, in the sitemap and never in the English search index',()=>{
    const rows=ledger.routes.filter(r=>r.routeId.startsWith('LIVE-LOCALE-'))
    expect(rows).toHaveLength(166)
    for(const r of rows){
      expect(r,r.path).toMatchObject({state:'PUBLIC',export:true,indexable:true,sitemap:true,searchable:false})
      expect(r.canonical,r.path).toBe('https://h2ocooling.com'+r.path)
    }
  })
})

describe('language',()=>{
  it('a preserved locale page is in its own language, the swapped pair in the language of its content, everything else English',()=>{
    expect(languageFor('/ja/冷却塔とは何ですか/')).toBe('ja')
    expect(languageFor(encodeURI('/th/หอทำความเย็นคืออะไร/').toLowerCase())).toBe('th')
    expect(languageFor('/id/apa-itu-menara-pendinginan/')).toBe('id')
    expect(languageFor('/cooling-tower/')).toBe('en')
    expect(locale.contentLanguages).toEqual({[SWAPPED[0]!]:'ja',[SWAPPED[1]!]:'th'})
    expect(languageFor(SWAPPED[0]!)).toBe('ja')
    expect(languageFor(SWAPPED[1]!)).toBe('th')
  })
  it('the proxy passes the page language to the layout in payload content mode',async()=>{
    process.env.H2O_CONTENT_SOURCE='payload'
    const root=mkdtempSync(path.join(tmpdir(),'h2o-locale-'))
    mkdirSync(path.join(root,'generations','g'),{recursive:true})
    writeFileSync(path.join(root,'generations','g','ledger.json'),JSON.stringify({routes:[],redirects:[]}))
    mkdirSync(path.join(root,'releases'),{recursive:true})
    writeFileSync(path.join(root,'releases','r-g.json'),JSON.stringify({format:1,id:'r-g',content:'g',search:'s-g'}))
    symlinkSync('releases/r-g.json',path.join(root,'release.tmp'));renameSync(path.join(root,'release.tmp'),path.join(root,'release'))
    process.env.CONTENT_SNAPSHOT_DIR=root
    const {proxy}=await import('../../proxy')
    const {NextRequest}=await import('next/server')
    const res=proxy(new NextRequest('https://h2ocooling.com/vi/thap-giai-nhiet-la-gi/'))
    expect(res.headers.get('x-middleware-request-x-h2o-lang')).toBe('vi')
    expect(proxy(new NextRequest('https://h2ocooling.com/cooling-tower/')).headers.get('x-middleware-request-x-h2o-lang')).toBe('en')
  })
  it('the layout writes <html lang> from that header in payload content mode (a plain language tag only); repository mode is English',async()=>{
    vi.resetModules()
    vi.doMock('next/headers',()=>({headers:async()=>new Headers({'x-h2o-lang':'th'})}))
    process.env.H2O_CONTENT_SOURCE='payload'
    const {default:Layout}=await import('../../app/(site)/layout')
    expect(renderToStaticMarkup(await Layout({children:null}))).toMatch(/^<html lang="th">/)
    vi.resetModules()
    vi.doMock('next/headers',()=>({headers:async()=>new Headers({'x-h2o-lang':'"><script>'})}))
    const {default:Layout2}=await import('../../app/(site)/layout')
    expect(renderToStaticMarkup(await Layout2({children:null}))).toMatch(/^<html lang="en">/)
    delete process.env.H2O_CONTENT_SOURCE
    vi.resetModules()
    const {default:Layout3}=await import('../../app/(site)/layout')
    expect(renderToStaticMarkup(await Layout3({children:null}))).toMatch(/^<html lang="en">/)
  })
})

describe('hreflang and the locale sitemaps (production policy, the real ledger and Part A clusters)',()=>{
  const entries=sitemapEntries({rows:ledger.routes,origin:'https://h2ocooling.com',redirected:new Set(ledger.redirects.map(r=>pathKey(r.source))),gone:GONE_PATHS,noindexFollow:NOINDEX_FOLLOW_PATHS,locale})
  it('the four locale sitemaps list the preserved pages',()=>{
    const count=(child:string)=>entries.filter(e=>e.child===child).length
    expect([count('sitemap-ja.xml'),count('sitemap-th.xml'),count('sitemap-id.xml'),count('sitemap-vi.xml')]).toEqual([41,42,42,42])
  })
  it('every served cluster member names the identical set, self included; the swapped pair and NONE pages name none',()=>{
    const byKey=new Map(entries.map(e=>[e.key,e]))
    const sig=(e:typeof entries[number])=>JSON.stringify((e.alternates??[]).map(a=>`${a.hreflang} ${pathKey(new URL(a.url).pathname)}`).sort())
    let withSets=0
    for(const e of entries){
      if(!e.alternates)continue
      withSets++
      expect(e.alternates.some(a=>pathKey(new URL(a.url).pathname)===e.key),e.key).toBe(true)
      for(const a of e.alternates){const other=byKey.get(pathKey(new URL(a.url).pathname));expect(other,a.url).toBeDefined();expect(sig(other!),a.url).toBe(sig(e))}
    }
    expect(withSets).toBeGreaterThan(190)
    for(const p of SWAPPED)expect(byKey.get(p)?.alternates,p).toBeUndefined()
    const english=byKey.get('/inspect-cooling-tower-part-2/')!
    expect(english.alternates!.map(a=>a.hreflang).sort()).toEqual(['en','id','ja','th','vi','x-default'])
  })
})

describe('rendering (repository mode)',()=>{
  it('a preserved locale page renders its live body in the accepted live template, one H1, breadcrumb schema, quote action',async()=>{
    const html=await render('/ja/冷却塔とは何ですか/')
    const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'))
    expect(html).toContain('data-live-english="LIVE-LOCALE-ja-14608"')
    expect(main.match(/<h1\b/g)).toHaveLength(1)
    expect(main).toContain('冷却塔')
    expect(html).toContain('"@type":"BreadcrumbList"')
  })
  it('the swapped pair renders (200) with its own content',async()=>{
    for(const p of SWAPPED){const html=await render(p);expect(html,p).toContain('data-live-english="LIVE-LOCALE-')}
  })
})
