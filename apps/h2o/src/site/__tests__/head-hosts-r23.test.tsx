/**
 * R2.3 (Control Tower 2026-10-05, pre-cutover): no rendered page's head — meta tags and structured data — names a host other
 * than this site's origins (canonical; serving) and the allowlisted third parties. Media it names are files this site serves.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page,{generateStaticParams} from '../../app/(site)/[[...slug]]/page'
import {HEAD_THIRD_PARTY_HOSTS,headOrigins,publicHeadUrl,publicMediaUrl,publicMeta,publicSchema,servedOrigin} from '../public-urls'
import {projectMediaRegistry} from '../project-media'
import {ogDefault} from '../standard-head'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1';delete process.env.NEXT_PUBLIC_SERVER_URL})
afterEach(()=>{process.env={...env}})
const render=async(slug:string[])=>renderToStaticMarkup(await Page({params:Promise.resolve({slug}),searchParams:Promise.resolve({})}))
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/\\u0026/g,'&').replace(/\\\//g,'/')
/** The page's head as the guard reads it: every meta tag's content, and every JSON-LD block. */
const headOf=(html:string)=>[...[...html.matchAll(/<meta [^>]*content="([^"]*)"/g)].map(m=>decode(m[1]!)),...[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>decode(m[1]!))].join('\n')
const hostsIn=(text:string)=>[...text.matchAll(/https?:\/\/([^/"'\s?#\\<>]+)/gi)].map(m=>m[1]!.toLowerCase())
/** A served media URL (this site's origin) maps to a file in public/. */
const served=(url:string)=>existsSync(path.join(APP,'public',decodeURIComponent(new URL(url).pathname)))

describe('public head URLs',()=>{
  it('identity and page URLs take the canonical origin; media the served file; foreign hosts are dropped',()=>{
    expect(publicHeadUrl('https://salmon-rhinoceros-754457.hostingersite.com/#organization')).toBe('https://h2ocooling.com/#organization')
    expect(publicHeadUrl('https://salmon-rhinoceros-754457.hostingersite.com/energy-efficient-cooling-tower/#webpage')).toBe('https://h2ocooling.com/energy-efficient-cooling-tower/#webpage')
    expect(publicHeadUrl('https://media.istockphoto.com/id/1/photo.jpg')).toBeNull()
    expect(publicHeadUrl('https://www.linkedin.com/company/x')).toBe('https://www.linkedin.com/company/x')
    expect(publicHeadUrl('https://schema.org')).toBe('https://schema.org')
    expect(publicHeadUrl('not a url')).toBeUndefined()
    // C6 (crop) and C3 (withheld) through the generic path
    expect(publicMediaUrl('https://salmon-rhinoceros-754457.hostingersite.com/wp-content/uploads/2026/07/image-51-2.jpeg')).toEqual({url:'https://h2ocooling.com/media/salmon/a8a1a4e647c20aaa5692a1ae77911a5f7582fb1ddbcdea65f5f92b0d57efdfbd.jpeg',width:872,height:478,type:'image/jpeg',sha256:'a8a1a4e647c20aaa5692a1ae77911a5f7582fb1ddbcdea65f5f92b0d57efdfbd'})
    expect(publicMediaUrl('https://salmon-rhinoceros-754457.hostingersite.com/wp-content/uploads/2026/07/image-79-1-300x169.jpeg')).toBeNull()
  })
  it('media take the serving origin (NEXT_PUBLIC_SERVER_URL), identity keeps the canonical one',()=>{
    process.env.NEXT_PUBLIC_SERVER_URL='https://staging.example.test/'
    expect(servedOrigin()).toBe('https://staging.example.test')
    expect(headOrigins()).toEqual(['https://h2ocooling.com','https://staging.example.test'])
    expect(publicMediaUrl('https://salmon-rhinoceros-754457.hostingersite.com/wp-content/uploads/2026/07/image-51-2.jpeg')?.url).toMatch(/^https:\/\/staging\.example\.test\/media\/salmon\//)
    expect(publicHeadUrl('https://salmon-rhinoceros-754457.hostingersite.com/#website')).toBe('https://h2ocooling.com/#website')
    process.env.NEXT_PUBLIC_SERVER_URL='not a url'
    expect(servedOrigin()).toBe('https://h2ocooling.com')
  })
  it('an unheld og:image takes its width, height, type and alt with it; a held one carries the served size',()=>{
    const unheld=publicMeta([{name:'og:image',value:'https://h2ocooling.com/wp-content/uploads/2099/01/none.jpg'},{name:'og:image:width',value:'1600'},{name:'og:image:alt',value:'x'},{name:'og:title',value:'T'}])
    expect(unheld).toEqual([{name:'og:title',value:'T'}])
    const crop=publicMeta([{name:'og:image',value:'https://salmon-rhinoceros-754457.hostingersite.com/wp-content/uploads/2026/07/image-18-1.jpeg'},{name:'og:image:width',value:'1600'},{name:'og:image:height',value:'900'}])
    expect(crop.map(m=>m.value)).toEqual(['https://h2ocooling.com/media/salmon/dd73aa252e21b19ff9e85ce5ea072e6aa983b3b0beb3766a9772d90ac179dbfe.jpeg','1240','426'])
  })
  it('structured data: an unheld ImageObject and every reference to it are dropped; nothing else is',()=>{
    const img='https://h2ocooling.com/wp-content/uploads/2099/01/none.jpg'
    const out=publicSchema({'@context':'https://schema.org','@graph':[{'@type':'WebPage','@id':'https://salmon-rhinoceros-754457.hostingersite.com/x/#webpage',primaryImageOfPage:{'@id':img},name:'X'},{'@type':'ImageObject','@id':img,url:img,width:'1600'}]})
    expect(out).toEqual({'@context':'https://schema.org','@graph':[{'@type':'WebPage','@id':'https://h2ocooling.com/x/#webpage',name:'X'}]})
  })
})

describe('sitewide guard: every rendered head names only this site and the allowlisted third parties',()=>{
  it('every public route (repository mode, every template)',async()=>{
    const allowed=new Set([...headOrigins().map(o=>new URL(o).host),...HEAD_THIRD_PARTY_HOSTS])
    const foreign=new Map<string,string[]>(),unserved:string[]=[],projectPhotos:string[]=[],salmonHost:string[]=[]
    const registry=projectMediaRegistry(),withheld=Object.values(registry.withheld??{}).flatMap(w=>w.withheldSha256)
    let pages=0
    for(const {slug} of generateStaticParams()){
      let html:string
      try{html=await render(slug)}catch{continue} // a route this mode does not serve
      pages++
      const head=headOf(html),p='/'+slug.join('/')+'/'
      for(const h of hostsIn(head))if(!allowed.has(h))foreign.set(h,[...(foreign.get(h)??[]),p].slice(0,3))
      // the project photo rule (Design Fixes A1) holds in the head too: no withheld photo anywhere; a project page names only its own
      // R2.5 (CT ruling on the SEO pre-flight): the old Salmon staging host appears nowhere in a served page, head or body
      if(html.includes('salmon-rhinoceros'))salmonHost.push(p)
      for(const sha of withheld)if(head.includes(sha))projectPhotos.push(`${p} names withheld ${sha.slice(0,12)}`)
      if(/^\/all-projects\/[^/]+\/$/.test(p))for(const m of head.matchAll(/\/media\/[a-z-]+\/([0-9a-f]{64})\./g))if(m[1]!==registry.projects[p]?.media.sha256&&m[1]!==path.basename(ogDefault().file,'.jpg'))projectPhotos.push(`${p} names ${m[1]!.slice(0,12)}`)
      // every media URL on this site's origin is a file this site serves (no legacy /wp-content path left unheld)
      for(const m of head.matchAll(/https:\/\/h2ocooling\.com(\/[^"'\s\\<>]+\.(?:jpe?g|png|gif|webp|avif|svg|ico|pdf))(?=["'\s\\<>]|$)/gi))if(!served('https://h2ocooling.com'+m[1]))unserved.push(`${p} ${m[1]}`)
    }
    expect(pages).toBeGreaterThan(500)
    expect(Object.fromEntries(foreign)).toEqual({})
    expect(unserved.slice(0,10)).toEqual([])
    expect(projectPhotos).toEqual([])
    expect(salmonHost).toEqual([])
  },900000)
})
