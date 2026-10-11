/** B8 + B10 (staging audit 2026-10-10, DD targets 2026-10-11): Contact label and sticky bar, All Projects country chips at phone width. */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const css=(f:string)=>readFileSync(path.join(APP,'src/app/(site)',f),'utf8')
/** The `@media (width < 768px)` block that holds the portfolio hero rules (the same block as the chips). */
const phone=(source:string)=>source.split('\n@media ').find(b=>b.startsWith('(width < 768px)')&&b.includes('dr4-hero--portfolio'))??''

describe('B8 Contact',()=>{
  it('the offices label stays "02 Offices" (OGCS CP-21, CT ruling 2026-10-11: 02 is the section number, 01 Request a quote, 02 Offices) and the section lists three offices (USA, Japan, Thailand)',async()=>{
    const html=await render('/contact-us/')
    expect(html).toContain('02 Offices')
    expect(html).not.toContain('03 Offices')
    expect((/<ul class="dr3-contact-offices">([\s\S]*?)<\/ul>/.exec(html)?.[1]??'').match(/<li\b/g)?.length).toBe(3)
  })
  it('the sticky bar carries the visibility observer for the Request a Quote section; the section ids clear the bar when jumped to',async()=>{
    const html=await render('/contact-us/')
    expect(html).toContain('id="how-to-request"')
    const r3=css('design-r3.css')
    expect(r3).toMatch(/\.dr3-sticky\[data-hidden='true'\]\s*\{\s*display:\s*none;/)
    expect(r3).toMatch(/\.dr3-contact \.dr3-section\[id\]\s*\{\s*scroll-margin-block-start:\s*96px;/)
    expect(readFileSync(path.join(APP,'src/site/StickyBarVisibility.tsx'),'utf8')).toContain('IntersectionObserver')
    expect(readFileSync(path.join(APP,'src/site/DesignR3StickyBar.tsx'),'utf8')).toContain('targetId="how-to-request"')
  })
})

describe('B10 All Projects country chips',()=>{
  it('below 768 px the chips wrap in rows of 8 px gaps with 44 px targets; they no longer scroll or mask',()=>{
    const r4=phone(css('design-r4.css'))
    const ul=/\.dr4 \.dr4-country-chips ul \{([^}]*)\}/.exec(r4)?.[1]??''
    expect(ul).toMatch(/flex-wrap:\s*wrap/)
    expect(ul).toMatch(/row-gap:\s*8px/)
    expect(ul).not.toMatch(/nowrap|overflow-x|mask-image/)
    expect(r4).toMatch(/\.dr4 \.dr4-country-chips li \{\s*flex:\s*0 0 auto;/)
    expect(css('design-r4.css')).toMatch(/\.dr4 \.dr4-country-chips a \{[^}]*min-block-size:\s*44px/)
  })
  it('the All Projects page renders the country chips (more than four, wrapped as a list)',async()=>{
    const html=await render('/all-projects/')
    const nav=/<nav[^>]*dr4-country-chips[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1]??''
    expect(nav.match(/<li\b/g)?.length).toBeGreaterThan(4)
    for(const country of ['United States','Thailand','Malaysia','Singapore'])expect(nav,country).toContain(country)
  })
})
