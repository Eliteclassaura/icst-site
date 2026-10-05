/**
 * OGCS_H1_DECISIONS_2026-10-02 with the Control Tower ruling: every decided route renders exactly one H1, existing
 * headings keep their level, the author archive stays noindex,follow and out of the sitemap, and no email renders.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {mkdirSync,mkdtempSync,readFileSync,renameSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {NextRequest} from 'next/server'
import {salmonDocument,salmonRoutes} from '../salmon'
import {SalmonFamilyPage,salmonFamilyFor} from '../SalmonFamilies'
import {SalmonCanonical} from '../SalmonCanonical'
import {articleMetadataTitle,articleSocialTitle} from '../article-metadata'
import {NOINDEX_FOLLOW_PATHS} from '../../content/config'

const doc=(routeId:string)=>salmonDocument(salmonRoutes().find(route=>route.routeId===routeId)!)
const headings=(html:string)=>[...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g)].map(([,tag,inner])=>[tag,inner!.replace(/<[^>]+>/g,'').replaceAll('&#x27;',"'").replaceAll('&amp;','&').trim()])
// Base outlines inside <main>, read from the hosted validation build before this change (2026-10-02).
const BASE:Record<string,string[]>={
  'SALMON-pages-8':['Our Promise','Power Plants'],
  'SALMON-pages-7':['Power Plant','Custom Cooling','Maintenance','Repairs','Consulting','Stay Cool'],
  'SALMON-b2503fcd6ca86806':['Tim Bozic','Professional Introduction','Areas of Expertise','Experience','What Tim Writes About',"Why Trust Tim Bozic's Insights?",'Industries Served',"Tim's expertise supports organizations across a wide range of industrial sectors, including:",'Editorial Focus'],
}
const familyHtml=(routeId:string)=>{const d=doc(routeId);return renderToStaticMarkup(<SalmonFamilyPage doc={d} config={salmonFamilyFor(d)!}/>)}
const main=(html:string)=>html.slice(html.indexOf('<main'),html.indexOf('</main>'))

describe('decided page H1s',()=>{
  it.each([['SALMON-pages-8','Industries','Our Promise'],['SALMON-pages-7','Solutions','Power Plant']] as const)('%s has one new H1 above the first section; source headings keep their level',(routeId,h1,first)=>{
    const html=main(familyHtml(routeId))
    const all=headings(html)
    expect(all.filter(([tag])=>tag==='h1')).toEqual([['h1',h1]])
    expect(all[0]).toEqual(['h1',h1])
    expect(all[1]).toEqual(['h2',first])
    expect(all.slice(1)).toEqual(BASE[routeId]!.map(text=>['h2',text]))
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('data-salmon-section="0"'))
    expect(html).toMatch(/<h1 class="sp-heading sp-type-display sp-c-ink">/)
  })
  it('the author archive promotes its existing "Tim Bozic" heading (no duplicate) and keeps the approved bio',()=>{
    const html=renderToStaticMarkup(<SalmonCanonical doc={doc('SALMON-b2503fcd6ca86806')}/>)
    const all=headings(main(html))
    expect(all.filter(([tag])=>tag==='h1')).toEqual([['h1','Tim Bozic']])
    expect(all[0]).toEqual(['h1','Tim Bozic'])
    expect(all).toEqual([['h1','Tim Bozic'],...BASE['SALMON-b2503fcd6ca86806']!.slice(1).map(text=>['h2',text])])
    expect(main(html)).toContain('Tim Bozic is President of Industrial Cooling Solutions')
    expect(html).not.toMatch(/mailto:|[\w.+-]+@[\w-]+\.[\w.]+/)
  })
  it('the author archive title is "Tim Bozic - ICS"; an editor-set title still wins; other routes are unchanged',()=>{
    const author=doc('SALMON-b2503fcd6ca86806')
    expect(articleMetadataTitle(author)).toBe('Tim Bozic - ICS')
    expect(articleSocialTitle(author,'Tim Bozic | President, Industrial Cooling Solutions')).toBe('Tim Bozic - ICS')
    expect(articleMetadataTitle({...author,seo:{...author.seo,title:'Edited title'}})).toBe('Edited title')
    expect(articleMetadataTitle(doc('SALMON-pages-8'))).toBe('Industries - ICS')
    expect(articleMetadataTitle(doc('SALMON-pages-7'))).toBe('Solutions - ICS')
    const og=renderToStaticMarkup(<SalmonCanonical doc={author}/>)
    expect(og).toContain('property="og:title" content="Tim Bozic - ICS"')
    expect(og).not.toContain('content="Tim Bozic | President, Industrial Cooling Solutions"')
  })
})

describe('author archive indexing under H2O_INDEXING_POLICY=production',()=>{
  const env={...process.env}
  afterEach(()=>{process.env={...env}})
  const snapshot=()=>{
    const root=mkdtempSync(path.join(tmpdir(),'h2o-h1-'))
    mkdirSync(path.join(root,'generations','g'),{recursive:true})
    const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;state:string;indexable:boolean;sitemap:boolean;canonical?:string}>}
    const routes=ledger.routes.filter(row=>['/author/timbozic/','/author/tbozic/','/industries/','/solutions/','/contact-us/'].includes(row.path)).map(row=>({path:row.path,state:row.state,indexable:row.indexable,sitemap:row.sitemap,canonical:row.canonical}))
    routes.push({path:'/indexed-fixture/',state:'PUBLIC',indexable:true,sitemap:true,canonical:'https://h2ocooling.com/indexed-fixture/'})
    writeFileSync(path.join(root,'generations','g','ledger.json'),JSON.stringify({routes,redirects:[]}))
    mkdirSync(path.join(root,'releases'),{recursive:true})
    writeFileSync(path.join(root,'releases','r-g.json'),JSON.stringify({format:1,id:'r-g',content:'g',search:'s-g'}))
    symlinkSync('releases/r-g.json',path.join(root,'release.tmp'));renameSync(path.join(root,'release.tmp'),path.join(root,'release'))
    process.env.H2O_CONTENT_SOURCE='payload'
    process.env.CONTENT_SNAPSHOT_DIR=root
  }
  it('is noindex,follow and out of the sitemap; other non-indexable routes stay noindex,nofollow; private stays closed',async()=>{
    // The rule follows the author archive to its canonical address (owner decision 2026-10-02).
    expect([...NOINDEX_FOLLOW_PATHS][0]).toBe('/author/timbozic/')
    snapshot()
    const {proxy,sitemapResponse}=await import('../../proxy')
    const tag=(p:string)=>proxy(new NextRequest(`https://h2ocooling.com${p}`)).headers.get('x-robots-tag')
    expect(tag('/author/timbozic/')).toBe('noindex, nofollow')
    expect(await sitemapResponse().text()).not.toMatch(/<loc>/)
    process.env.H2O_INDEXING_POLICY='production'
    expect(tag('/author/timbozic/')).toBe('noindex, follow')
    expect(tag('/author/tbozic/')).toBe('noindex, nofollow')
    expect(tag('/industries/')).toBe('noindex, nofollow')
    expect(tag('/solutions/')).toBe('noindex, nofollow')
    expect(tag('/indexed-fixture/')).toBeNull()
    const sitemap=await sitemapResponse().text()
    expect(sitemap).toMatch(/<loc>https:\/\/h2ocooling\.com\/indexed-fixture\/<\/loc>/)
    expect(sitemap).not.toMatch(/\/author\//)
  })
  it('page metadata reads the same decision as the header',()=>{
    // SEO parity Part 2: the rule lives in content/config publicRobots (pure, tested directly); page-bridge delegates to it.
    const bridge=readFileSync(path.join(process.cwd(),'src/content/page-bridge.ts'),'utf8')
    const config=readFileSync(path.join(process.cwd(),'src/content/config.ts'),'utf8')
    expect(bridge).toMatch(/return publicRobots\(record, preview\)/)
    expect(config).toMatch(/if \(record\.disposition\?\.state === 'PUBLIC' && NOINDEX_FOLLOW_PATHS\.has\(record\.path\)\) return \{ index: false, follow: true \}/)
    expect(config).toMatch(/if \(preview \|\| indexingPolicy\(env\) !== 'production'\) return \{ index: false, follow: false \}/)
  })
})
