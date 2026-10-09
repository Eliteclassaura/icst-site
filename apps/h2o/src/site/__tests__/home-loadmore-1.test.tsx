/**
 * HOME-LOADMORE-1 (owner, 2026-10-09): the dead Elementor "Load More" widgets (no script behind them) are gone from every page; on the home's
 * product tabs each becomes a normal internal "View all …" link to that tab's own category or hub, in the same button markup. Code-owned,
 * applied on read in both content modes; positions are kept (stubs), so content slots keep their keys.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {TAB_DESTINATIONS,deadWidgetCount,withoutDeadLoadMore} from '../../content/dead-widgets'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
type N=string|{tag:string;attrs:Record<string,string>;children:N[]}
const n=(tag:string,cls:string,children:N[]=[],extra:Record<string,string>={}):N=>({tag,attrs:{class:cls,...extra},children})
const button=():N=>n('div','e-loop__load-more elementor-button-wrapper',[n('a','elementor-button elementor-size-sm',[n('span','elementor-button-content-wrapper',[n('span','elementor-button-text',['Load More'])])],{role:'button'})])
const tabs=(titles:string[],withButton:boolean[]):N=>n('div','e-n-tabs',[
  n('div','e-n-tabs-heading',titles.map(t=>n('button','e-n-tab-title',[t]))),
  n('div','e-n-tabs-content',titles.map((_,i)=>n('div','panel',[n('div','e-loop-container',[]),n('span','e-load-more-spinner'),n('div','e-load-more-anchor'),...(withButton[i]?[button()]:[]),n('div','e-load-more-message')]))),
])
const find=(x:N,pred:(x:Exclude<N,string>)=>boolean,out:Array<Exclude<N,string>>=[]):Array<Exclude<N,string>>=>{if(typeof x==='string')return out;if(pred(x))out.push(x);for(const c of x.children)find(c,pred,out);return out}

describe('HOME-LOADMORE-1: the transform',()=>{
  it('a tab panel\'s Load More becomes a link to that tab\'s own destination, same button markup; helpers become stubs; unknown tabs and bare dead links are removed; positions are kept',()=>{
    const doc={targetPath:'/',children:[tabs(['All','Fan','Gearbox','Mystery'],[true,true,true,true])]}
    const out=withoutDeadLoadMore(doc)
    const root=(out.children as N[])[0] as Exclude<N,string>
    const links=find(root,x=>x.tag==='a'&&Boolean(x.attrs.href)) // the unknown tab's anchor is blanked: no href
    expect(links.map(l=>[l.attrs.href,l.children.length])).toEqual([['/cooling-tower-parts-online/',1],['/fans/',1],['/gear-box/',1]])
    expect(links.every(l=>l.attrs.class==='elementor-button elementor-size-sm'&&!('role' in l.attrs))).toBe(true)
    expect(find(root,x=>x.attrs.class==='elementor-button-text').map(x=>x.children[0])).toEqual(['View all parts','View all fans','View all gear boxes'])
    expect(deadWidgetCount(out)).toBe(0)
    // blanked, not removed: the whole tree keeps its shape (every container its number of children), so slot keys and position-reading templates keep working
    const shape=(x:N):unknown=>typeof x==='string'?0:x.children.map(shape)
    expect(shape((out.children as N[])[0]!)).toEqual(shape(doc.children[0] as N))
    // the unknown tab's button is a stub
    expect(find(root,x=>'data-dead-widget' in x.attrs).length).toBeGreaterThan(8)
    expect(find(root,x=>'data-dead-widget' in x.attrs).every(x=>Object.keys(x.attrs).join()==='data-dead-widget')).toBe(true) // no classes, no text
    // off the home page the same widgets are only removed (no "View all" link to a category)
    const other=withoutDeadLoadMore({targetPath:'/blog/',children:[tabs(['All','Fan'],[true,true])]})
    expect(find((other.children as N[])[0]!,x=>x.tag==='a'&&Boolean(x.attrs.href))).toHaveLength(0)
    expect(deadWidgetCount(other)).toBe(0)
    // a document with nothing dead is returned as is
    const clean={children:[n('p','x',['hello'])]}
    expect(withoutDeadLoadMore(clean)).toBe(clean)
    // a bare link with no href and the text Load More is removed; a real link with that text is kept
    const bare=withoutDeadLoadMore({children:[n('div','',[n('a','',['Load More']),n('a','',['Load More'],{href:'/x/'})])]})
    expect(find((bare.children as N[])[0]!,x=>x.tag==='a'&&Boolean(x.attrs.href))).toHaveLength(1)
    expect(find((bare.children as N[])[0]!,x=>x.tag==='a'&&Boolean(x.attrs.href))[0]!.attrs.href).toBe('/x/')
    expect(find((bare.children as N[])[0]!,x=>x.tag==='a'&&!x.attrs.href).every(x=>JSON.stringify(x.children)==='[""]')).toBe(true) // the dead one is blanked
  })
  it('every tab destination is a public route of the release', ()=>{
    const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;state:string;export:boolean}>}
    for(const [title,dest] of Object.entries(TAB_DESTINATIONS)){
      const row=ledger.routes.find(r=>r.path===dest.href)
      expect(row?.state,`${title} -> ${dest.href}`).toBe('PUBLIC')
      expect(row?.export,dest.href).toBe(true)
      expect(dest.label).toMatch(/^View all /)
    }
  })
})

describe('HOME-LOADMORE-1: every page',()=>{
  it('no imported document keeps a dead Load More widget after the read transform (all documents that carry one in source)',()=>{
    const dir=path.join(APP,'content/salmon/documents')
    let withWidget=0
    for(const f of readdirSync(dir).filter(f=>f.endsWith('.json'))){
      const raw=readFileSync(path.join(dir,f),'utf8')
      if(!raw.includes('e-load-more')&&!/Load More/i.test(raw))continue
      const doc=JSON.parse(raw) as {routeId:string;targetPath:string;children:unknown[]}
      if(deadWidgetCount(doc)>0)withWidget++
      const out=withoutDeadLoadMore(doc as {children:unknown[]})
      expect(deadWidgetCount(out),doc.routeId).toBe(0)
      expect(JSON.stringify(out.children),doc.routeId).not.toContain('e-load-more')
    }
    expect(withWidget).toBeGreaterThan(300) // the article pages' dead anchors and the home's loop widgets
  },120000)
  it('the home renders no Load More and no e-load-more markup; each product tab that had one links to its own category or hub',async()=>{
    const html=await render('/')
    expect(html).not.toContain('e-load-more')
    expect(html).not.toMatch(/Load More/i)
    const links=[...html.matchAll(/<a[^>]*class="elementor-button elementor-size-sm"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="elementor-button-text"[^>]*>([^<]+)<\/span>/g)].map(m=>[m[1],m[2]])
    expect(links).toEqual([['/cooling-tower-parts-online/','View all parts'],['/drive-shafts-assembles/','View all drive shafts'],['/fill-media/','View all fill media'],['/fans/','View all fans'],['/gear-box/','View all gear boxes']])
  },300000)
  it('a repository-mode article that carried the dead anchor renders without it',async()=>{
    const html=await render('/cooling-tower-material/')
    expect(html).not.toMatch(/Load More/i)
    expect(html).not.toContain('e-load-more')
  },300000)
})
