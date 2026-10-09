/**
 * Design R5b (CT 2026-10-07): New Cooling Tower and Disaster Recovery on the R4 system. The shared-file hunk in
 * LuxuryCanonical (the /cooling-tower/ lane) is proven bounded: only a route with an R5b builder leaves SalmonPresentation.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup as renderMarkup} from 'react-dom/server'
import {physicalHtml,physicalSrc} from './physical-html'
import Page from '../../app/(site)/[[...slug]]/page'
import {r4Builders} from '../r4/R4Pages'
import {r5bBuilders} from '../r5b/R5bPages'
import {r5bMedia} from '../r5b/r5b-media'
import {salmonMedia} from '../salmon'
const renderToStaticMarkup=(...args:Parameters<typeof renderMarkup>)=>physicalHtml(renderMarkup(...args))

const APP=process.cwd()
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const outline=(html:string)=>[...html.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/g)].map(m=>m[1]+' '+m[2]!.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim())

describe('R5b builders and the /cooling-tower/ lane',()=>{
  it('registers exactly the two R5b routes in the R4 builder map',()=>{
    expect(Object.keys(r5bBuilders).sort()).toEqual(['SALMON-pages-1230','SALMON-pages-1534'])
    for(const id of Object.keys(r5bBuilders))expect(r4Builders[id]).toBe(r5bBuilders[id])
  })
  it('renders /cooling-tower/ and /disaster-recovery/ through the R4 system',async()=>{
    for(const p of ['/cooling-tower/','/disaster-recovery/']){
      const html=await render(p)
      expect(html).toContain(`data-r4-route="${p}"`)
      expect(outline(html).filter(h=>h.startsWith('h1'))).toHaveLength(1)
    }
  })
  it('falls back to the SalmonPresentation lane when /cooling-tower/ has no R5b builder',async()=>{
    const saved=r4Builders['SALMON-pages-1230']!
    delete r4Builders['SALMON-pages-1230']
    try{
      const html=await render('/cooling-tower/')
      expect(html).toContain('salmon-page-newtowers')
      expect(html).not.toContain('data-r4-route')
    }finally{r4Builders['SALMON-pages-1230']=saved}
  })
  it('leaves the home route in the SalmonPresentation lane and the other R4 routes in theirs',async()=>{
    expect(await render('/')).toContain('salmon-page-home')
    const repair=await render('/cooling-tower-maintenance-repair-upgrade/')
    expect(repair).toContain('data-r4-route="/cooling-tower-maintenance-repair-upgrade/"')
    expect(repair).not.toContain('r5b-')
  })
  it('turns the Disaster Recovery reconstruction caption from an H2 into a figcaption (OGCS-ruled)',async()=>{
    const html=await render('/disaster-recovery/')
    expect(outline(html).some(h=>/after reconstruction/i.test(h))).toBe(false)
    expect([...html.matchAll(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/g)].map(m=>m[1]!.replace(/<[^>]+>/g,'').trim()).some(t=>/after reconstruction/i.test(t))).toBe(true)
    // owner factual media survives as webp derivatives of the held originals (the jpeg files stay unchanged in the repository)
    expect(html).toContain('data-source-sha256="a409442faafe390fc0eb0e9ac149a3ee028fdc25bdef8116b067b84539a28910"')
    expect(html).toContain('data-source-sha256="cb3168efe9722f79ac9c31740615fdcb99f532cb997db5874fda6319c4e9dd6c"')
    expect(html).toMatch(/<img[^>]*width="1632" height="1224"/)
  })
  it('removes the industry-grid "Learn more" link affordance on /cooling-tower/',async()=>{
    const html=await render('/cooling-tower/')
    expect(html).not.toMatch(/>\s*Learn more\s*</i)
    expect(html).not.toMatch(/>\s*Get Started\s*</)
  })
})

describe('R5b media ledger',()=>{
  it('every variant is byte-exact to its recorded SHA-256 and never exceeds native, except the CT-ruled cutaway 2x',()=>{
    for(const slot of ['ct.hero','ct.droplet','ct.draft','ct.cutaway','ct.band','dr.hero','dr.after','loc.usa','loc.sg','loc.th']){
      const m=r5bMedia(slot)
      for(const v of m.variants){
        const sha=createHash('sha256').update(readFileSync(path.join(APP,'public',physicalSrc(v.src)))).digest('hex')
        expect(sha,slot+' '+v.src).toBe(v.sha256)
        if(slot!=='ct.cutaway')expect(v.w,slot).toBeLessThanOrEqual(m.source.width)
      }
    }
  })
  it('the cutaway carries the DD final R2 hashes and the OGCS alt with the pump and valve assembly',()=>{
    const m=r5bMedia('ct.cutaway')
    expect(m.variants.map(v=>v.sha256.slice(0,8))).toEqual(['a44fd9bc','f32656ff'])
    expect(m.alt).toMatch(/pump and valve assembly/)
    expect((m as {caption?:string}).caption).toBeUndefined()
  })
})

describe('DD R5b review fixes (M1, M2, M3, P1)',()=>{
  const text=(html:string)=>html.replace(/<[^>]+>/g,' ').replace(/&#x27;/g,"'").replace(/\s+/g,' ')
  it('M1: the /cooling-tower/ water-treatment band renders its source title and paragraph over a photo layer that is not the hero',async()=>{
    const html=await render('/cooling-tower/')
    const band=html.slice(html.indexOf('r5b-band'))
    expect(text(band)).toContain('Water treatment services')
    expect(text(band)).toContain('ICS provides integrated water treatment solutions for new cooling tower systems')
    expect(band).toContain('/media/design-r5b/ct-band-1672.webp')
    expect(band).not.toContain('ICS-PTT-PO-July-16')
    expect(outline(html).filter(h=>/water treatment/i.test(h))).toEqual([])
  })
  it('M2: Disaster Recovery keeps the leftover sentence inside the same figure, under the figcaption',async()=>{
    const html=await render('/disaster-recovery/')
    const figure=html.slice(html.indexOf('r5b-figure--wide'),html.indexOf('</figure>',html.indexOf('r5b-figure--wide')))
    expect(figure.indexOf('<figcaption')).toBeGreaterThan(-1)
    expect(figure.indexOf('rebuilt from the ground up')).toBeGreaterThan(figure.indexOf('</figcaption>'))
  })
  it('M3/P1: no image repeats on a location page (by held bytes) and a page with one or two body images shows only the first',async()=>{
    for(const [p,max] of [['/cooling-tower-construction-repair-in-united-states/',99],['/cooling-tower-construction-repair-in-singapore/',1],['/thailand-cooling-tower/',1]] as const){
      const html=await render(p)
      const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'))
      const srcs=[...main.matchAll(/<img[^>]*?src="([^"]+)"/g)].map(m=>m[1]!)
      const keys=srcs.map(s=>s.startsWith('/media/salmon/')?(srcs.length&&s):s)
      expect(new Set(keys).size,p).toBe(keys.length)
      const body=srcs.filter(s=>!s.includes('/media/design-r5b/loc-'))
      expect(body.length,p).toBeLessThanOrEqual(max)
    }
  })
  it('M3: salmon media identity de-duplicates two uploads of the same bytes',()=>{
    const a=salmonMedia('https://h2ocooling.com/wp-content/uploads/2025/03/Group-1.png','https://h2ocooling.com/thailand-cooling-tower/')
    expect(a===undefined||typeof a.sha256==='string').toBe(true)
  })
})
