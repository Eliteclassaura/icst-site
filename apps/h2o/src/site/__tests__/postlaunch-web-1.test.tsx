/**
 * POSTLAUNCH-WEB-1 (CLIENT-FIX-2, OGCS rows CF2-03/21/22, seal 953abe72, applied after GO). CF2-03 is pinned by the claims conformance list
 * (claims-batch-r22); HOME-HERO-1 by home-hero-1.test. Here: CF2-21 the index titles carry no stray whitespace or no-break space, and
 * CF2-22 the slide thumbnails of the latest-posts widget have an empty alt (no leaked file name).
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {LEAKED_FILENAME_ALT,articleDisplayTitle,publicAlt} from '../wave4'

const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(slug:string[])=>renderToStaticMarkup(await Page({params:Promise.resolve({slug}),searchParams:Promise.resolve({})}))

describe('CF2-21: index titles',()=>{
  it('articleDisplayTitle trims whitespace and U+00A0 at both ends and still decodes the ampersand',()=>{
    expect(articleDisplayTitle('Cooling Tower Component Longevity &amp; the TCO Advantage\u00a0')).toBe('Cooling Tower Component Longevity & the TCO Advantage')
    expect(articleDisplayTitle(' \u00a0 A &#38; B \n')).toBe('A & B')
  })
  it('the technical-articles index prints no title with a no-break space or its mojibake',async()=>{
    const html=await render(['tech-articles'])
    expect(html).not.toMatch(/\u00a0\s*<\/a>/)
    expect(html).not.toContain('Â')
    expect(html).toContain('Cooling Tower Component Longevity &amp; the TCO Advantage<')
  },120000)
})

describe('CF2-22: latest-posts slide thumbnails',()=>{
  it('the leaked "Slide <file>" alt becomes empty; real alts are untouched',()=>{
    expect(publicAlt('Slide on-page-free-jpeg.jpg: Cooling Tower Free Cooling Mode text overlaid on an industrial cooling tower.')).toBe('')
    expect(publicAlt('Slide on-page-roi-jpeg.jpg: Financial ROI Analysis')).toBe('')
    expect(publicAlt('Crossflow cooling tower cells')).toBe('Crossflow cooling tower cells')
    expect(publicAlt(undefined)).toBeUndefined()
    expect(LEAKED_FILENAME_ALT.test('Slide deck of the project')).toBe(false)
  })
  it('a page that carries the widget renders no leaked alt',async()=>{
    for(const slug of ['closed-loop-vs-open-loop','cooling-tower-algae-prevention']){
      const html=await render([slug])
      expect(html,slug).not.toMatch(/alt="Slide [^"]*\.(?:jpe?g|png|webp)/i)
    }
  },120000)
})
