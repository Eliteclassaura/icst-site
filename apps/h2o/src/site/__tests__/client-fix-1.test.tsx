/**
 * CLIENT-FIX-1 (client feedback, CT 2026-10-08, pre-GO): A) the home "Explore Our Services" button opens the services overview, not
 * /contact-us/; B) the OGCS site-wide copy corrections never reappear on any public page.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonNavigation} from '../navigation-data'
import {HOME_SERVICES_HUB} from '../SalmonPresentation'
import {FAN_MENU_LINKS,MOORE_FANS_HREF,MOORE_FANS_LINKS} from '../moore-fans'

const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(slug:string[])=>renderToStaticMarkup(await Page({params:Promise.resolve({slug}),searchParams:Promise.resolve({})}))

describe('CLIENT-FIX-1 A: home Explore Our Services',()=>{
  it('opens the services overview (the header Services hub), not /contact-us/',async()=>{
    const html=await render([])
    const links=html.split('<a ').slice(1).map(a=>a.split('</a>')[0]!).filter(a=>a.includes('Explore Our Services')).map(a=>/(?:^|\s)href="([^"]*)"/.exec(a)![1])
    expect(links.length).toBeGreaterThan(0)
    for(const href of links)expect(href).toBe(HOME_SERVICES_HUB)
    expect(HOME_SERVICES_HUB).toBe(salmonNavigation.find(g=>g.label==='Services')!.href)
    expect(await render(HOME_SERVICES_HUB.split('/').filter(Boolean))).toContain('<h1')
  })
  it('the other home contact buttons still go to /contact-us/',async()=>{
    const html=await render([])
    const contact=html.split('<a ').slice(1).map(a=>a.split('</a>')[0]!).find(a=>a.includes('Contact Us Today'))!
    expect(/(?:^|\s)href="([^"]*)"/.exec(contact)![1]).toBe('/contact-us/')
  })
})

describe('CLIENT-FIX-1 C: Moore Fans',()=>{
  const hrefs=(html:string)=>new Set([...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]!))
  it('the header Parts menu lists Moore Fans and its three Class 10000 pages right after Fans',()=>{
    const parts=salmonNavigation.find(g=>g.label==='Parts')!
    const hrefsInMenu=parts.items.map(i=>i[1])
    const at=hrefsInMenu.indexOf('/fans/')
    expect(hrefsInMenu.slice(at,at+1+FAN_MENU_LINKS.length)).toEqual(['/fans/',...FAN_MENU_LINKS.map(l=>l[1])]) // brands and families (CATALOG-FANS-1), then Moore Fans and its pages
    for(const [,href] of MOORE_FANS_LINKS)expect(hrefsInMenu,href).toContain(href)
  })
  it('every page renders the Moore links in both the desktop and the mobile menu',async()=>{
    const html=await render(['fans'])
    for(const [,href] of MOORE_FANS_LINKS)expect(html.split(`href="${href}"`).length-1,href).toBeGreaterThanOrEqual(2)
  })
  it('Moore Fans is reachable from both fan listings (/fans/ and /product-category/fans/)',async()=>{
    for(const slug of [['fans'],['product-category','fans']]){
      const html=await render(slug)
      expect(html,slug.join('/')).toContain('data-moore-fans-card')
      for(const [,href] of MOORE_FANS_LINKS)expect(hrefs(html).has(href),`${slug.join('/')} -> ${href}`).toBe(true)
    }
    expect((await render(['fans','moore-fans']))).toContain('<h1')
    for(const [,href] of MOORE_FANS_LINKS)expect(await render(href.split('/').filter(Boolean)),href).toContain('<h1')
    expect(MOORE_FANS_HREF).toBe('/fans/moore-fans/')
  })
  it('other listings do not carry the card',async()=>{
    expect(await render(['motors'])).not.toContain('data-moore-fans-card')
  })
})
