/**
 * Author identity (owner decision 2026-10-02, Control Tower ruling): /author/timbozic/ is the canonical author archive,
 * Tim Bozic is the public author everywhere, and the dummy "faizasyed-ai" identity never reaches public output.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {releaseAuthority} from '../../../release/authority.mjs'
import {SalmonCanonical} from '../SalmonCanonical'
import {Wave4ArticleDetail} from '../Wave4Presentation'
import {articleByline,matchedWave4Article} from '../wave4'
import {aliasReleaseDocument} from '../release-document'
import {articleMetadataTitle} from '../article-metadata'
import {projectPublicAuthorIdentity} from '../public-author-identity'
import {releaseRoutes,salmonDocument,type SalmonDocument} from '../salmon'

/** Admin redirect records Commander creates for this round (the /contact/ record belongs to the 4f3abda3 round). */
export const OWNER_ADMIN_REDIRECTS:ReadonlyArray<{source:string;destination:string;status:301}>=[
  {source:'/cart/',destination:'/contact-us/',status:301},
  {source:'/checkout/',destination:'/contact-us/',status:301},
  {source:'/my-account/',destination:'/contact-us/',status:301},
  {source:'/my-account/lost-password/',destination:'/contact-us/',status:301},
  {source:'/author/tbozic/',destination:'/author/timbozic/',status:301},
  {source:'/author/faizasyed-ai/',destination:'/author/timbozic/',status:301},
]
type Row={path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean;searchable:boolean;canonical:string}
const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Row[];redirects:Array<{source:string;destination:string}>}
const redirected=new Set<string>(OWNER_ADMIN_REDIRECTS.map(row=>row.source))
const servedPublic=ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&!redirected.has(row.path))
const TIM='SALMON-b2503fcd6ca86806'
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const authorPage=()=>aliasReleaseDocument(salmonDocument(releaseRoutes().find(route=>route.routeId===TIM)!),'/author/timbozic/','https://h2ocooling.com/author/timbozic/')
const jsonLd=(html:string)=>[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(([,raw])=>raw!)

describe('canonical author archive',()=>{
  it('is an alias row of the frozen Tim Bozic route in the release authority and the route ledger',()=>{
    const authority=releaseAuthority(process.cwd())
    const alias=authority.routes.find((row:Row)=>row.path==='/author/timbozic/')!
    const source=authority.routes.find((row:Row)=>row.path==='/author/tbozic/')!
    expect(alias).toMatchObject({routeId:TIM,state:'PUBLIC',export:true,indexable:false,sitemap:false,searchable:false,canonical:'https://h2ocooling.com/author/timbozic/'})
    expect(authority.routes.indexOf(source)).toBeLessThan(authority.routes.indexOf(alias))
    expect(ledger.routes.find(row=>row.path==='/author/timbozic/')).toEqual(alias)
    for(const redirect of OWNER_ADMIN_REDIRECTS){
      expect(ledger.routes.some(row=>row.path===redirect.destination&&row.state==='PUBLIC'),redirect.destination).toBe(true)
      expect(OWNER_ADMIN_REDIRECTS.some(other=>other.source===redirect.destination),`${redirect.source} chains`).toBe(false)
      expect(ledger.redirects.some(row=>row.source===redirect.source),`${redirect.source} already redirected`).toBe(false)
    }
  })
  it('renders the approved Tim Bozic page at /author/timbozic/ with its canonical, one H1 and the decided title',()=>{
    const doc=authorPage()
    const html=renderToStaticMarkup(<SalmonCanonical doc={doc}/>)
    expect(doc.seo.canonical).toEqual(['https://h2ocooling.com/author/timbozic/'])
    expect(html).toContain('property="og:url" content="https://h2ocooling.com/author/timbozic/"')
    expect(html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g)).toHaveLength(1)
    expect(html).toMatch(/<h1\b[^>]*>Tim Bozic<\/h1>/)
    expect(html).toContain('Tim Bozic is President of Industrial Cooling Solutions')
    expect(articleMetadataTitle(doc)).toBe('Tim Bozic - ICS')
    expect(html).not.toMatch(/\/author\/tbozic\/|faizasyed|[\w.+-]+@[\w-]+\.[\w.]+/)
  })
})

describe('public author identity',()=>{
  it('the dummy identity appears nowhere in any served public route (documents and rendered HTML)',async()=>{
    const byPath=new Map(releaseRoutes().map(route=>[route.targetPath,route]))
    const affected:string[]=[]
    for(const row of servedPublic){
      const route=byPath.get(row.path)
      if(!route)continue
      const raw=readFileSync(path.join(process.cwd(),'content/salmon',route.file),'utf8')
      const doc=salmonDocument(route)
      expect(JSON.stringify({title:doc.title,children:doc.children,seo:doc.seo}),row.path).not.toContain('faizasyed')
      if(raw.includes('faizasyed'))affected.push(row.path)
    }
    // 65 hosted pages carried the dummy author in JSON-LD; 5 of them (the dummy archive, four shop pages) become redirects.
    expect(affected).toHaveLength(60)
    for(const p of affected){
      const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
      expect(html,p).not.toContain('faizasyed')
      expect(html,p).not.toContain('ICS Editorial Team')
      for(const block of jsonLd(html))if(block.includes('"Person"'))expect(block,p).toMatch(/"@type":"Person"[^{}]*"name":"Tim Bozic"/)
    }
    expect(renderToStaticMarkup(<SalmonCanonical doc={authorPage()}/>)).not.toContain('faizasyed')
    for(const row of ledger.routes.filter(candidate=>candidate.path.includes('faizasyed')))expect(row,row.path).toMatchObject({sitemap:false,searchable:false,indexable:false})
  },240000)
  it('maps an already-imported document (neutral label, dummy author URL) to Tim Bozic without a re-import',()=>{
    const schema=JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'WebPage','@id':'https://h2ocooling.com/x/#webpage','author':{'@id':'https://h2ocooling.com/#/schema/person/1'}},{'@type':'Person','@id':'https://h2ocooling.com/#/schema/person/1','name':'ICS Editorial Team','email':'someone@example.invalid','image':{'@type':'ImageObject','caption':'ICS Editorial Team'},'url':'https://h2ocooling.com/author/faizasyed-ai/'}]})
    const doc={routeId:'SYNTHETIC',targetPath:'/x/',title:'X',children:[{tag:'a',attrs:{href:'/author/faizasyed-ai/'},children:['ICS Editorial Team']}],seo:{title:'X',h1:[],canonical:[],meta:[{name:'twitter:data1',value:'ICS Editorial Team'}],schema:[schema]}} as unknown as SalmonDocument
    const out=projectPublicAuthorIdentity(doc)
    const person=(JSON.parse(out.seo.schema[0]!) as {'@graph':Array<Record<string,unknown>>})['@graph'][1]!
    expect(person).toEqual({'@type':'Person','@id':'https://h2ocooling.com/#/schema/person/1','name':'Tim Bozic','url':'https://h2ocooling.com/author/timbozic/'})
    expect(out.seo.meta).toEqual([{name:'twitter:data1',value:'Tim Bozic'}])
    expect(JSON.stringify(out.children)).toContain('"href":"/author/timbozic/"')
    expect(JSON.stringify(out)).not.toMatch(/faizasyed|example\.invalid/)
  })
  it('credits the two former "Rhonda Miller" pages to Tim Bozic (owner decision 2026-10-02); no /author/altaf/ route exists',async()=>{
    expect(ledger.routes.some(row=>/\/author\/altaf\//.test(row.path))).toBe(false)
    // /projects-2/ is consolidated into /all-projects/ by redirect (Master SEO Pass R1); its document still carries no Rhonda.
    expect(ledger.routes.find(row=>row.path==='/projects-2/')).toMatchObject({state:'REDIRECT',redirect:'/all-projects/'})
    for(const p of ['/cooling-tower-construction-repair-in-united-states/']){
      const doc=salmonDocument(releaseRoutes().find(route=>route.targetPath===p)!)
      expect(articleByline(doc)?.author,p).toBe('Tim Bozic')
      const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
      expect(html,p).not.toMatch(/Rhonda|\/author\/altaf\//)
      expect(jsonLd(html).join(''),p).toMatch(/"@type":"Person","@id":"https:\/\/h2ocooling\.com\/author\/timbozic\/","name":"Tim Bozic"/)
    }
  },60000)
  it('every public article byline reads Tim Bozic',()=>{
    const served=new Set(servedPublic.map(row=>row.path))
    const authors=new Map<string,number>()
    for(const route of releaseRoutes()){
      if(!served.has(route.targetPath))continue
      const doc=salmonDocument(route)
      if(!(doc.routeId.startsWith('LIVE-')||matchedWave4Article(doc)||doc.type==='posts'))continue
      const author=articleByline(doc)?.author??'(no byline)'
      authors.set(author,(authors.get(author)??0)+1)
    }
    // The two without a byline are portfolio records (/rt-portfolios/…), which carry no article author.
    // Master SEO Pass R1: 17 consolidated pages left the served set and three held articles published (263 − 17 + 3).
    // SEO parity follow-up Part 2: the two live duplicates withdrawn into the designed Thermal and Japan pages also leave it;
    // the un-consolidated /cooling-tower-vs-chiller/ (OGCS R1.2) joins it (249 − 2 + 1).
    expect(Object.fromEntries(authors)).toEqual({'Tim Bozic':248,'(no byline)':2})
  },60000)
  it('links the Tim Bozic byline to the canonical author archive',()=>{
    const article=salmonDocument(releaseRoutes().find(route=>route.targetPath==='/3-cell-counterflow-cooling-towers/')!)
    const html=renderToStaticMarkup(<Wave4ArticleDetail doc={article}/>)
    expect(html).toContain('<p class="wave4-byline"><span>By <a href="/author/timbozic/">Tim Bozic</a></span>')
    for(const block of jsonLd(html))expect(block).not.toMatch(/\/author\/tbozic\/|ICS Editorial Team/)
  })
})
