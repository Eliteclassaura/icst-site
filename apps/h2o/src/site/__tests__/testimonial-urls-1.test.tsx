/**
 * IMG-SEO-1.2 (CT 2026-10-09; Commander's 1.2b read-back): the owner-protected testimonial portraits keep their URLs: no rename, no
 * redirect, no rewrite. The list is derived from the testimonial content (the rendered testimonial component, the owner authority's portrait
 * records and the stylesheets' backgrounds for the home source sections the authority replaces), never typed.
 */
import {afterEach,describe,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readdirSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {ClientTestimonials} from '../ClientReview'
import {descriptiveImagePath} from '../../content/image-slugs'
import {testimonialBackgroundUrls} from '../../../ops/img-seo/testimonial-portraits'

const APP=process.cwd()
const env0={...process.env}
afterEach(()=>{process.env={...env0};vi.resetModules()})
const manifest=(JSON.parse(readFileSync(path.join(APP,'content/release/image-slugs.json'),'utf8')) as {entries:Record<string,string>}).entries
const RASTER=/\.(?:png|jpe?g|webp|gif)$/i
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex')

/** Every protected testimonial portrait URL the site references. */
const portraitUrls=():Map<string,string[]>=>{ // url -> where it comes from (one URL can come from several places)
  const urls=new Map<string,string[]>()
  const add=(u:string,why:string)=>urls.set(u,[...(urls.get(u)??[]),why])
  const rendered=renderToStaticMarkup(<ClientTestimonials/>)
  for(const m of rendered.matchAll(/<img[^>]*?\bsrc="(\/media\/[^"]+)"/g))if(RASTER.test(m[1]!))add(m[1]!,'rendered testimonial')
  const authority=JSON.parse(readFileSync(path.join(APP,'content/luxury/client-review.json'),'utf8')) as {portraits:Array<{src:string}>}
  for(const p of authority.portraits)add(p.src,'owner portrait record')
  for(const dir of ['figma-testimonials','client-review'])for(const name of readdirSync(path.join(APP,'public/media',dir)))if(RASTER.test(name))add(`/media/${dir}/${name}`,`${dir} file`)
  for(const u of testimonialBackgroundUrls(APP))add(u,'testimonial source-section background')
  return urls
}

describe('IMG-SEO-1.2: the testimonial portraits keep their URLs',()=>{
  it('the list is derived from content and includes the three home portrait backgrounds and the three rendered portraits',()=>{
    const urls=portraitUrls()
    const backgrounds=[...urls].filter(([,why])=>why.includes('testimonial source-section background')).map(([u])=>u)
    expect(backgrounds).toHaveLength(6) // the three portraits: the original in salmon-parity.css and its delivery derivative in the overrides
    expect(backgrounds.filter(u=>u.startsWith('/media/derivatives/'))).toHaveLength(3)
    expect(backgrounds).toContain('/media/derivatives/b9b47cb78b7944949bca5905e0c6cab4a28f18240208757b19914da512547250.webp')
    expect([...urls].filter(([,why])=>why.includes('rendered testimonial')).length).toBeGreaterThanOrEqual(3)
    for(const [u] of urls)expect(u,u).toMatch(/^\/media\//)
  })
  it('no portrait URL is renamed, redirected or rewritten by the proxy (both content modes)',async()=>{
    const urls=[...portraitUrls().keys()]
    for(const payload of [false,true]){
      vi.resetModules()
      if(payload)process.env.H2O_CONTENT_SOURCE='payload';else delete process.env.H2O_CONTENT_SOURCE
      const {proxy}=await import('../../proxy');const {NextRequest}=await import('next/server')
      for(const u of urls){
        const res=proxy(new NextRequest(`https://h2ocooling.com${u}`))
        expect(res.headers.get('location'),`${u} must not redirect`).toBeNull()
        expect(res.headers.get('x-middleware-rewrite'),`${u} must not be rewritten`).toBeNull()
        expect(res.status,u).not.toBe(301)
      }
    }
  })
  it('none of them (nor any byte-identical copy, nor a derivative of one) has a descriptive URL in the manifest',()=>{
    const urls=[...portraitUrls().keys()]
    const protectedShas=new Set<string>()
    for(const u of urls){
      const file=path.join(APP,'public',u)
      expect(descriptiveImagePath(u),`${u} has no descriptive URL`).toBeUndefined()
      protectedShas.add(sha(file))
    }
    const derivatives=(JSON.parse(readFileSync(path.join(APP,'content/media-derivatives.json'),'utf8')) as {items:Array<{src:string;derivative:string;origSha256:string}>}).items
    for(const d of derivatives){
      const protectedSource=protectedShas.has(d.origSha256)||urls.includes(d.derivative)
      if(!protectedSource)continue
      expect(descriptiveImagePath(d.derivative),`derivative ${d.derivative}`).toBeUndefined()
      expect(descriptiveImagePath(d.src),`original ${d.src}`).toBeUndefined()
    }
    for(const file of Object.keys(manifest)){
      expect(urls.includes(file),file).toBe(false)
      const full=path.join(APP,'public',file)
      expect(protectedShas.has(sha(full)),`${file} is byte-identical to a protected portrait`).toBe(false)
    }
  },180000)
  it('the stylesheets name the background portraits by their physical hash URLs (none has a descriptive URL)',()=>{
    for(const u of testimonialBackgroundUrls(APP))expect(u).toMatch(/^\/media\/(?:derivatives|salmon)\/[0-9a-f]{64}\.(?:webp|png|jpe?g)$/)
  })
})
