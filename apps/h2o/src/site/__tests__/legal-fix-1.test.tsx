/**
 * LEGAL-FIX-1 (legal/accessibility review L07; WCAG 1.1.1 Non-text Content, 2.4.4 Link Purpose): no rendered link without an
 * accessible name. The home's three image-box pictures (body.5.3.1.{1,3,5}.1.1.0.0) leave the tab order and the accessibility
 * tree beside their named heading links (one named link per card); content-free source anchors render their content only.
 * The full-site rendered sweep (1,175 pages, 0 unnamed links or buttons) is in the LEGAL-FIX-1 evidence.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonDocument,salmonRoutes,type SalmonNode} from '../salmon'
import {namelessLink,sourceName} from '../link-context'

const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})

describe('every source link carries a name or a treatment',()=>{
  it('no document has a link that would render with no accessible name and no treatment',()=>{
    const untreated:string[]=[]
    for(const route of salmonRoutes()){
      const doc=salmonDocument(route)
      const walk=(n:SalmonNode,key:string)=>{
        if(typeof n==='string')return
        if(n.tag==='a'&&!sourceName(n).replace(/\s+/g,' ').trim()&&!namelessLink(doc,key,n))untreated.push(`${route.targetPath} ${key}`)
        n.children.forEach((c,i)=>walk(c,`${key}.${i}`))
      }
      doc.children.forEach((c,i)=>walk(c,`body.${i}`))
    }
    expect(untreated).toEqual([])
  },120000)
})

describe('the home image boxes (A01)',()=>{
  it('each picture link is decorative beside its card heading link to the same page',async()=>{
    const html=await render('/')
    for(const [node,href,name] of [['body.5.3.1.1.1.1.0.0','/cooling-tower/','Cooling Towers'],['body.5.3.1.3.1.1.0.0','/cooling-tower-maintenance-repair-upgrade/',''],['body.5.3.1.5.1.1.0.0','/cooling-tower-parts-online/','']] as const){
      const picture=html.match(new RegExp(`<a data-salmon-node="${node.replaceAll('.','\\.')}"[^>]*>`))?.[0]
      expect(picture,node).toBeTruthy()
      expect(picture,node).toContain(`href="${href}"`)
      expect(picture,node).toContain('aria-hidden="true"')
      expect(picture,node).toContain('tabindex="-1"')
      // the card's named link to the same page stays in the tab order
      const twins=[...html.matchAll(new RegExp(`<a data-salmon-node="${node.split('.').slice(0,5).join('\\.')}\\.[^"]*" href="${href}"[^>]*>([^<]+)</a>`,'g'))].map(m=>m[1]!.trim())
      expect(twins.length,node).toBeGreaterThan(0)
      if(name)expect(twins,node).toContain(name)
    }
  })
})

describe('content-free source anchors',()=>{
  it('render their content without a link (author line breaks; a product panel line break)',async()=>{
    for(const p of ['/arus-balik-vs-aliran-silang-2/','/product/brentwood-accupac-of21ma-offset-fluted-low-fouling/']){
      const html=await render(p)
      expect(html,p).not.toMatch(/<a [^>]*>\s*(?:<br[^>]*>\s*)*<\/a>/)
    }
  })
})
