/**
 * R3.5 (Control Tower 2026-10-06, hosted HOLD): /all-projects/ showed 19 of the 20 registered project photo cards on the
 * Payload runtime. The release document follows each card's /projects/<identity>/ redirect from the published ledger, and
 * /projects/cooling-tower-replacement/ lands on the public service page, so that card lost its project (no photo, listed under
 * "More project records"). The ledger here carries its published redirects, as the hosted snapshot does.
 */
import {afterEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import type * as RuntimeReadModule from '../../content/runtime-read'

vi.mock('../../content/runtime-read',async importOriginal=>{
  const original=await importOriginal<typeof RuntimeReadModule>()
  const json=(file:string)=>JSON.parse(readFileSync(path.join(process.cwd(),file),'utf8'))
  const salmonFixture=json('content/salmon/active-routes.json') as Array<{targetPath:string;file:string}>
  const {origin,routes,redirects}=json('content/release/route-ledger.json')
  const ledger=()=>({origin,routes,redirects})
  const publicPaths=new Set((routes as Array<{path:string;state:string;export:boolean}>).filter(row=>row.state==='PUBLIC'&&row.export).map(row=>row.path))
  const salmonRows=salmonFixture.filter(row=>publicPaths.has(row.targetPath))
  return {...original,
    releaseLedger:ledger,
    snapshotJson:(file:string)=>{
      if(file==='ledger.json')return ledger()
      if(file==='routes.salmon.json')return salmonRows
      if(file==='routes.live.json')return []
      throw new Error(`Unexpected snapshot read: ${file}`)
    },
    snapshotFile:(file:string)=>readFileSync(path.join(process.cwd(),'content/salmon',file)),
  }
})
import {salmonDocument,salmonRoutes} from '../salmon'
import {SalmonFamilyPage} from '../SalmonFamilies'
import {salmonFamilyFor,salmonFamilyModel} from '../salmon-family-adapter'
import {projectMediaRegistry} from '../project-media'

const saved={...process.env}
afterEach(()=>{process.env={...saved}})
const registry=projectMediaRegistry().projects
function portfolio(){
  const doc=salmonDocument(salmonRoutes().find(row=>row.targetPath==='/all-projects/')!)
  const config=salmonFamilyFor(doc)!
  return {model:salmonFamilyModel(doc,config),html:renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={config}/>)}
}
// Each card: its photo (background sha) and the first project link after it.
const cardsIn=(html:string)=>[...html.matchAll(/data-source-background-sha256="([0-9a-f]{64})"(?:(?!data-source-background-sha256)[^])*?href="(\/all-projects\/[^"/]+\/)"/g)].map(m=>({sha:m[1]!,href:m[2]!}))

describe('/all-projects/: the photo-card set is exactly the 22 registered project identities',()=>{
  it('the published ledger sends /projects/cooling-tower-replacement/ to the service page (the hosted condition)',()=>{
    const {redirects}=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {redirects:Array<{source:string;destination:string}>}
    expect(redirects.find(r=>r.source==='/projects/cooling-tower-replacement/')?.destination).toBe('/cooling-tower-replacement/')
    expect(registry['/all-projects/cooling-tower-replacement/']?.media.sha256).toBe('c19aacc896713d728545a2da467bd0c2ee4cdf704cc94e1184837464d0bdbbbd')
  })
  for(const mode of ['payload','export'] as const)it(`${mode}: 22 photo cards, each its own registered photo, no duplicates, no text-only project record`,()=>{
    if(mode==='payload')process.env.H2O_CONTENT_SOURCE='payload'
    else{process.env.H2O_CONTENT_SOURCE='repository';process.env.H2O_PUBLIC_EXPORT='1'}
    const {model,html}=portfolio()
    const cards=cardsIn(html)
    const projectCards=cards.filter(card=>registry[card.href])
    expect(projectCards.map(card=>card.href).sort()).toEqual(Object.keys(registry).sort())
    for(const card of projectCards){const e=registry[card.href] as unknown as {media:{sha256:string};card?:{sha256:string}};expect(card.sha,card.href).toBe((e.card??e.media).sha256)}
    expect(new Set(cards.map(card=>card.sha)).size).toBe(cards.length)
    expect(html).toContain('href="/all-projects/cooling-tower-replacement/"')
    // No portfolio card points at the service page any more (the site navigation may), and no project falls into the text-only list.
    expect(JSON.stringify(model.sections)).not.toContain('"href":"/cooling-tower-replacement/"')
    expect(model.modules.projectCoverage).toEqual([])
    expect(html).not.toContain('More project records')
  })
})
