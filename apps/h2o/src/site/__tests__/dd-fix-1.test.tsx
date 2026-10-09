/**
 * DD-FIX-1 (DD production review 2026-10-09, FIX-AFTER-GO): F1 the Resources and location pages' header and footer keep the site's
 * full-width container; F2 the 390 language sheet clears the notice links; F3 the 404 route names its own tab title.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page,{generateMetadata} from '../../app/(site)/[[...slug]]/page'

const env0={...process.env}
afterEach(()=>{process.env={...env0}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const css=(file:string)=>readFileSync(path.join(process.cwd(),'src/app/(site)',file),'utf8')

describe('F1: the R4 content container wraps the page content only',()=>{
  for(const p of ['/resources/','/thailand-cooling-tower/','/cooling-tower-construction-repair-in-united-states/'])it(`${p}: the header and footer are outside the .dr4 container`,async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const html=await render(p)
    const wrapper=/<div class="luxury-site[^"]*"/.exec(html)![0]
    expect(wrapper,'the page wrapper is not the container').not.toMatch(/\bdr4\b/)
    const dr4=html.search(/<div class="dr4[ "]/)
    expect(dr4,'a .dr4 container exists').toBeGreaterThan(0)
    const header=html.indexOf('<header class="lux-header"'),footer=html.indexOf('<footer')
    expect(header).toBeGreaterThan(0);expect(header,'header precedes the container').toBeLessThan(dr4)
    // the container closes with the page content, before the footer
    const main=html.indexOf('<main',dr4),mainEnd=html.indexOf('</main>',main)
    expect(html.slice(mainEnd,mainEnd+13)).toBe('</main></div>')
    expect(footer).toBeGreaterThan(mainEnd)
  },300000)
  it('the Resources container keeps its own class for the discovery styling',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    expect(await render('/resources/')).toContain('<div class="dr4 dr4-resources"><main id="main" class="wave4-library dr4-library-main">')
  },300000)
})

describe('F2: the language sheet clears the notice links',()=>{
  it('the disclosure paragraph leaves room below for the 44px links that overhang it',()=>{
    const sheet=css('design-lang.css')
    expect(sheet).toMatch(/\.global-chrome \.lang-disclosure \{\s*margin-block-end: 20px;\s*\}/)
  })
})

describe('F3: the 404 route names its own tab title in its page metadata',()=>{
  it('an unknown path gets "Page Not Found - ICS" (not the layout default) and stays out of the index',async()=>{
    const meta=await generateMetadata({params:Promise.resolve({slug:['this-page-does-not-exist-xyz']}),searchParams:Promise.resolve({})})
    expect(meta.title).toEqual({absolute:'Page Not Found - ICS'})
    expect(meta.robots).toEqual({index:false,follow:false})
  },120000)
  it('a real page keeps its own title',async()=>{
    const meta=await generateMetadata({params:Promise.resolve({slug:['cooling-tower-noise-permit']}),searchParams:Promise.resolve({})})
    expect(JSON.stringify(meta.title)).not.toContain('Page Not Found')
  },120000)
})
