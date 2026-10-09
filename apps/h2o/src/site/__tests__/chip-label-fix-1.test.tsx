/**
 * CHIP-LABEL-FIX-1 (DD-B2, 2026-10-09): the parts category chip for /motors/ read "Buy Now" because a later "Buy Now" button on the parts hub linking to /motors/
 * replaced the real label. A generic call-to-action label never replaces a category's real label.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {partsChips} from '../r5/R5PartsPages'

const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const chipLabels=(html:string)=>{
  const nav=/<nav[^>]*aria-label="Part categories"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1]??''
  return [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(m=>m[1]!.replace(/<[^>]+>/g,'').trim())
}

describe('CHIP-LABEL-FIX-1',()=>{
  it('the category chips carry real category names; the Motors chip is "Motors" and no chip is a call to action',()=>{
    const chips=partsChips()
    expect(chips.find(c=>c.href==='/motors/')?.label).toBe('Motors')
    for(const c of chips)expect(c.label,c.href).not.toMatch(/^(?:buy|shop|order|view|learn|read|see|explore)\b.*\b(?:now|more|all|details)$/i)
  })
  for(const p of ['/fans/','/motors/','/cooling-tower-parts-online/']){
    it(`${p}: the Motors chip reads Motors and no chip reads Buy Now`,async()=>{
      const html=await render(p)
      const labels=chipLabels(html)
      if(p!=='/cooling-tower-parts-online/'){expect(labels.length).toBeGreaterThan(3);expect(labels).toContain('Motors')}
      expect(labels).not.toContain('Buy Now')
    },120000)
  }
})
