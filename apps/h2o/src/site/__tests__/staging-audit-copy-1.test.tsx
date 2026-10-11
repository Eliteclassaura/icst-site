/** STAGING-AUDIT copy fixes (OGCS CP-01..CP-05): the repair pages' H1/title, grammar and no speed promise. */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'

const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const h=(html:string,id:string)=>(new RegExp(`<h2 id="${id}">([\\s\\S]*?)</h2>`).exec(html)?.[1]??'').replace(/<[^>]+>/g,'')

describe('repair pages copy (CP-01..CP-05)',()=>{
  it('CP-01: the Wet/Hybrid/Dry page has the complete H1 and title',async()=>{
    const html=await render('/wet-hybrid-dry-cooling-tower-repair/')
    expect(/<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1]).toBe('Wet, Hybrid, and Dry Cooling Tower Repair and Maintenance')
    expect(html).toContain('Wet, Hybrid, and Dry Cooling Tower Repair and Maintenance | ICS')
    expect(html).not.toContain('Wet, Hybrid, and Dry Cooling Tower | ICS')
  })
  it('CP-02/CP-03: the emergency page says "Request an urgent repair assessment" and makes no speed promise ("scoped quickly")',async()=>{
    const html=await render('/emergency-cooling-tower-repair/')
    expect(h(html,'english-request-title')).toBe('Request an urgent repair assessment')
    expect(html).not.toContain('Request a urgent')
    expect(html).toContain('so the repair can be scoped.')
    expect(html).not.toMatch(/scoped quickly/i)
  })
  it('CP-04/CP-05: crossflow and counterflow use the singular "tower" in the request and FAQ headings',async()=>{
    for(const [p,w] of [['/crossflow-cooling-tower-repair-maintenance/','crossflow'],['/counterflow-cooling-tower-repair-maintenance/','counterflow']] as const){
      const html=await render(p)
      expect(h(html,'english-request-title'),p).toBe(`Request a ${w} tower assessment`)
      expect(h(html,'english-faq-title'),p).toBe(`${w[0]!.toUpperCase()}${w.slice(1)} tower FAQ`)
      expect(html,p).not.toMatch(/towers assessment|towers FAQ/)
    }
  })
  it('the other service pages keep their generated headings',async()=>{
    expect(h(await render('/low-drift-cooling-tower-solutions/'),'english-request-title')).toBe('Request a water-loss control assessment')
  })
})
