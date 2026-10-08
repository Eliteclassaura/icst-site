/**
 * OWNER-PROTECTED CONTENT (owner via CT 2026-10-08): the home testimonials are the owner's, approved as originally built. They must
 * never be deleted, reworded, reordered, re-photographed or replaced (no initials avatars, no stock swaps). This test pins the whole
 * set: count, people, companies, titles, quote text, order, portrait files (path and bytes) and how the home renders them. If it fails,
 * the change is NOT allowed to ship without the owner's written approval: do not edit the fixture or the expectations to make it pass.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {testimonials} from '../testimonials'
import {ClientTestimonials,clientReviewTestimonials,figmaFeaturedTestimonials,figmaTestimonialMedia} from '../ClientReview'

const PROTECTED='owner-protected content: the home testimonials are the owner\'s and must not be changed without the owner\'s written approval'
const fx=JSON.parse(readFileSync(path.join(__dirname,'fixtures/owner-protected-testimonials.json'),'utf8')) as {records:typeof testimonials;featuredOrder:string[];carouselOrder:string[];portraits:Record<string,{src:string;width:number;height:number;sha256:string;lines:string[]}>;delivered:Record<string,string>}
const env={...process.env}
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))

describe('owner-protected testimonials',()=>{
  it(`the set is exactly the owner's: count, people, companies, titles, quote text and order (${PROTECTED})`,()=>{
    expect(testimonials.length,PROTECTED).toBe(9)
    expect(JSON.parse(JSON.stringify(testimonials)),PROTECTED).toEqual(fx.records)
    expect(figmaFeaturedTestimonials.map(r=>r.recordId),PROTECTED).toEqual(fx.featuredOrder)
    expect(clientReviewTestimonials.map(r=>r.recordId),PROTECTED).toEqual(fx.carouselOrder)
    expect(fx.records.map(r=>r.person),PROTECTED).toEqual(['Sarah Mitchell','Daniel White','Sophia Martinez','Sarah Mitchell','Daniel White','Sophia Martinez','Laura Bennett','Andrew Lewis','Michael Chen'])
  })
  it(`the portraits are the owner's files, in place, byte for byte (${PROTECTED})`,()=>{
    expect(JSON.parse(JSON.stringify(figmaTestimonialMedia)),PROTECTED).toEqual(fx.portraits)
    for(const [person,media] of Object.entries(fx.portraits)){
      expect(createHash('sha256').update(readFileSync(path.join(process.cwd(),'public',media.src))).digest('hex'),`${person}: ${PROTECTED}`).toBe(media.sha256)
    }
  })
  it(`the featured block renders the three people in order, each with their portrait and no stand-in (${PROTECTED})`,()=>{
    const html=renderToStaticMarkup(<ClientTestimonials/>)
    const figures=[...html.matchAll(/<figure class="client-testimonial-split[^"]*"[^>]*data-testimonial-record="([^"]+)"/g)].map(m=>m[1])
    expect(figures,PROTECTED).toEqual(fx.featuredOrder)
    for(const [person,media] of Object.entries(fx.portraits)){
      // delivered as the same-size WebP derivative of the owner's photo (accepted delivery optimization: same pixels, pinned here)
      expect(html,`${person}: ${PROTECTED}`).toContain(`<img src="${fx.delivered[person]}" width="${media.width}" height="${media.height}" alt="${person}" loading="lazy"/>`)
      for(const line of media.lines)expect(html,PROTECTED).toContain(line)
    }
    const text=html.replace(/<[^>]+>/g,'').replace(/&#x27;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ')
    for(const record of fx.records.filter(r=>r.recordId.endsWith('-FEATURED')))for(const line of record.quoteLines)expect(text,PROTECTED).toContain(line.replace(/&amp;/g,'&').replace(/\s+/g,' '))
    expect(html,PROTECTED).not.toMatch(/client-testimonial-avatar|data-initials-for/)
    expect((html.match(/<img src=/g)??[]).length,PROTECTED).toBe(3)
  })
  it(`the home still carries the same three people, in the same order (${PROTECTED})`,async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const home=await render('/')
    const main=home.slice(home.indexOf('<main'),home.indexOf('</main>')).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
    const at=['Sarah Mitchell','Daniel White','Sophia Martinez'].map(n=>main.indexOf(n))
    expect(at.every(i=>i>=0),PROTECTED).toBe(true)
    expect(at[0]!<at[1]!&&at[1]!<at[2]!,PROTECTED).toBe(true)
    expect(home,PROTECTED).not.toMatch(/client-testimonial-avatar/)
  },240000)
})
