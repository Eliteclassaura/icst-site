/**
 * AEO-1 (CT 2026-10-09, owner: AI crawlers allowed): the production robots.txt names the AI crawlers; /llms.txt is built from the release
 * data; a page with a visible FAQ carries FAQPage structured data generated from the same text; a post shows "Last updated <date>" (the
 * value of its BlogPosting dateModified).
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {AI_CRAWLERS,PRODUCTION_DISALLOW,PRODUCTION_SITEMAP,productionRobotsBody} from '../../content/robots-production'
import {LLMS_ORIGIN,LLMS_PATHS,LLMS_SECTIONS,buildLlmsTxt} from '../../content/llms-txt'
import {releaseRoutes,salmonDocument} from '../salmon'
import {R5bLocationPage} from '../r5b/R5bLocation'
import {articleModified} from '../article-layout'
import {dispatch} from './seo-fix-1.test'

const APP=process.cwd()
const env0={...process.env}
const O='https://h2ocooling.com'
const STAGING='https://staging.h2ocooling.org'
beforeEach(()=>{vi.resetModules()})
afterEach(()=>{process.env={...env0};vi.resetModules()})

function promote(root:string,name:string,files:Record<string,string>){
  const gen=path.join(root,'generations',name)
  mkdirSync(gen,{recursive:true})
  for(const [f,body] of Object.entries(files)){mkdirSync(path.dirname(path.join(gen,f)),{recursive:true});writeFileSync(path.join(gen,f),body)}
  mkdirSync(path.join(root,'releases'),{recursive:true})
  writeFileSync(path.join(root,'releases',`r-${name}.json`),JSON.stringify({format:1,id:`r-${name}`,content:name,search:`s-${name}`}))
  symlinkSync(`releases/r-${name}.json`,path.join(root,`release.${name}`))
  renameSync(path.join(root,`release.${name}`),path.join(root,'release'))
}
const payload=(policy?:string)=>{
  const root=mkdtempSync(path.join(tmpdir(),'h2o-aeo-'))
  Object.assign(process.env,{H2O_CONTENT_SOURCE:'payload',CONTENT_SNAPSHOT_DIR:root})
  if(policy)process.env.H2O_INDEXING_POLICY=policy;else delete process.env.H2O_INDEXING_POLICY
  delete process.env.H2O_ROBOTS_ALLOW_AGENTS
  return root
}

describe('AEO-1 (4): robots.txt',()=>{
  const lines=(body:string)=>body.split('\n')
  it('production: the accepted * group first, then one group per named AI crawler, each repeating the same Disallow lines; Sitemap last',()=>{
    const body=productionRobotsBody()
    expect(body.startsWith('User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /crm/\nDisallow: /private/\n')).toBe(true)
    expect(body.endsWith(`Sitemap: ${PRODUCTION_SITEMAP}\n`)).toBe(true)
    expect(PRODUCTION_SITEMAP).toBe('https://h2ocooling.com/sitemap_index.xml')
    expect(AI_CRAWLERS.map(c=>c.agent)).toEqual(['GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot','Claude-User','PerplexityBot','Perplexity-User','Google-Extended','Applebot-Extended','CCBot'])
    // parse the groups
    const groups=body.split(/\n\n/).map(g=>lines(g).filter(l=>l&&!l.startsWith('#'))).filter(g=>g.some(l=>l.startsWith('User-agent:')))
    expect(groups.map(g=>g[0])).toEqual(['User-agent: *',...AI_CRAWLERS.map(c=>`User-agent: ${c.agent}`)])
    for(const g of groups){
      expect(g.slice(1),g[0]).toEqual(['Allow: /',...PRODUCTION_DISALLOW.map(p=>`Disallow: ${p}`)])
    }
    expect(body).not.toMatch(/Bytespider/i)
    expect(body.split('\n').filter(l=>l.startsWith('Sitemap:'))).toEqual([`Sitemap: ${PRODUCTION_SITEMAP}`])
    // the comment block documents the policy and names every crawler
    expect(body).toMatch(/# AI crawlers are explicitly allowed/)
    for(const c of AI_CRAWLERS)expect(body).toContain(`# ${c.agent}: ${c.product}, `)
  })
  it('served by the proxy: production = that body; staging stays Disallow: / with no Sitemap line',async()=>{
    for(const [policy,expected] of [['production',productionRobotsBody()],[undefined,'User-agent: *\nDisallow: /\n'],['private','User-agent: *\nDisallow: /\n']] as const){
      vi.resetModules()
      const root=payload(policy)
      promote(root,'g',{'ledger.json':JSON.stringify({routes:[],redirects:[]})})
      const {proxy}=await import('../../proxy')
      const {NextRequest}=await import('next/server')
      const res=proxy(new NextRequest(`${O}/robots.txt`))
      expect(await res.text(),String(policy)).toBe(expected)
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      if(policy!=='production'){expect(expected).not.toMatch(/Sitemap/);expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')}
      rmSync(root,{recursive:true,force:true})
    }
  })
})

describe('AEO-1 (1): /llms.txt',()=>{
  it('the text: summary, sections in order, links on the production host, one line each, a page without a title or outside the list is left out',()=>{
    const pages=[
      {path:'/fans/',title:'Cooling Tower Fans | ICS',description:'Axial fans\nfor towers.'},
      {path:'/contact-us/',title:'Contact Us - Industrial Cooling Solutions (ICS)',description:''},
      {path:'/not-listed/',title:'Not listed',description:'x'},
      {path:'/motors/',title:'',description:'no title'},
    ]
    const text=buildLlmsTxt(pages)
    expect(text.startsWith('# Industrial Cooling Solutions (ICS)\n\n> ')).toBe(true)
    expect(text).toContain(`- [Cooling Tower Fans](${LLMS_ORIGIN}/fans/): Axial fans for towers.`)
    expect(text).toContain(`- [Contact Us](${LLMS_ORIGIN}/contact-us/)\n`)
    expect(text).not.toContain('/not-listed/')
    expect(text).not.toContain('/motors/')
    expect(text.indexOf('## Company and contact')).toBeLessThan(text.indexOf('## Parts'))
    expect(text).not.toContain('## Services') // no page of that section
    expect(text).not.toMatch(/staging|localhost/)
    for(const line of text.split('\n').filter(l=>l.startsWith('- ')))expect(line).toMatch(/^- \[[^\]\n]+\]\(https:\/\/h2ocooling\.com\/[^)\s]*\)(?:: [^\n]+)?$/)
  })
  it('the list is 12 to 20 pages, each named once',()=>{
    expect(LLMS_PATHS.length).toBeGreaterThanOrEqual(12)
    expect(LLMS_PATHS.length).toBeLessThanOrEqual(20)
    expect(new Set(LLMS_PATHS).size).toBe(LLMS_PATHS.length)
    expect(LLMS_SECTIONS.every(s=>s.heading&&s.paths.length)).toBe(true)
  })
  const active=JSON.parse(readFileSync(path.join(APP,'content/salmon/active-routes.json'),'utf8')) as Array<{routeId:string;sourceUrl:string;targetPath:string;file:string;sha256:string}>
  const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;state:string;export:boolean;indexable:boolean}>}
  const fixture=(policy:string|undefined,hold:string[]=[])=>{
    const root=payload(policy)
    const rows=active.filter(r=>LLMS_PATHS.includes(r.targetPath))
    const led={...ledger,routes:ledger.routes.map(r=>hold.includes(r.path)?{...r,state:'REVIEW_HOLD'}:r)}
    promote(root,'g1',{'ledger.json':JSON.stringify(led),'routes.salmon.json':JSON.stringify(rows),'routes.live.json':'[]'})
    mkdirSync(path.join(root,'generations','g1','documents'),{recursive:true})
    for(const r of rows)symlinkSync(path.join(APP,'content/salmon',r.file),path.join(root,'generations','g1',r.file))
    return root
  }
  it('the route builds the file from the release data: every page is PUBLIC and indexable, titles and descriptions are the pages\' own, hosts are production',async()=>{
    const root=fixture('production',['/motors/'])
    const {GET}=await import('../../app/(site)/api/llms/route')
    const res=await GET()
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('cache-control')).toMatch(/max-age=\d+/)
    expect(res.headers.get('x-robots-tag')).toBeNull()
    const text=await res.text()
    const urls=[...text.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map(m=>m[1]!)
    expect(urls.length).toBeGreaterThanOrEqual(12)
    expect(urls.length).toBeLessThanOrEqual(20)
    expect(urls.every(u=>u.startsWith(`${LLMS_ORIGIN}/`))).toBe(true)
    expect(urls).not.toContain(`${LLMS_ORIGIN}/motors/`) // held in this fixture
    const open=new Set(ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&r.indexable).map(r=>r.path))
    for(const u of urls)expect(open.has(u.slice(LLMS_ORIGIN.length)),u).toBe(true)
    // the description of a page is the page's own served description
    const {servedDescription}=await import('../SalmonCanonical')
    const {salmonDocument:doc,salmonRoutes}=await import('../salmon')
    const fans=doc(salmonRoutes().find(r=>r.targetPath==='/fans/')!)
    expect(text).toContain(`(${LLMS_ORIGIN}/fans/): ${(servedDescription(fans)??'').replace(/\s+/g,' ').trim()}`)
    rmSync(root,{recursive:true,force:true})
  },120000)
  it('is rebuilt on a new generation (a publish)',async()=>{
    const root=fixture('production')
    const {GET}=await import('../../app/(site)/api/llms/route')
    const first=await (await GET()).text()
    expect(first).toContain('/motors/')
    const rows=active.filter(r=>LLMS_PATHS.includes(r.targetPath))
    const led={...ledger,routes:ledger.routes.map(r=>r.path==='/motors/'?{...r,state:'REVIEW_HOLD'}:r)}
    promote(root,'g2',{'ledger.json':JSON.stringify(led),'routes.salmon.json':JSON.stringify(rows),'routes.live.json':'[]'})
    mkdirSync(path.join(root,'generations','g2','documents'),{recursive:true})
    for(const r of rows)symlinkSync(path.join(APP,'content/salmon',r.file),path.join(root,'generations','g2',r.file))
    expect(await (await GET()).text()).not.toContain('/motors/')
    rmSync(root,{recursive:true,force:true})
  },120000)
  it('the proxy answers /llms.txt by rewriting to the route: no robots header under production, noindex on a private policy',async()=>{
    for(const [policy,header] of [['production',null],[undefined,'noindex, nofollow']] as const){
      vi.resetModules()
      const root=payload(policy)
      promote(root,'g',{'ledger.json':JSON.stringify({routes:[],redirects:[]})})
      const {proxy}=await import('../../proxy')
      const {NextRequest}=await import('next/server')
      for(const host of [O,STAGING]){
        const res=proxy(new NextRequest(`${host}/llms.txt`))
        expect(res.headers.get('x-middleware-rewrite'),`${host} ${policy}`).toBe(`${host}/api/llms/`)
        expect(res.headers.get('x-robots-tag')).toBe(header)
      }
      rmSync(root,{recursive:true,force:true})
    }
  })
})

describe('AEO-1 (2): FAQPage structured data from the visible FAQ',()=>{
  const norm=(s:string)=>s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()
  const faqSchema=(html:string)=>[...html.matchAll(/<script type="application\/ld\+json"[^>]*>([^<]+)<\/script>/g)].map(m=>JSON.parse(m[1]!.replace(/\\u003c/g,'<'))).filter(j=>j['@type']==='FAQPage'||(Array.isArray(j['@graph'])&&j['@graph'].some((n:{'@type'?:string})=>n['@type']==='FAQPage')))
  const visible=(html:string)=>{
    const list=html.slice(html.indexOf('page-faq-list'))
    const end=list.indexOf('</div>')
    return [...list.slice(0,end).matchAll(/<details[^>]*><summary[^>]*>(.*?)<\/summary>(.*?)<\/details>/g)].map(m=>({q:norm(m[1]!),a:norm(m[2]!)}))
  }
  const render=(p:string)=>renderToStaticMarkup(<R5bLocationPage doc={salmonDocument(releaseRoutes().find(r=>r.targetPath===p)!)}/>)
  it('a location page with a visible FAQ has exactly one FAQPage and its questions and answers are the visible text, word for word',()=>{
    const html=render('/cooling-tower-thailand/')
    const shown=visible(html)
    expect(shown.length).toBeGreaterThanOrEqual(2)
    const schemas=faqSchema(html)
    expect(schemas).toHaveLength(1)
    const entities=schemas[0]!.mainEntity as Array<{name:string;acceptedAnswer:{text:string}}>
    expect(entities.map(e=>({q:norm(e.name),a:norm(e.acceptedAnswer.text)}))).toEqual(shown)
    // the schema carries nothing the page does not show
    for(const e of entities)expect(norm(html.slice(0,html.indexOf('data-location-faq')))).toContain(norm(e.acceptedAnswer.text).slice(0,60))
  },120000)
  it('a page whose FAQ comes from the registry (Japan) is not doubled; pages with no visible FAQ get none',()=>{
    expect(faqSchema(render('/cooling-tower-japan/')).length).toBeLessThanOrEqual(1)
    expect(render('/cooling-tower-japan/')).not.toContain('data-location-faq')
    for(const p of ['/cooling-tower-malaysia/','/cooling-tower-singapore/']){
      const html=render(p)
      expect(html,p).not.toContain('page-faq-list')
      expect(faqSchema(html),p).toHaveLength(0)
    }
  },120000)
})

describe('AEO-1 (3): "Last updated" on posts and calculators',()=>{
  const day=(html:string)=>/Last updated[^<]*<time dateTime="(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1]
  const calculators=['/cooling-tower-blowdown-calculation/','/cooling-tower-efficiency-calculation/','/cooling-tower-makeup-water-calculation/','/cooling-tower-ton-calculation/']
  it('the four calculators and a spread of posts show "Last updated <date>", the same day as the BlogPosting dateModified',()=>{
    const posts=releaseRoutes().filter(r=>/-posts-/.test(r.routeId)&&!calculators.includes(r.targetPath))
    const sample=[...calculators.map(p=>releaseRoutes().find(r=>r.targetPath===p)!),...posts.filter((_,i)=>i%9===0)]
    let shown=0
    for(const route of sample){
      const doc=salmonDocument(route)
      const modified=articleModified(doc)
      if(!modified)continue
      const html=renderToStaticMarkup(dispatch(doc))
      if(!html.includes('wave4-detail'))continue
      expect(day(html),route.targetPath).toBe(modified)
      shown++
    }
    expect(shown).toBeGreaterThan(25)
  },600000)
  it('the date is shown even when it is the publication day, and the copy is "Last updated {date}"',()=>{
    const copy=JSON.parse(readFileSync(path.join(APP,'content/design/article-layout.json'),'utf8')).copy as Record<string,string>
    expect(copy['meta.updated']).toBe('Last updated {date}')
    const route=releaseRoutes().find(r=>r.targetPath==='/cooling-tower-cold-weather-issues/')! // an article that showed no update date before
    const html=renderToStaticMarkup(dispatch(salmonDocument(route)))
    expect(html).toMatch(/Last updated[^<]*<time dateTime="2025-12-23">December 23, 2025<\/time>/)
  },120000)
})
