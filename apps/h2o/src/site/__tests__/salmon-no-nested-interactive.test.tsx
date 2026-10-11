/**
 * H2O_HOSTED_VALIDATION_HOLD_PROJECTS_HYDRATION regression.
 *
 * Browsers cannot represent an <a> or <button> inside another <a>/<button>; the HTML parser splits the outer
 * element, React's hydration then sees a different tree and throws #418. /all-projects/ rendered 30 such
 * nested links because a linked card title wrapped rich text that already carried the same link. Every Salmon
 * family page and the Parts index must render with zero nested interactive elements (Payload content mode).
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import type * as RuntimeReadModule from '../../content/runtime-read'

vi.mock('../../content/runtime-read',async importOriginal=>{
  const original=await importOriginal<typeof RuntimeReadModule>()
  const json=(file:string)=>JSON.parse(readFileSync(path.join(process.cwd(),file),'utf8'))
  const salmonFixture=json('content/salmon/active-routes.json') as Array<{targetPath:string;file:string}>
  const ledgerJson=json('content/release/route-ledger.json')
  const publicSet=new Set((ledgerJson.routes as Array<{path:string;state?:string;export?:boolean}>).filter(row=>row.state==='PUBLIC'&&row.export).map(row=>row.path))
  const publicSalmon=salmonFixture.filter(row=>publicSet.has(row.targetPath))
  return {...original,
    releaseLedger:()=>ledgerJson,
    snapshotJson:(file:string)=>{
      if(file==='ledger.json')return ledgerJson
      if(file==='routes.salmon.json')return publicSalmon
      if(file==='routes.live.json')return []
      throw new Error(`Unexpected snapshot read: ${file}`)
    },
    snapshotFile:(file:string)=>readFileSync(path.join(process.cwd(),'content/salmon',file)),
  }
})
import {salmonDocument,salmonRoutes} from '../salmon'
import {SalmonFamilyPage} from '../SalmonFamilies'
import {PartsIndex} from '../Wave3Presentation'
import {salmonFamilyFor,salmonFamilyRouteIds} from '../salmon-family-adapter'

const saved={...process.env}
beforeEach(()=>{process.env.H2O_CONTENT_SOURCE='payload';process.env.H2O_TYPEFORM_FORM_ID='F22cAgx3';process.env.H2O_TYPEFORM_ORIGIN='https://form.typeform.com'})
afterEach(()=>{process.env={...saved}})

const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'])
/** Every <a>/<button> opened while another <a>/<button> is open (a tag-stack scan of the server HTML). */
function nestedInteractive(html:string):string[]{
  const stack:string[]=[],found:string[]=[]
  for(const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)){
    const [,close,raw,attrs,selfClosing]=match,tag=raw!.toLowerCase()
    if(VOID.has(tag)||selfClosing)continue
    if(close){const at=stack.lastIndexOf(tag);if(at>=0)stack.length=at;continue}
    if((tag==='a'||tag==='button')&&stack.some(open=>open==='a'||open==='button'))found.push(`${tag}${(attrs!.match(/href="[^"]*"/)??[''])[0]} in ${stack.slice(-4).join('>')}`)
    stack.push(tag)
  }
  return found
}
// Family pages = the family table plus every project detail (selected without loading all ~1,200 documents).
const familyPaths=()=>{const ids=new Set(salmonFamilyRouteIds());return salmonRoutes().filter(row=>ids.has(row.routeId)||/^\/all-projects\/[^/]+\/$/.test(row.targetPath)).map(row=>row.targetPath).sort()}

describe('Salmon presentation never nests interactive elements',()=>{
  it('detects the hosted /all-projects/ defect shape',()=>{
    expect(nestedInteractive('<h3><a href="#usa"><a href="#usa">United States</a></a></h3>')).toHaveLength(1)
    expect(nestedInteractive('<h3><a href="#usa">United States</a></h3><a href="#x"><img src="x"/></a>')).toEqual([])
  })
  it('covers the audited family estate',()=>{
    // 50 family models; one family route is not a published Payload path, so 49 render here.
    expect(familyPaths().length).toBeGreaterThanOrEqual(48) // STAGING-AUDIT-REDIRECTS-1: /cooling-tower-singapore/ is a 301 now
    expect(familyPaths()).toContain('/all-projects/')
  },60000)
  it('/all-projects/ renders zero nested links',()=>{
    const doc=salmonDocument(salmonRoutes().find(row=>row.targetPath==='/all-projects/')!)
    const html=renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={salmonFamilyFor(doc)!}/>)
    expect(nestedInteractive(html)).toEqual([])
    // The flag strip keeps its destinations: one linked title per country anchor.
    expect(html).toMatch(/<h3 class="sp-card-title[^"]*"[^>]*><a href="#usa">United States<\/a><\/h3>/)
  })
  it('every family page and the Parts index render zero nested links',()=>{
    const failures:string[]=[]
    for(const target of familyPaths()){
      const doc=salmonDocument(salmonRoutes().find(row=>row.targetPath===target)!)
      const found=nestedInteractive(renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={salmonFamilyFor(doc)!}/>))
      if(found.length)failures.push(`${target}: ${found.length} e.g. ${found[0]}`)
    }
    const parts=salmonDocument(salmonRoutes().find(row=>row.targetPath==='/cooling-tower-parts-online/')!)
    const found=nestedInteractive(renderToStaticMarkup(<PartsIndex doc={parts}/>))
    if(found.length)failures.push(`/cooling-tower-parts-online/: ${found.length} e.g. ${found[0]}`)
    expect(failures).toEqual([])
  },120000)
})
