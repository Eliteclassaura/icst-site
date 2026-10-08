/**
 * IMG-FIX-1 (Design Director ruling 2026-10-08): five stock/AI-style article images are not shown, with their figure wrappers;
 * the efficiency-formula slide stays (it was a false positive) and its alt states the formula in words.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import Page from '../../app/(site)/[[...slug]]/page'
import {LuxuryFooter} from '../LuxuryShell'
import {ARTICLE_IMAGE_ALT,DROPPED_ARTICLE_IMAGES} from '../article-images'

const env={...process.env}
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const mainOf=(h:string)=>h.slice(h.indexOf('<main'),h.indexOf('</main>'))
const KEEP='27aee0e42b506aeb4ccc48342261e81306813d3f3975f43194a393a7e4ee0227'
const PAGES:Array<[string,string]>=[
  ['/cooling-tower-efficiency-calculation/','9f051ec8fef008a2144ce903d7404cd747e762a661aa8b7cbff08c0fbed29175'],
  ['/cooling-tower-ton-calculation/','2babb003161430c95d9a5e4bbc2ab7cd776a6e694a604d9464049166a52ad9cb'],
  ['/cooling-tower-replacement-cost/','97b7063dc9d1c8eab0f1140badad9bd47d4fc0ad3959d48f450bfa3d53068544'],
  ['/cooling-tower-buying-guide/','2d5391cd8ac86e22a1b8a4cf0aeee3cb8ddabebe87371b7ca4a37875ad4c7dee'],
  ['/cooling-tower-makeup-water-calculation/','41b0b8ff0f7487778ff10439a01111d2304495b7e22fcf30700c156864522c42'],
]

describe('IMG-FIX-1',()=>{
  it('lists exactly the five dropped hashes, one per page, and keeps the formula slide out of the list',()=>{
    expect([...DROPPED_ARTICLE_IMAGES.keys()].sort()).toEqual(PAGES.map(p=>p[1]).sort())
    expect(DROPPED_ARTICLE_IMAGES.has(KEEP)).toBe(false)
    expect(ARTICLE_IMAGE_ALT.get(KEEP)).toMatch(/divided by the sum of the range and the approach, multiplied by 100/)
  })
  for(const [target,sha] of PAGES){
    it(`${target}: the image and its figure are gone; no empty shell, one H1, headings and alts intact`,async()=>{
      process.env.H2O_PUBLIC_EXPORT='1'
      const main=mainOf(await render(target))
      expect(main).not.toContain(sha.slice(0,16))
      expect(main).not.toMatch(/<figure[^>]*>\s*<\/figure>/)
      expect((main.match(/<h1\b/g)??[]).length).toBe(1)
      expect((main.match(/<h2\b/g)??[]).length).toBeGreaterThan(0)
      for(const img of main.matchAll(/<img\b[^>]*>/g))expect(img[0],target).toMatch(/\balt="/)
    },240000)
  }
  it('row 49 (strategies slide) stays on the makeup-water page for the post-launch backlog',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    expect(mainOf(await render('/cooling-tower-makeup-water-calculation/'))).toContain('94acf916fc972e1a')
  },240000)
  it('the efficiency page keeps its formula slide, with the formula in the alt',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const main=mainOf(await render('/cooling-tower-efficiency-calculation/'))
    expect(main).toContain(KEEP.slice(0,16))
    expect(main).toContain('alt="Cooling tower efficiency in percent equals the range divided by the sum of the range and the approach, multiplied by 100."')
  },240000)
  it('footer notes N1 and N2 (Design Director): the Locations row is a labelled nav and its links are at least 44 px high',()=>{
    const footer=renderToStaticMarkup(<LuxuryFooter/>)
    expect(footer).toContain('<nav class="sp-footer-locations" aria-label="Locations">')
    const css=readFileSync(path.join(process.cwd(),'src/app/(site)/design-r5.css'),'utf8')
    expect(css).toMatch(/\.global-chrome \.sp-footer-locations a \{[^}]*display: inline-flex;[^}]*min-block-size: 44px;/)
  })
})
