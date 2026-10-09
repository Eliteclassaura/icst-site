/**
 * PROJECTS-MENU-1 (owner/CT 2026-10-09): the header Projects dropdown (desktop and mobile) shows the live site's items: United States, Japan,
 * Singapore, Thailand, Malaysia, then All Projects. The items are resolved from the live menu against the route ledger
 * (ops/catalog/build-projects-menu.mjs -> content/design/projects-menu.json); a retired or renamed route, or a hand edit, fails the drift guard.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {PROJECTS_MENU_LINKS,salmonNavigation} from '../navigation-data'
import {buildProjectsMenu} from '../../../ops/catalog/build-projects-menu.mjs'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;state:string;export:boolean}>}
type Item={label:string;live:string;href:string}
const committed=():{items:Item[]}=>JSON.parse(readFileSync(path.join(APP,'content/design/projects-menu.json'),'utf8'))

describe('PROJECTS-MENU-1',()=>{
  it('the committed menu data is what the route ledger derives (a retired or renamed route needs a regenerated menu)',()=>{
    expect((buildProjectsMenu(APP) as {items:Item[]}).items).toEqual(committed().items)
  })
  it('the live items in the live order, All Projects last; Japan links the page this site serves, never a redirect',()=>{
    expect(PROJECTS_MENU_LINKS.map(l=>l[0])).toEqual(['United States','Japan','Singapore','Thailand','Malaysia','All Projects'])
    expect(PROJECTS_MENU_LINKS.map(l=>l[1])).toEqual([
      '/cooling-tower-construction-repair-in-united-states/','/cooling-tower-japan/','/cooling-tower-construction-repair-in-singapore/',
      '/cooling-tower-thailand/','/cooling-tower-malaysia/','/all-projects/',
    ])
    const states=new Map(ledger.routes.map(r=>[r.path,r]))
    for(const [label,href] of PROJECTS_MENU_LINKS){const row=states.get(href);expect(row?.state,`${label} ${href}`).toBe('PUBLIC');expect(row?.export,`${label} ${href}`).toBe(true)}
  })
  it('the header Projects group keeps its own link (/all-projects/) and carries the items; no other group changed',()=>{
    const group=salmonNavigation.find(g=>g.label==='Projects')!
    expect(group.href).toBe('/all-projects/')
    expect(group.items.map(i=>[i[0],i[1]])).toEqual(PROJECTS_MENU_LINKS.map(l=>[l[0],l[1]]))
    expect(salmonNavigation.map(g=>g.label)).toEqual(['New Towers','Services','Air Coolers','Parts','Projects','Resources','About'])
  })
  it('every item is a public page that renders, and is in the desktop and the mobile menu of the header (home and an inner page)',async()=>{
    for(const [label,href] of PROJECTS_MENU_LINKS)expect(await render(href),`${label} -> ${href}`).toContain('<h1')
    for(const page of ['/','/resources/']){
      const html=await render(page)
      const header=html.slice(html.indexOf('<header'),html.indexOf('</header>'))
      for(const [label,href] of PROJECTS_MENU_LINKS){
        expect(header.split(`href="${href}"`).length-1,`${label} ${href} on ${page}: desktop dropdown + mobile menu`).toBeGreaterThanOrEqual(2)
      }
    }
  },300000)
})
