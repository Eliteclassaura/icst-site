/**
 * SEO-FIX-1 (CT 2026-10-07; H2O_SEO_DEEP_R1 technical report + OGCS rulings 46d05c1b + Codex staging crawl R1): template
 * and code fixes before launch.
 */
import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import type {ReactElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {RETIRED_THAILAND_PHONE,liveRoutes,ownerHref,ownerText,provenanceHref,salmonDocument,salmonRoutes,type SalmonDocument} from '../salmon'
import {SalmonCanonical,servedDescription,servedTitle} from '../SalmonCanonical'
import {ABOUT_ROUTE_ID,AboutComposition} from '../AboutComposition'
import {ArchivePage,isArchiveDocument} from '../ArchivePresentation'
import {LuxuryCanonical,luxuryIds} from '../LuxuryCanonical'
import {r4Builders} from '../r4/R4Pages'
import {R4PortfolioPage,R4_PORTFOLIO_ROUTE} from '../r4/R4Portfolio'
import {PartsIndex} from '../Wave3Presentation'
import {R5ProductDetail} from '../r5/R5Product'
import {R5PartsFamilyPage,R5_PARTS_FAMILIES} from '../r5/R5PartsPages'
import {SalmonFamilyPage,salmonFamilyFor} from '../SalmonFamilies'
import {LiveEnglishDetail,Wave4ArticleDetail,Wave4ArticleIndex,Wave4Library} from '../Wave4Presentation'
import {matchedWave4Article} from '../wave4'
import {HEAD_THIRD_PARTY_HOSTS,servedOrigin} from '../public-urls'
import {localeOnly} from '../../content/sitemap-response'
import {sitemapEntries,type LocaleData} from '../../content/sitemap'
import {PRODUCT_TAG_KEEP_INDEXED,productTagNoindex,publicRobots} from '../../content/config'
import {pagedHubMetadata} from '../../app/(site)/[[...slug]]/page'

const APP=process.cwd()
/** The catch-all's dispatch order (src/app/(site)/[[...slug]]/page.tsx) for a release document. */
export function dispatch(doc:SalmonDocument):ReactElement{
  if(doc.routeId===ABOUT_ROUTE_ID)return <AboutComposition doc={doc}/>
  if(r4Builders[doc.routeId])return <LuxuryCanonical doc={doc}/>
  if(doc.routeId===R4_PORTFOLIO_ROUTE)return <R4PortfolioPage doc={doc}/>
  const family=salmonFamilyFor(doc)
  if(family&&R5_PARTS_FAMILIES.has(family.family))return <R5PartsFamilyPage doc={doc}/>
  if(family)return <SalmonFamilyPage doc={doc} config={family}/>
  if(isArchiveDocument(doc))return <ArchivePage doc={doc}/>
  if(doc.routeId.startsWith('LIVE-'))return <LiveEnglishDetail doc={doc}/>
  if(doc.targetPath==='/cooling-tower-parts-online/')return <PartsIndex doc={doc}/>
  if(doc.type==='product'&&doc.routeId.startsWith('SALMON-product-'))return <R5ProductDetail doc={doc}/>
  if(['SALMON-pages-1797','SALMON-pages-1870'].includes(doc.routeId))return <Wave4Library doc={doc}/>
  if(doc.routeId==='SALMON-pages-1875')return <Wave4ArticleIndex doc={doc}/>
  if(matchedWave4Article(doc))return <Wave4ArticleDetail doc={doc}/>
  return luxuryIds.has(doc.routeId)?<LuxuryCanonical doc={doc}/>:<SalmonCanonical doc={doc}/>
}
const RETIRED=new RegExp(RETIRED_THAILAND_PHONE.source)

describe('SEO-FIX-1 (a): the retired Thailand number appears nowhere in rendered HTML, attributes included (launch-blocking)',()=>{
  it('the provenance attribute never carries a contact value; every written form of the number is replaced',()=>{
    expect(provenanceHref('tel:66-2-260-6598')).toBeUndefined()
    expect(provenanceHref('mailto:sales@h2ocooling.com')).toBeUndefined()
    expect(provenanceHref('https://h2ocooling.com/contact-us/')).toBe('https://h2ocooling.com/contact-us/')
    for(const written of ['+66-2-260-6598','66-2-260-6598','+66 2 260 6598','(02) 260-6598','02-260-6598','2606598'])expect(ownerText(`Call ${written} today`),written).toBe('Call +662-661-7723 today')
    for(const href of ['tel:66-2-260-6598','tel:+6622606598','tel:+66 2 260 6598'])expect(ownerHref(href),href).toBe('tel:+6626617723')
  })
  it('every route whose source holds the number renders without it (page body, head JSON-LD, title and description)',()=>{
    const offenders:string[]=[]
    let checked=0
    const paths:string[]=[]
    for(const route of [...salmonRoutes(),...liveRoutes()]){
      if(!RETIRED.test(readFileSync(path.join(APP,'content/salmon',route.file),'utf8')))continue
      const doc=salmonDocument(route)
      checked++;paths.push(route.targetPath)
      const html=renderToStaticMarkup(dispatch(doc))
      for(const [where,text] of [['html',html],['title',servedTitle(doc)],['description',servedDescription(doc)??'']] as const)if(RETIRED.test(text))offenders.push(`${route.targetPath} (${where}): ${text.match(RETIRED)?.[0]}`)
    }
    expect(checked).toBeGreaterThan(100)
    expect(paths).toContain('/thank-you/')
    expect(offenders).toEqual([])
  },900000)
})

describe('SEO-FIX-1: product titles are never cut mid-word (H2O_SEO_DEEP_R1 SF-7)',()=>{
  it('no served product title ends in a cut word; the one imported cut is fixed by the SEO-CONTENT-1 title row',()=>{
    // No code path shortens a title (servedTitle keeps the stored title); a title cut by the old WordPress plugin shows as a
    // last word that no product page uses anywhere else. The known cut (OGCS 46d05c1b section 5) is corrected in Main-B's
    // R5b content batch; any other cut fails here.
    const products=salmonRoutes().filter(route=>route.routeId.startsWith('SALMON-product-')).map(route=>salmonDocument(route))
    const vocabulary=new Map<string,number>()
    const words=(text:string):string[]=>text.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]
    for(const doc of products)for(const w of new Set(words(JSON.stringify(doc.children)+' '+doc.seo.title)))vocabulary.set(w,(vocabulary.get(w)??0)+1)
    // SEO-CONTENT-1 (CT 2026-10-07): the decided title (data/seo-fields.tsv, written by the batch) is what is served for the cut one
    const corrected=new Set(readFileSync(path.join(APP,'ops/seo-pass/data/sc1-seo-set.tsv'),'utf8').trimEnd().split('\n').slice(1).map(l=>l.split('\t')).filter(c=>c[1]==='title'&&c[0]!.startsWith('/product/')).map(c=>c[0]!))
    const decided=new Map(readFileSync(path.join(APP,'ops/seo-pass/data/seo-fields.tsv'),'utf8').trimEnd().split('\n').slice(1).map(l=>l.split('\t')).filter(c=>corrected.has(c[0]!)).map(c=>[c[0]!,c[3]!] as [string,string]))
    const cut=products.filter(doc=>{const last=words(decided.get(doc.targetPath)??servedTitle(doc)).at(-1)??'';return last.length>3&&(vocabulary.get(last)??0)<2&&!words(JSON.stringify(doc.children)).includes(last)}).map(doc=>doc.targetPath)
    expect(cut).toEqual([])
  },300000)
})

const byPath=(target:string):SalmonDocument=>{const r=[...salmonRoutes(),...liveRoutes()].find(route=>route.targetPath===target||decodeURIComponent(route.targetPath)===target)!;return salmonDocument(r)}
const jsonLd=(html:string)=>[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]!.replaceAll('\\u003c','<')) as Record<string,unknown>)
const nodesOf=(html:string)=>jsonLd(html).flatMap(block=>Array.isArray(block['@graph'])?block['@graph'] as Array<Record<string,unknown>>:[block])
const typed=(nodes:Array<Record<string,unknown>>,type:string)=>nodes.filter(n=>(Array.isArray(n['@type'])?n['@type']:[n['@type']]).includes(type))
const SAMPLE=['/','/contact-us/','/thermal-upgrade/','/cooling-tower-maintenance-repair-upgrade/','/disaster-recovery/','/cooling-tower-approach/','/aluminum-vs-frp-fan-blades/','/product/brentwood-kelly-bar-splash-fill/','/product/addax-drive-shaft-composite-coupling-lra350-275/','/all-projects/lanxess/','/thailand-cooling-tower/','/cooling-tower-construction-repair-in-singapore/','/cooling-tower-parts-online/','/fans/','/tech-articles/']

describe('SEO-FIX-1: one Organization and WebSite, plain strings, one page entity (SF-1…SF-6)',()=>{
  it('every sampled page carries exactly one #organization (the ruled fields) and one #website, both on the canonical origin',()=>{
    for(const target of SAMPLE){
      const nodes=nodesOf(renderToStaticMarkup(dispatch(byPath(target))))
      const orgs=typed(nodes,'Organization'),sites=typed(nodes,'WebSite')
      expect(orgs.length,target).toBe(1)
      expect(sites.length,target).toBe(1)
      const org=orgs[0]!
      expect(org['@id']).toBe('https://h2ocooling.com/#organization')
      expect(org.name).toBe('Industrial Cooling Solutions (ICS)')
      expect(org.legalName).toBe('Industrial Cooling Solutions Inc')
      expect(org.alternateName).toEqual(['ICS','Industrial Cooling Solutions'])
      expect(org.sameAs).toEqual(['https://www.linkedin.com/company/industrial-cooling-solutions/','https://www.facebook.com/Industrial-Cooling-Solutions-Inc-ICS-807464446083414/','https://www.instagram.com/h2ocooling2','https://www.youtube.com/@IndustrialCoolingSolution','https://www.tiktok.com/@h2ocooling0'])
      expect((org.contactPoint as Array<{telephone:string}>).map(c=>c.telephone)).toEqual(['+13034622000','+6626617723','+819042046742'])
      expect((org.logo as {url:string;width:number}).url).toBe('https://h2ocooling.com/icon-512.png')
      expect(sites[0]!.name).toBe('Industrial Cooling Solutions (ICS)')
      // every reference to an organization or a website names the canonical node
      const refs=JSON.stringify(nodes).match(/"@id":"[^"]*#(?:organization|website)"/g)??[]
      for(const ref of refs)expect(ref,target).toMatch(/"@id":"https:\/\/h2ocooling\.com\/#(?:organization|website)"/)
    }
  },300000)
  it('no JSON-LD string holds an HTML entity; one Person at most, always the public author archive (never the 404 one) without a self-domain sameAs',()=>{
    for(const target of SAMPLE){
      const doc=byPath(target)
      const html=renderToStaticMarkup(dispatch(doc))
      const json=JSON.stringify(jsonLd(html))
      expect(json,target).not.toMatch(/&(?:amp|quot|#0?39|#8211|#8217);/)
      expect(json,target).not.toContain('/author/h2ocooling/')
      const people=typed(nodesOf(html),'Person')
      expect(people.length,target).toBeLessThanOrEqual(1)
      if(doc.type==='posts')expect(people.length,target).toBe(1)
      for(const person of people){
        expect(person['@id'],target).toBe('https://h2ocooling.com/author/timbozic/')
        expect(JSON.stringify(person.sameAs??[]),target).not.toMatch(/"https?:\/\/(?:www\.)?h2ocooling\.com\/?"/)
      }
    }
  },300000)
  it('one WebPage per page; service routes carry their Service (provider = #organization); a Product is named by its H1',()=>{
    for(const target of SAMPLE){
      const nodes=nodesOf(renderToStaticMarkup(dispatch(byPath(target))))
      expect(typed(nodes,'WebPage').length,target).toBeLessThanOrEqual(1)
      // no reference points at a node the page does not carry (the removed #richSnippet, Person or legacy Organization)
      const ids=new Set(nodes.flatMap(function all(n:unknown):string[]{if(!n||typeof n!=='object')return [];const o=n as Record<string,unknown>;return [...(typeof o['@id']==='string'&&Object.keys(o).length>1?[o['@id'] as string]:[]),...Object.values(o).flatMap(all)]}))
      const refs=[...JSON.stringify(nodes).matchAll(/\{"@id":"([^"]+)"\}/g)].map(m=>m[1]!)
      for(const ref of refs)expect(ids.has(ref)||/#(?:organization|website)$/.test(ref),`${target} → ${ref}`).toBe(true)
    }
    for(const target of ['/thermal-upgrade/','/cooling-tower-maintenance-repair-upgrade/','/disaster-recovery/']){
      const services=typed(nodesOf(renderToStaticMarkup(dispatch(byPath(target)))),'Service')
      expect(services.length,target).toBe(1)
      expect(services[0]!.provider).toEqual({'@id':'https://h2ocooling.com/#organization'})
      expect(services[0]!.url).toBe(`https://h2ocooling.com${target}`)
    }
    const product=typed(nodesOf(renderToStaticMarkup(dispatch(byPath('/product/brentwood-kelly-bar-splash-fill/')))),'Product')
    expect(product.map(p=>p.name)).toEqual(['Brentwood Kelly Bar Splash Fill'])
    expect(String(product[0]!.description??'')).not.toMatch(/^(?:Buy|Order|Shop)\b/i)
  },300000)
  it('a location page sits under Home (title case), not Resources',()=>{
    for(const target of ['/thailand-cooling-tower/','/cooling-tower-construction-repair-in-singapore/','/cooling-tower-construction-repair-in-united-states/']){
      const html=renderToStaticMarkup(dispatch(byPath(target)))
      const crumbs=typed(nodesOf(html),'BreadcrumbList').flatMap(b=>(b.itemListElement as Array<{name:string}>).map(i=>i.name))
      expect(crumbs[0],target).toBe('Home')
      expect(crumbs,target).not.toContain('Resources')
      expect(crumbs.length,target).toBe(2)
      expect(crumbs[1],target).not.toBe(crumbs[1]!.toUpperCase())
      expect(mainOf(html),target).not.toContain('href="/resources/"')
    }
  },300000)
  it('inLanguage is the page language: the Thai root page says "th" and carries no hreflang',()=>{
    const thai=nodesOf(renderToStaticMarkup(dispatch(byPath('/โซลูชั่นการทำความเย็นส/'))))
    const langs=new Set(JSON.stringify(thai.filter(n=>n['@type']!=='WebSite')).match(/"inLanguage":"[^"]+"/g))
    expect([...langs]).toEqual(['"inLanguage":"th"'])
    const english=nodesOf(renderToStaticMarkup(dispatch(byPath('/thermal-upgrade/'))))
    expect(JSON.stringify(english)).not.toContain('"inLanguage":"en-US"')
  },300000)
})

const mainOf=(html:string)=>html.slice(html.indexOf('<main'),html.indexOf('</main>'))

describe('SEO-FIX-1: hosts, hreflang, project order, pagination, product tags, LCP',()=>{
  it('LB-3: under the production policy no head or JSON-LD URL names a staging or sslip host, whatever NEXT_PUBLIC_SERVER_URL says',()=>{
    const env={policy:process.env.H2O_INDEXING_POLICY,server:process.env.NEXT_PUBLIC_SERVER_URL}
    try{
      for(const server of ['https://staging.h2ocooling.org','http://203.0.113.7.sslip.io']){
        process.env.H2O_INDEXING_POLICY='production';process.env.NEXT_PUBLIC_SERVER_URL=server
        expect(servedOrigin()).toBe('https://h2ocooling.com')
        for(const target of SAMPLE){
          const html=renderToStaticMarkup(dispatch(byPath(target)))
          const head=[...html.matchAll(/<(?:meta|link)\b[^>]*>/g)].map(m=>m[0]).join('\n')+JSON.stringify(jsonLd(html))
          const urls=head.match(/https?:\/\/[^"'\s<>\\]+/g)??[]
          const foreign=urls.filter(u=>{const host=new URL(u).hostname;return host!=='h2ocooling.com'&&!HEAD_THIRD_PARTY_HOSTS.has(host)&&!/(?:instagram|youtube|tiktok)\.com$/.test(host)&&host!=='schema.org'})
          expect(foreign,`${server} ${target}`).toEqual([])
          expect(head,target).not.toMatch(/staging\.h2ocooling\.org|sslip\.io/)
        }
      }
      process.env.H2O_INDEXING_POLICY='private';process.env.NEXT_PUBLIC_SERVER_URL='https://staging.h2ocooling.org'
      expect(servedOrigin()).toBe('https://staging.h2ocooling.org')
    }finally{
      for(const [k,v] of [['H2O_INDEXING_POLICY',env.policy],['NEXT_PUBLIC_SERVER_URL',env.server]] as const){if(v===undefined)delete process.env[k];else process.env[k]=v}
    }
  },600000)
  it('the parts-and-functions locale cluster is LOCALE_ONLY (no en, no x-default); every other cluster is unchanged',()=>{
    const data=JSON.parse(readFileSync(path.join(APP,'content/locale/sitemap-locale.json'),'utf8')) as LocaleData
    const out=localeOnly(data)
    const parts=out.clusters.find(c=>c.some(m=>m.url.includes('/id/komponen-dan-fungsi-menara-pendingin/')))!
    expect(parts.map(m=>m.hreflang).sort()).toEqual(['id','ja','th','vi'])
    expect(JSON.stringify(parts)).not.toContain('/cooling-tower-parts-online/')
    const changed=out.clusters.filter((c,i)=>JSON.stringify(c)!==JSON.stringify(data.clusters[i]))
    expect(changed).toEqual([parts])
  })
  it('SF-10: on a project page the H1 comes before any other heading, and the fact cards are a definition list',()=>{
    for(const target of ['/all-projects/lanxess/','/all-projects/ptt-cracker-project/','/all-projects/pvc-plant-freeport-texas/']){
      const main=mainOf(renderToStaticMarkup(dispatch(byPath(target))))
      const headings=[...main.matchAll(/<(h[1-6])\b/g)].map(m=>m[1])
      expect(headings[0],target).toBe('h1')
      expect(main,target).not.toMatch(/<h[2-6][^>]*>Project Description:?<\/h/)
      expect(main,target).toMatch(/<dl class="sp-iconbox-body"><dt[^>]*>(?:<[^>]+>)*Industry/)
      expect(main,target).not.toMatch(/<h3[^>]*>(?:Project|Industry|Client|Location|Tower Type|Year)<\/h3>/)
    }
  })
  it('the parts hub ?page=N (N ≥ 2) names its page in the title and description; page 1 is unchanged',()=>{
    const base={title:{absolute:'Cooling Tower Parts Online | OEM Replacement Parts'},description:'Explore cooling tower parts online.',alternates:{canonical:'https://h2ocooling.com/cooling-tower-parts-online/'}}
    expect(pagedHubMetadata(base,1)).toEqual(base)
    expect(pagedHubMetadata(base,Number.NaN)).toEqual(base)
    const p3=pagedHubMetadata(base,3)
    expect(p3.title).toEqual({absolute:'Cooling Tower Parts Online | OEM Replacement Parts - Page 3'})
    expect(p3.description).toBe('Page 3: Explore cooling tower parts online.')
    expect(p3.alternates).toEqual(base.alternates)
  })
  it('product-tag archives are noindex,follow in production and out of the sitemap, except the ones with Google clicks',()=>{
    const prod={H2O_INDEXING_POLICY:'production'} as unknown as NodeJS.ProcessEnv
    const tag=(p:string)=>publicRobots({path:p,disposition:{state:'PUBLIC',indexable:true}},false,prod)
    expect(tag('/product-tag/cooling-tower-fans/')).toEqual({index:false,follow:true})
    expect(tag('/product-tag/blade-de/')).toEqual({index:false,follow:true})
    for(const kept of PRODUCT_TAG_KEEP_INDEXED)expect(tag(kept),kept).toEqual({index:true,follow:true})
    expect(tag('/product-category/fans/')).toEqual({index:true,follow:true})
    const entries=sitemapEntries({rows:[{path:'/product-tag/blade-de/',state:'PUBLIC',sitemap:true,indexable:true},{path:'/product-tag/paramax-sfc/',state:'PUBLIC',sitemap:true,indexable:true}],origin:'https://h2ocooling.com',noindexFollowPath:productTagNoindex})
    expect(entries.map(e=>e.key)).toEqual(['/product-tag/paramax-sfc/'])
  })
  it('SF-11/SF-12: an article\'s featured image is eager with high priority; the footer flags are lazy (no preload)',()=>{
    for(const target of ['/cooling-tower-approach/','/aluminum-vs-frp-fan-blades/']){
      const main=mainOf(renderToStaticMarkup(dispatch(byPath(target))))
      const first=main.match(/<img\b[^>]*>/)![0]
      expect(first,target).toContain('loading="eager"')
      expect(first,target).toMatch(/fetchPriority="high"|fetchpriority="high"/)
      expect((main.match(/loading="eager"/g)??[]).length,target).toBe(1)
    }
    const html=renderToStaticMarkup(dispatch(byPath('/thermal-upgrade/')))
    for(const sha of ['0caf534a','f4d74fbc','127be41a'])expect(html,sha).not.toMatch(new RegExp(`<link rel="preload" as="image" href="[^"]*${sha}`))
  })
})
