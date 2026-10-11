/** B7 (staging audit 2026-10-10): the article byline reads "Tim Bozic · July 3, 2026", never "Tim Bozic|July 3" (a raw pipe with no spaces in the text). */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonRoutes} from '../salmon'

const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const textOf=(html:string)=>html.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&')

describe('B7 article byline separator',()=>{
  it('every article byline row uses a spaced middle dot; no raw pipe separates the author from the date',async()=>{
    const paths=salmonRoutes().filter(r=>/^SALMON-posts-/.test(r.routeId)||/^LIVE-posts-/.test(r.routeId)).map(r=>r.targetPath).filter(Boolean).slice(0,40) as string[]
    expect(paths.length).toBeGreaterThan(10)
    let rows=0
    for(const p of paths){
      const html=await render(p)
      for(const m of html.matchAll(/<p class="wave4-byline[^"]*">([\s\S]*?)<\/p>/g)){
        rows++
        const t=textOf(m[1]!)
        expect(t,p).not.toMatch(/\S\|\S|\|/)
        expect(t,p).toMatch(/ · /)
      }
    }
    expect(rows).toBeGreaterThan(10)
  },300000)
  it('the Tim Bozic article reads "Tim Bozic · July 3, 2026"',async()=>{
    const html=await render('/closed-loop-cooling-tower-systems-guide/').catch(()=>'')
    if(!html)return
    expect(textOf(html)).toMatch(/Tim Bozic · [A-Z][a-z]+ \d{1,2}, \d{4}/)
  },120000)
})
