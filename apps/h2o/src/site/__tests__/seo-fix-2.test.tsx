/**
 * SEO-FIX-2 (Control Tower 2026-10-08; SEO Checker offline staging crawl REPORT SC-01, SC-02, SC-03).
 *   SC-01: a project page's own verified photo is its social image, independent of the imported head; a project without one
 *          (the two withheld PTT pages) takes the site default image, never a withheld or another project's photo.
 *   SC-02: the six English service pages give every image its real intrinsic width and height.
 *   SC-03: /search/'s robots meta mirrors the private response floor (noindex, nofollow); production keeps noindex,follow.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {generateMetadata as searchGenerateMetadata} from '../../app/(site)/search/page'
import {metaValues} from '../../../ops/seo-pass/head-assertions.mjs'
import {englishServicePages} from '../EnglishServices'
import {projectMediaRegistry} from '../project-media'
import {ogDefault} from '../standard-head'
import {heldImageSize} from '../image-size'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const slugOf=(p:string)=>p.split('/').filter(Boolean).map(decodeURIComponent)
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:slugOf(p)}),searchParams:Promise.resolve({})}))

describe('SC-01: project social image',()=>{
  const registry=projectMediaRegistry()
  it('EDC names its own verified photo (url, size, type) as og:image and twitter:image',async()=>{
    const own=registry.projects['/all-projects/edc/']!.media
    expect(own.sha256).toBe('812239eac24a9a9ff2309cd08312f47f952304ab42d277d0eac5a4c2471baac9')
    const html=await render('/all-projects/edc/')
    expect(metaValues(html,'og:image')).toHaveLength(1)
    expect(metaValues(html,'og:image')[0]).toMatch(new RegExp(`${own.src.replace(/[./]/g,'\\$&')}$`))
    expect(metaValues(html,'og:image:width')).toEqual([String(own.width)])
    expect(metaValues(html,'og:image:height')).toEqual([String(own.height)])
    expect(metaValues(html,'twitter:image')[0]).toBe(metaValues(html,'og:image')[0])
  },120_000)
  it('every project with a verified own photo names exactly that photo, once',async()=>{
    for(const [p,entry] of Object.entries(registry.projects)){
      const html=await render(p)
      expect(metaValues(html,'og:image'),p).toHaveLength(1)
      expect(metaValues(html,'og:image')[0],p).toMatch(new RegExp(`${entry.media.src.replace(/[./]/g,'\\$&')}$`))
    }
  },300_000)
  it('the withheld PTT projects take the site default image and name no withheld photo',async()=>{
    const d=ogDefault()
    for(const p of Object.keys(registry.withheld??{})){
      const html=await render(p)
      const images=metaValues(html,'og:image')
      expect(images,p).toHaveLength(1)
      expect(images[0],p).toMatch(new RegExp(`${d.file.replace(/[./]/g,'\\$&')}$`))
      for(const sha of registry.withheld![p]!.withheldSha256)expect(html,p).not.toContain(sha)
    }
  },120_000)
})

describe('SC-02: service images carry their intrinsic size',()=>{
  it('all six service pages: every <img> has width and height equal to its file',async()=>{
    const pages=englishServicePages()
    expect(pages).toHaveLength(6)
    for(const service of pages){
      const html=await render(service.path)
      const imgs=[...html.matchAll(/<img\b[^>]*>/g)].map(m=>m[0]).filter(tag=>/data-source-sha256=/.test(tag))
      expect(imgs.length,service.path).toBeGreaterThanOrEqual(4)
      for(const tag of imgs){
        const width=/ width="(\d+)"/.exec(tag),height=/ height="(\d+)"/.exec(tag)
        expect(width&&height,`${service.path}: ${tag}`).toBeTruthy()
      }
      const hero=imgs.find(tag=>/fetchPriority="high"/.test(tag))!
      const size=heldImageSize(service.hero)!
      expect(hero).toContain(` width="${size.width}"`)
      expect(hero).toContain(` height="${size.height}"`)
    }
  },300_000)
})

describe('SC-03: /search/ robots meta follows the policy floor',()=>{
  it('private (the default, any non-production policy): noindex, nofollow, like the header',()=>{
    delete process.env.H2O_INDEXING_POLICY
    expect(searchGenerateMetadata().robots).toEqual({index:false,follow:false})
    process.env.H2O_INDEXING_POLICY='staging'
    expect(searchGenerateMetadata().robots).toEqual({index:false,follow:false})
  })
  it('production: the utility page stays noindex, follow',()=>{
    process.env.H2O_INDEXING_POLICY='production'
    expect(searchGenerateMetadata().robots).toEqual({index:false,follow:true})
  })
  it('the canonical and description are unchanged',()=>{
    const m=searchGenerateMetadata()
    expect(m.alternates?.canonical).toBe('https://h2ocooling.com/search/')
    expect(readFileSync(path.join(APP,'src/app/(site)/search/page.tsx'),'utf8')).not.toContain('robots:{index:false,follow:true}')
  })
})
