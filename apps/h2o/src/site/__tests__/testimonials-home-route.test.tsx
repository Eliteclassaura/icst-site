/**
 * TESTIMONIALS-RESTORE-1.1 (owner-protected): the guard renders the ACTUAL '/' route through LuxuryCanonical, the component the
 * route uses, not the standalone ClientTestimonials. A render path that bypasses the owner's featured testimonials (as the
 * Salmon-parity early return did) fails here.
 */
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {LuxuryCanonical} from '../LuxuryCanonical'
import {salmonDocument,salmonRoutes} from '../salmon'
import {clientReviewAuthority,figmaFeaturedTestimonials} from '../ClientReview'

const home=()=>{
  const route=salmonRoutes().find(r=>salmonDocument(r).targetPath==='/')!
  const doc=salmonDocument(route)
  return {doc,html:renderToStaticMarkup(<LuxuryCanonical doc={doc}/>)}
}

describe('the served home keeps the owner-approved featured testimonials',()=>{
  const {doc,html}=home()
  const people=['Sarah Mitchell','Daniel White','Sophia Martinez']
  it('is the real home document',()=>{expect(doc.targetPath).toBe('/');expect(figmaFeaturedTestimonials.map(r=>r.person)).toEqual(people)})
  it('renders the featured block with its three figures and the owner authority id',()=>{
    expect(html).toContain('class="client-testimonials"')
    expect(html).toContain(`data-owner-override="${clientReviewAuthority.testimonialOverride.authorityId}"`)
    expect(html.match(/<figure class="client-testimonial-split/g)).toHaveLength(3)
  })
  it('shows each portrait as an image with the person as its alt text, the three Figma portraits',()=>{
    for(const person of people)expect(html,person).toMatch(new RegExp(`<img[^>]*alt="${person}"[^>]*>|<img[^>]*alt="${person}"`))
    const portraits=[...html.matchAll(/<img[^>]*src="([^"]*)"[^>]*alt="(Sarah Mitchell|Daniel White|Sophia Martinez)"/g)]
    expect(portraits.map(m=>m[2])).toEqual(people)
    for(const m of portraits)expect(m[1]).toMatch(/\.(png|webp|jpe?g)(\?|$)|\/_next\/image|\/media\//)
  })
  it('keeps the original order and position: after the project section, before the closing call to action',()=>{
    const block=html.indexOf('class="client-testimonials"')
    expect(block).toBeGreaterThan(html.indexOf('Global Project Excellence'))
    expect(block).toBeLessThan(html.indexOf('Start Your Industrial Cooling Project'))
    expect([...people].map(p=>html.indexOf(`<strong>${p}</strong>`))).toEqual([...people].map(p=>html.indexOf(`<strong>${p}</strong>`)).sort((a,b)=>a-b))
  })
  it('no longer renders the three source slides as plain paragraphs, and renders each person once as a caption',()=>{
    for(const person of people){
      expect(html.match(new RegExp(`<p[^>]*>${person}</p>`,'g'))??[],person).toHaveLength(0)
      expect(html.match(new RegExp(`<strong>${person}</strong>`,'g')),person).toHaveLength(1)
    }
  })
  it('renders the owner-approved heading, quote and caption of each person, inside the .figma-home scope that carries the original split look',()=>{
    const text=html.replace(/<[^>]+>/g,' ').replace(/&#x27;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ')
    for(const r of figmaFeaturedTestimonials){
      for(const line of r.quoteLines)expect(text,r.recordId).toContain(line.replace(/\s+/g,' '))
      expect(text,r.recordId).toContain(`${r.company} / ${r.title}`)
    }
    expect(html).toMatch(/<div class="figma-home"><section class="client-testimonials"/)
  })
  it('replaces only the three testimonial sections: the neighbouring sections are still there',()=>{
    for(const marker of ['data-salmon-node="body.11"','data-salmon-node="body.19"'])expect(html).toContain(marker)
    for(const gone of ['data-salmon-node="body.13"','data-salmon-node="body.15"','data-salmon-node="body.17"'])expect(html).not.toContain(gone)
  })
})
