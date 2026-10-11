/**
 * PLACEHOLDER-CARDS-1 layout proof (CT: no gaps, other cards intact): the home's HTML with the transform equals the HOME HTML WITHOUT it minus exactly the
 * two placeholder cards' elements (the Motor tab's ABB and TECO loop items). Nothing else moves, so no card shifts and no empty cell remains.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import type * as PlaceholderCards from '../../content/placeholder-cards'

let identity=false
vi.mock('../../content/placeholder-cards',async()=>{
  const real=await vi.importActual<typeof PlaceholderCards>('../../content/placeholder-cards')
  return {...real,withoutPlaceholderCards:<T,>(doc:T):T=>identity?doc:real.withoutPlaceholderCards(doc as never) as T}
})
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
/** The balanced element that starts at `start` (an opening <div ...>). */
function element(html:string,start:number):string{
  let depth=0
  const re=/<(\/?)div\b[^>]*>/g
  re.lastIndex=start
  for(let m=re.exec(html);m;m=re.exec(html)){
    depth+=m[1]?-1:1
    if(depth===0)return html.slice(start,re.lastIndex)
  }
  throw new Error('unbalanced')
}

describe('PLACEHOLDER-CARDS-1: the home layout',()=>{
  it('equals the untransformed home minus the two card elements: no gap, no shifted card',async()=>{
    identity=true
    const before=await render('/')
    identity=false
    const after=await render('/')
    const cards=[...before.matchAll(/<div class="[^"]*\be-loop-item-(4756|4758)\b[^"]*"/g)].map(m=>element(before,m.index!))
    expect(cards,'the two placeholder cards are in the untransformed home').toHaveLength(2)
    expect(cards.join('')).toMatch(/Motor Example/)
    let expected=before
    for(const c of cards)expected=expected.replace(c,'')
    expect(after.length).toBe(before.length-cards.reduce((n,c)=>n+c.length,0))
    expect(after).toBe(expected)
    expect(after).not.toMatch(/Motor Example/)
  },300000)
})
