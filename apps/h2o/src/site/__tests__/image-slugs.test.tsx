/**
 * IMG-SEO-1 phase B (CT 2026-10-08): descriptive public image URLs. The manifest is sound; the proxy rewrites a descriptive URL to the
 * physical file and sends the old hash URL one 301; a legacy WordPress URL answers ONE 301 straight to the descriptive URL; and the
 * rendered pages (img src, srcset, og:image, structured data, inline backgrounds) name the descriptive URL, never a hash URL that has one.
 */
import {afterEach,describe,expect,it,vi} from 'vitest'
import {existsSync,readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {descriptiveImagePath,imageUrlPath,physicalImagePath} from '../../content/image-slugs'

const APP=process.cwd()
const manifest=JSON.parse(readFileSync(path.join(APP,'content/release/image-slugs.json'),'utf8')) as {entries:Record<string,string>}
const entries=Object.entries(manifest.entries)
const OGCS_PROPOSED=new Set(readFileSync(path.join(APP,'ops/img-seo/slug-overrides.tsv'),'utf8').split('\n').slice(1).filter(l=>l.trim()).map(l=>l.split('\t')[1]!))
const PROTECTED_DIRS=['figma-testimonials','client-review','private-staging']
const env0={...process.env}
afterEach(()=>{process.env={...env0};vi.resetModules()})

describe('the manifest',()=>{
  it('covers every public raster image except the owner-protected testimonial media and private staging',()=>{
    expect(entries.length).toBeGreaterThan(3000)
    for(const [file,url] of entries){
      expect(existsSync(path.join(APP,'public',file)),file).toBe(true)
      expect(url,file).toMatch(/^\/media\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}\.(?:png|jpe?g|webp|gif)$/)
      if(!OGCS_PROPOSED.has(url))expect(url.length-'/media/'.length-`-00000000${path.extname(url)}`.length,file).toBeLessThanOrEqual(60) // OGCS's own exact proposals may be a character or two longer
      expect(PROTECTED_DIRS.some(d=>file.startsWith(`/media/${d}/`)),file).toBe(false)
      expect(path.extname(file).toLowerCase(),file).toBe(path.extname(url).toLowerCase())
    }
  })
  it('one descriptive URL per image: the hash8 is the file\'s sha256 prefix, and two different files never share a URL',()=>{
    const bySha=new Map<string,string>()
    for(const [file,url] of entries){
      const sha=/^([0-9a-f]{64})\./.exec(path.basename(file))?.[1]??createHash('sha256').update(readFileSync(path.join(APP,'public',file))).digest('hex')
      expect(url.slice(-8-path.extname(url).length,-path.extname(url).length),file).toBe(sha.slice(0,8))
      const prev=bySha.get(url)
      if(prev)expect(readFileSync(path.join(APP,'public',prev)).equals(readFileSync(path.join(APP,'public',file))),`${url}`).toBe(true)
      bySha.set(url,file)
    }
  })
  it('OGCS spot-check (CT 2026-10-09): no slug carries HVAC or commercial wording, a guarantee or OEM / factory-authorized claim, a leaked alt-text word or the h2ocooling host; the 86 OGCS rows are applied exactly',()=>{
    const forbidden=/hvac|commercial|guarantee|factory-authorized|alt-text|h2ocooling|(?:^|-)oem(?:-|$)/
    for(const [file,url] of entries)expect(url.slice('/media/'.length,url.lastIndexOf('-')),file).not.toMatch(forbidden)
    const urls=new Set(entries.map(([,u])=>u))
    const rows=readFileSync(path.join(APP,'ops/img-seo/slug-overrides.tsv'),'utf8').split('\n').slice(1).filter(l=>l.trim()).map(l=>l.split('\t'))
    expect(rows).toHaveLength(86)
    for(const [current,proposed] of rows){
      expect(urls.has(proposed!),`${proposed} is served`).toBe(true)
      expect(urls.has(current!),`${current} is replaced`).toBe(false)
      expect(proposed!.slice(-12),current).toBe(current!.slice(-12)) // hash8 + extension unchanged
    }
  })
  it('PROJECT-IMAGES-1: every project gallery photo is served by its descriptive URL and has a slug in the manifest',async()=>{
    const {projectMediaRegistry}=await import('../project-media')
    const raw=JSON.parse(readFileSync(path.join(APP,'content/projects/project-media.json'),'utf8')) as {projectGalleries?:Record<string,{photos:Array<{src:string}>}>}
    const served=projectMediaRegistry().projectGalleries??{}
    let n=0
    for(const [page,g] of Object.entries(raw.projectGalleries??{}))g.photos.forEach((photo,i)=>{
      n++
      expect(descriptiveImagePath(photo.src),`${page} photo ${i}: ${photo.src} has a slug`).toBeTruthy()
      expect(served[page]!.photos[i]!.src,page).toBe(descriptiveImagePath(photo.src))
    })
    expect(n).toBeGreaterThan(0)
  })
  it('the owner-protected testimonial images keep their URLs, wherever a byte-identical copy is held',()=>{
    const protectedShas=new Set<string>()
    for(const dir of ['figma-testimonials','client-review'])for(const name of readdirSync(path.join(APP,'public/media',dir)))if(/\.(?:png|jpe?g|webp|gif)$/i.test(name))protectedShas.add(createHash('sha256').update(readFileSync(path.join(APP,'public/media',dir,name))).digest('hex'))
    expect(protectedShas.size).toBeGreaterThanOrEqual(10)
    for(const [file] of entries){
      const sha=/^([0-9a-f]{64})\./.exec(path.basename(file))?.[1]
      if(sha)expect(protectedShas.has(sha),`${file} is a copy of a protected image`).toBe(false)
    }
  })
  it('the stylesheets name no image that has a descriptive URL by its hash URL (the build-time rewrite cannot drift)',()=>{
    const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])
    const stale:string[]=[]
    for(const file of walk(path.join(APP,'src/app')).filter(f=>f.endsWith('.css'))){
      for(const m of readFileSync(file,'utf8').matchAll(/\/media\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif)/g))if(descriptiveImagePath(m[0]))stale.push(`${path.relative(APP,file)}: ${m[0]}`)
    }
    expect(stale).toEqual([])
  })
  it('the lookups agree and pass unknown paths through',()=>{
    for(const [file,url] of entries.slice(0,500)){
      expect(descriptiveImagePath(file)).toBe(url)
      expect(imageUrlPath(file)).toBe(url)
      expect(imageUrlPath(`${file}?v=1`)).toBe(`${url}?v=1`)
      expect(existsSync(path.join(APP,'public',physicalImagePath(url)!)),url).toBe(true)
    }
    expect(imageUrlPath('/media/figma-testimonials/x.png')).toBe('/media/figma-testimonials/x.png')
    expect(physicalImagePath('/media/not-an-image-12345678.jpg')).toBeUndefined()
  })
})

describe('the proxy',()=>{
  const O='https://h2ocooling.com'
  const [file,url]=entries.find(([f])=>f.startsWith('/media/salmon/'))!
  const ask=async(p:string,payload:boolean)=>{
    vi.resetModules()
    if(payload)Object.assign(process.env,{H2O_CONTENT_SOURCE:'payload'});else delete process.env.H2O_CONTENT_SOURCE
    const {proxy}=await import('../../proxy');const {NextRequest}=await import('next/server')
    return proxy(new NextRequest(`${O}${p}`))
  }
  for(const payload of [false,true]){
    it(`rewrites the descriptive URL to the physical file, with no redirect (${payload?'Payload':'repository'} mode)`,async()=>{
      const res=await ask(url,payload)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-middleware-rewrite')).toBe(`${O}${file}`)
    })
    it(`sends the old hash URL one 301 to the descriptive URL (${payload?'Payload':'repository'} mode)`,async()=>{
      const res=await ask(file,payload)
      expect(res.status).toBe(301)
      expect(res.headers.get('location')).toBe(`${O}${url}`)
    })
  }
  it('leaves the protected testimonial media and unknown media paths alone',async()=>{
    for(const p of ['/media/figma-testimonials/4dd64efea521919a-sarah-mitchell.png','/media/client-review/d88ec30b8ddc425c-ICS-PTT-PO-July-16.jpeg','/media/nothing-here-00000000.jpg']){
      const res=await ask(p,false)
      expect(res.status,p).not.toBe(301)
      expect(res.headers.get('x-middleware-rewrite'),p).toBeNull()
    }
  })
})

describe('legacy WordPress URLs: one hop',()=>{
  const map=(JSON.parse(readFileSync(path.join(APP,'content/release/legacy-image-redirects.json'),'utf8')) as {entries:Record<string,string>}).entries
  it('every target is the final URL: a descriptive URL, or a file that has no descriptive URL (never a hash URL that would redirect again)',()=>{
    for(const [key,target] of Object.entries(map)){
      expect(descriptiveImagePath(target),`${key} -> ${target} would be a second hop`).toBeUndefined()
      expect(existsSync(path.join(APP,'public',physicalImagePath(target)??target)),`${key} -> ${target}`).toBe(true)
    }
  })
  it('the two images CT named go straight to descriptive URLs',()=>{
    expect(map['2024/06/ptt-cracker.jpg']).toMatch(/^\/media\/[a-z0-9-]+-f71c20c6\.jpg$/)
  })
})

describe('rendered pages name the descriptive URL',()=>{
  const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
  /** Every /media/ URL a page names (src, srcset, content, href, url(...)). */
  const urls=(html:string)=>[...html.matchAll(/\/media\/[A-Za-z0-9_.%/-]+?\.(?:png|jpe?g|webp|gif)/g)].map(m=>m[0])
  const PAGES=['/','/about-ics/','/contact-us/','/thailand-cooling-tower/','/resources/','/cooling-tower-parts-online/','/all-projects/','/tech-articles/','/cooling-tower-noise-permit/','/nozzles/']
  for(const p of PAGES)it(`${p}: no image URL that has a descriptive one is named by its hash URL`,async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const leaks=[...new Set(urls(await render(p)))].filter(u=>descriptiveImagePath(u))
    expect(leaks,p).toEqual([])
  },300000)
})
