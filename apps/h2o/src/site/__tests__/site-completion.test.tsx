import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {LuxuryHeader} from '../LuxuryShell'
import {siteNavigation} from '../SiteNavigation'
import {salmonDocument,salmonRoutes} from '../salmon'
import {AuthorityEditorial} from '../AuthorityEditorial'
import {ProjectAuthorityIndex} from '../ProjectAuthorityIndex'
import {ProjectDetail} from '../ProjectDetail'
import {LuxuryCanonical} from '../LuxuryCanonical'

const documentFor=(id:string)=>salmonDocument(salmonRoutes().find(route=>route.routeId===id)!)

describe('site completion authority and structure',()=>{
  it('exposes only public navigation destinations in grouped desktop and mobile controls',()=>{
    const html=renderToStaticMarkup(<LuxuryHeader/>)
    const destinations=siteNavigation.flatMap(group=>'items' in group?group.items.map(([,href])=>href):[group.href])
    for(const href of destinations)expect(html).toContain(`href="${href}"`)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-controls="site-nav-panel-0"')
    expect(html).toContain('aria-controls="site-mobile-panel"')
    expect(html).toContain('<summary>Repair Upgrades And Maintenance</summary>')
    expect(html).not.toContain('/author/tbozic/')
    expect(html).not.toContain('/admin/')
  })
  it('preserves the approved New Towers H1, exact Salmon images, provenance and responsive structure',()=>{
    const doc=documentFor('SALMON-pages-1230'),html=renderToStaticMarkup(<LuxuryCanonical doc={doc}/>)
    expect(html).toMatch(/<h1\b[^>]*>New Cooling Tower Systems for High-Performance Industrial Cooling<\/h1>/)
    expect((html.match(/<h1\b/g)??[])).toHaveLength(1)
    expect(html).toContain('data-salmon-document="SALMON-pages-1230"')
    expect(html).toContain(`data-salmon-source-sha256="${doc.sourceIdentity.sha256}"`)
    expect(html).toContain('data-salmon-region="body"')
    for(const [sha,extension] of [
      ['0d1039c0be35c5134f2141a079f8fa71896dc0f91c060d5d2e35d8f1422fe940','jpg'],
      ['4d50140513f4a8fdd05e9266d1028c695e23c072f4f4928dab50aeac37ab7a46','webp'],
      ['0558dfd628dbdd7c46e5132e7f45f0af7b44a34147993b574da0253a379077ca','png'],
    ]){
      expect(html).toContain(`src="/media/salmon/${sha}.${extension}"`)
      expect(html).toContain(`data-source-sha256="${sha}"`)
      const bytes=readFileSync(path.join(process.cwd(),`public/media/salmon/${sha}.${extension}`))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha)
    }
    const css=readFileSync(path.join(process.cwd(),'src/app/(site)/salmon-parity-overrides.css'),'utf8')
    for(const width of ['1100','600'])expect(css).toContain(`max-width:${width}px`)
    expect(css).toContain('.salmon-copy .site-mobile-nav{display:block')
    expect(css).toMatch(/@media\(max-width:600px\)\{[^]*?\.salmon-copy \.salmon-footer-main\{[^}]*grid-template-columns:minmax\(0,1fr\)/)
  })
  it('preserves About geography corrections while presenting three confirmed locations',()=>{
    const html=renderToStaticMarkup(<AuthorityEditorial doc={documentFor('SALMON-pages-1931')}/>)
    for(const location of ['Lakewood, Colorado','Japan','Bangkok, Thailand'])expect(html).toContain(location)
    expect(html).not.toContain('Philippines branch')
    expect(html).not.toContain('Saudi Arabia')
    expect(html).not.toContain('USA Thailand Japan')
    expect((html.match(/<h1\b/g)??[])).toHaveLength(1)
  })
  it('keeps exactly the public project cohort and renders source-backed detail',()=>{
    const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;state:string;export:boolean}>}
    const expected=ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&row.path.startsWith('/all-projects/')&&row.path!=='/all-projects/')
    const index=renderToStaticMarkup(<ProjectAuthorityIndex doc={documentFor('SALMON-pages-1353')}/>)
    expect((index.match(/data-project-source=/g)??[])).toHaveLength(expected.length)
    expect(index).toContain('project-record-body')
    const detail=renderToStaticMarkup(<ProjectDetail doc={documentFor('SALMON-pages-2301')}/>)
    expect((detail.match(/<h1\b/g)??[])).toHaveLength(1)
    expect(detail).toContain('6-cell FRP crossflow cooling tower')
    expect(detail).toContain('href="/all-projects/"')
  })
})
