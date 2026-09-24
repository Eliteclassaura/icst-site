import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
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
    expect(html).toContain('<summary>Services</summary>')
    expect(html).not.toContain('/author/tbozic/')
    expect(html).not.toContain('/admin/')
  })
  it('preserves the accepted New Towers H1 and authentic selected source image',()=>{
    const doc=documentFor('SALMON-pages-1230'),html=renderToStaticMarkup(<LuxuryCanonical doc={doc}/>)
    expect(html).toContain('New Cooling Tower Systems for High-Performance Industrial Cooling')
    expect((html.match(/<h1\b/g)??[])).toHaveLength(1)
    expect(html).toContain('d88ec30b8ddc425c-ICS-PTT-PO-July-16.jpeg')
    expect(html).toContain('data-project-attribution="none"')
    expect((html.match(/class="tower-mobile-disclosure"/g)??[])).toHaveLength(3)
    for(const label of ['Industrial cooling tower applications','Cooling tower configurations','Materials and system design'])expect(html).toContain(`<summary>${label}`)
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
