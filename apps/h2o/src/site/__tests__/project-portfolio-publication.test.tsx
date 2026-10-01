import {afterEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import type * as RuntimeReadModule from '../../content/runtime-read'

const state=vi.hoisted(()=>({revoked:new Set<string>(),promoted:new Set<string>()}))
vi.mock('../../content/runtime-read',async importOriginal=>{
  const original=await importOriginal<typeof RuntimeReadModule>()
  const json=(file:string)=>JSON.parse(readFileSync(path.join(process.cwd(),file),'utf8'))
  const salmonFixture=json('content/salmon/active-routes.json') as Array<{targetPath:string;file:string}>
  const liveFixture=(json('content/salmon/r2-live-routes.json') as Array<{routeId:string;targetPath:string;file:string}>).filter(row=>['LIVE-portfolio-2168','LIVE-portfolio-2174'].includes(row.routeId))
  const documentFiles=new Set([...salmonFixture,...liveFixture].map(row=>row.file))
  const fixtureLedger=()=>({routes:(json('content/release/route-ledger.json').routes as Array<{path:string}>).filter(row=>!state.promoted.has(row.path)).map(row=>state.revoked.has(row.path)?{...row,state:'WITHDRAWN',export:false}:row)})
  const fixtureRoutes=<T extends {targetPath:string}>(rows:T[]):T[]=>{
    const publicPaths=new Set(fixtureLedger().routes.filter(row=>{const publication=row as {state?:string;export?:boolean};return publication.state==='PUBLIC'&&publication.export}).map(row=>row.path))
    return rows.filter(row=>publicPaths.has(row.targetPath))
  }
  return {...original,
    releaseLedger:fixtureLedger,
    snapshotJson:(file:string)=>{
      if(file==='ledger.json')return fixtureLedger()
      if(file==='routes.salmon.json')return fixtureRoutes(salmonFixture)
      if(file==='routes.live.json')return fixtureRoutes(liveFixture)
      throw new Error(`Unexpected snapshot read: ${file}`)
    },
    snapshotFile:(file:string)=>{
      if(!documentFiles.has(file))throw new Error(`Unexpected snapshot file: ${file}`)
      return readFileSync(path.join(process.cwd(),'content/salmon',file))
    },
  }
})
import {salmonDocument,salmonRoutes} from '../salmon'
import {SalmonFamilyPage} from '../SalmonFamilies'
import {publicProjectRows,salmonFamilyFor,salmonFamilyModel} from '../salmon-family-adapter'
import type {Block,SalmonFamilyPageModel} from '../salmon-family-model'

const saved={...process.env}
afterEach(()=>{process.env={...saved};state.revoked.clear();state.promoted.clear()})
const project='/all-projects/kbr/' // Any accepted project identity; no EDC-specific exception.
function projectCardIdentities(model:SalmonFamilyPageModel,destination:string):Set<string>{
  const identities=new Set<string>()
  const visit=(block:Block)=>{
    if((block.type==='iconCard'||block.type==='imageCard')&&block.href===destination)identities.add(block.key)
    if(block.type==='container')block.children.forEach(visit)
    if(block.type==='accordion')block.items.forEach(item=>item.answer.forEach(visit))
  }
  model.sections.forEach(section=>visit(section.root))
  return identities
}
function portfolio(){
  const doc=salmonDocument(salmonRoutes().find(row=>row.targetPath==='/all-projects/')!)
  const config=salmonFamilyFor(doc)!
  return {model:salmonFamilyModel(doc,config),html:renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={config}/>)}
}
function withdrawn(){
  const {model,html}=portfolio()
  expect(publicProjectRows()).toHaveLength(21)
  expect(html).toContain('data-salmon-family="project-portfolio"')
  expect(html).not.toContain(`href="${project}"`)
  expect(html).not.toContain('/projects/kbr/')
  expect(html).not.toContain('aria-label="kbr"')
  expect(projectCardIdentities(model,project).size).toBe(0)
  expect(model.modules.projectCoverage?.some(row=>row.path===project)).toBe(false)
  expect(salmonRoutes().filter(row=>row.targetPath===project)).toHaveLength(0)
}
describe('publication-aware portfolio projection',()=>{
  it('preserves the 22-project repository authority even if Payload has a withdrawal',()=>{
    process.env.H2O_CONTENT_SOURCE='repository';state.revoked.add(project)
    expect(publicProjectRows()).toHaveLength(22)
    expect(portfolio().html).toContain(`href="${project}"`)
  })
  it('renders all accepted projects in the normal Payload baseline',()=>{
    process.env.H2O_CONTENT_SOURCE='payload'
    expect(publicProjectRows()).toHaveLength(22)
    const {model,html}=portfolio()
    expect(html).toContain(`href="${project}"`)
    expect(model.modules.projectCoverage?.some(row=>row.path===project)).toBe(false)
  })
  it('removes the withdrawn card and coverage during the immediate revocation overlay',()=>{
    process.env.H2O_CONTENT_SOURCE='payload';state.revoked.add(project);withdrawn()
  })
  it('keeps the withdrawn card absent after promotion removes its ledger and route',()=>{
    process.env.H2O_CONTENT_SOURCE='payload';state.promoted.add(project);withdrawn()
  })
  it('restores the same project once without caching the withdrawn inventory or adding coverage',()=>{
    process.env.H2O_CONTENT_SOURCE='payload';state.revoked.add(project);withdrawn()
    state.revoked.clear();state.promoted.add(project);withdrawn();state.promoted.clear()
    const {model,html}=portfolio()
    expect(publicProjectRows().filter(row=>row.path===project)).toHaveLength(1)
    expect(salmonRoutes().filter(row=>row.targetPath===project)).toHaveLength(1)
    expect(html).toContain(`href="${project}"`)
    expect(model.modules.projectCoverage?.filter(row=>row.path===project)).toHaveLength(0)
    expect(projectCardIdentities(model,project).size).toBe(1)
  })
})
