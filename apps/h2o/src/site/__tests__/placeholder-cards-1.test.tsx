/**
 * PLACEHOLDER-CARDS-1 (CT 2026-10-11, staging audit H2O-098/102): the retired demo products (ABB Motor Example, TECO / Westinghouse Motor Example,
 * Vibration Switch Example) no longer appear as cards anywhere; their loop cards become public-exclusion stubs in place (siblings keep their keys; nothing is drawn, so no gap).
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonDocument,salmonRoutes} from '../salmon'
import {PLACEHOLDER_PRODUCT,placeholderCardCount,withoutPlaceholderCards} from '../../content/placeholder-cards'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
type N=string|{tag:string;attrs:Record<string,string>;children:N[]}
const n=(tag:string,cls:string,children:N[]=[],extra:Record<string,string>={}):N=>({tag,attrs:{class:cls,...extra},children})
const card=(id:number,slug:string):N=>n('div',`elementor e-loop-item e-loop-item-${id}`,[n('div','x',[n('a','',['Title '+id],{href:`https://h2ocooling.com/product/${slug}/`}),n('img','',[],{src:'/m.png',alt:slug.includes('example')?'ABB Motor Example':'A motor'})])])
const hrefs=(x:N,out:string[]=[]):string[]=>{if(typeof x==='string')return out;if(x.tag==='a'&&x.attrs.href)out.push(x.attrs.href);for(const c of x.children)hrefs(c,out);return out}
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean;sourceFile?:string}>}

describe('PLACEHOLDER-CARDS-1: the transform',()=>{
  it('blanks a loop card that links to a -example product, keeps the shape and every other card, and returns the same object when there is nothing to blank',()=>{
    const doc={children:[n('div','e-loop-container',[card(1,'real-motor'),card(4758,'abb-motor-example'),card(2,'another-motor'),card(4756,'teco-westinghouse-motor-example'),card(4753,'vibration-switch-example')])]}
    expect(placeholderCardCount(doc)).toBe(3)
    const out=withoutPlaceholderCards(doc)
    const grid=(out.children as N[])[0] as Exclude<N,string>
    expect(grid.children).toHaveLength(5) // positions are kept: every sibling keeps its key (slots, position-reading templates)
    expect(grid.children.map(c=>typeof c==='string'?'':('data-public-exclusion' in c.attrs?'stub':'card'))).toEqual(['card','stub','card','stub','stub'])
    expect(grid.children.filter(c=>typeof c!=='string'&&'data-public-exclusion' in c.attrs).map(c=>(c as {attrs:Record<string,string>;children:N[]}).attrs['data-public-exclusion'])).toEqual(['placeholder-card:4758','placeholder-card:4756','placeholder-card:4753'])
    expect(hrefs(grid)).toEqual(['https://h2ocooling.com/product/real-motor/','https://h2ocooling.com/product/another-motor/'])
    expect(JSON.stringify(grid)).not.toMatch(/Example|example/)
    expect(placeholderCardCount(out)).toBe(0)
    const clean={children:[n('div','e-loop-container',[card(1,'real-motor')])]}
    expect(withoutPlaceholderCards(clean)).toBe(clean)
  })
  it('the pattern is exactly the demo products: /product/<slug>-example/, not a real product whose name contains "example"',()=>{
    for(const ok of ['/product/abb-motor-example/','/product/teco-westinghouse-motor-example/','/product/vibration-switch-example','/product/x-Example/'])expect(PLACEHOLDER_PRODUCT.test(ok),ok).toBe(true)
    for(const no of ['/product/baldor-motor/','/product/example-motor-kit/','/product-category/motors/','/motors/'])expect(PLACEHOLDER_PRODUCT.test(no),no).toBe(false)
  })
})

describe('PLACEHOLDER-CARDS-1: the whole content set',()=>{
  const raw=(file:string)=>JSON.parse(readFileSync(path.join(APP,'content/salmon',file),'utf8')) as {children:N[]}
  const rows=ledger.routes.filter(r=>r.sourceFile?.startsWith('documents/')&&r.state==='PUBLIC')
  it('no public document renders a link to a -example product after the read transform; the pages that carried the cards are the home, the Parts hub, Motors, the motors category and the tower hardware pages (listed)',()=>{
    const before:string[]=[],after:string[]=[]
    for(const row of rows){
      const docRaw=raw(row.sourceFile!)
      if(placeholderCardCount(docRaw)>0)before.push(row.path)
      const route=salmonRoutes().find(r=>r.routeId===row.routeId)
      if(!route)continue
      const doc=salmonDocument(route) as unknown as {children:N[]}
      for(const c of doc.children)if(hrefs(c).some(h=>PLACEHOLDER_PRODUCT.test(new URL(h,'https://h2ocooling.com').pathname))){after.push(row.path);break}
    }
    expect(before.sort()).toEqual(['/','/cooling-tower-parts-online/','/motors/','/product-category/motors/'].concat(before.filter(p=>!['/','/cooling-tower-parts-online/','/motors/','/product-category/motors/'].includes(p))).sort())
    expect(before.length).toBeGreaterThanOrEqual(4)
    expect(after,'pages that still link to a placeholder product (not loop cards: they need their own transform)').toEqual([])
  },300000)
  it('the three demo products are REDIRECT rows of the release ledger (not exported, not indexable): the product catalog grids (Parts hub, home catalog, search) list only PUBLIC products in the Payload runtime',()=>{
    const ex=ledger.routes.filter(r=>PLACEHOLDER_PRODUCT.test(r.path))
    expect(ex.map(r=>r.path).sort()).toEqual(['/product/abb-motor-example/','/product/teco-westinghouse-motor-example/','/product/vibration-switch-example/'])
    for(const r of ex){expect(r.state,r.path).toBe('REDIRECT');expect(r.export,r.path).toBe(false)}
  })
  it('rendered pages carry no placeholder card: the home (Motor tab), Motors and the motors category show neither the titles nor the links; the other motor cards stay (the repository-mode Parts hub grid is the frozen 194-product cohort and is not the staging path)',async()=>{
    for(const p of ['/','/motors/','/product-category/motors/']){
      const html=await render(p)
      expect(html,p).not.toMatch(/\/product\/[a-z0-9-]+-example\//i)
      expect(html,p).not.toMatch(/ABB Motor Example|TECO \/ Westinghouse Motor Example|Vibration Switch Example/)
      expect(html,p).toContain('Baldor Motor')
    }
    expect(await render('/')).not.toContain('data-public-exclusion') // the stub renders nothing at all
  },300000)
})
