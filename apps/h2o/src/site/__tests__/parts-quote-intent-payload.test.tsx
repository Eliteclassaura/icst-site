/**
 * H2O_HOSTED_VALIDATION_HOLD_PARTS_QUOTE_ADAPTER regression.
 *
 * The runtime import deliberately leaves the ten Main-owned Parts hero "Contact Us for a Quote" actions unstamped
 * (`MAIN_OWNED_PARTS_HERO`, ../../content/rfq-intent). In Payload content mode the presentation must therefore
 * apply Main's owner-classified exact-label rule to exactly those ten paths, so each renders the approved
 * Typeform adapter (page_path + editorial_inline) rather than a plain Contact link. No other Contact link changes.
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
  const ledger=()=>ledgerJson
  const publicSet=new Set((ledgerJson.routes as Array<{path:string;state?:string;export?:boolean}>).filter(row=>row.state==='PUBLIC'&&row.export).map(row=>row.path))
  const publicSalmon=salmonFixture.filter(row=>publicSet.has(row.targetPath))
  return {...original,
    releaseLedger:ledger,
    snapshotJson:(file:string)=>{
      if(file==='ledger.json')return ledger()
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
import {salmonFamilyFor} from '../salmon-family-adapter'
import {MAIN_OWNED_PARTS_HERO_PATHS} from '../../content/rfq-intent'

const saved={...process.env}
beforeEach(()=>{process.env.H2O_CONTENT_SOURCE='payload';process.env.H2O_TYPEFORM_FORM_ID='F22cAgx3';process.env.H2O_TYPEFORM_ORIGIN='https://form.typeform.com'})
afterEach(()=>{process.env={...saved}})

const render=(target:string)=>{
  const doc=salmonDocument(salmonRoutes().find(row=>row.targetPath===target)!)
  if(target==='/cooling-tower-parts-online/')return renderToStaticMarkup(<PartsIndex doc={doc}/>)
  const config=salmonFamilyFor(doc)
  if(!config)throw new Error(`No Salmon family: ${target}`)
  return renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={config}/>)
}
const mainOf=(html:string)=>html.slice(html.indexOf('<main'),html.indexOf('</main>'))

describe('Payload mode: the ten Main-owned Parts hero quote CTAs',()=>{
  it('covers exactly the ten owner-classified Parts paths',()=>{
    expect([...MAIN_OWNED_PARTS_HERO_PATHS].sort()).toEqual(['/cooling-tower-fan-stacks/','/cooling-tower-parts-online/','/drive-shafts-assembles/','/fans/','/fill-media/','/frp-members/','/gear-box/','/motors/','/nozzles/','/tower-hardware/'])
  })
  for(const target of [...MAIN_OWNED_PARTS_HERO_PATHS].sort()){
    it(`${target} renders the approved adapter, not a Contact link`,()=>{
      const main=mainOf(render(target))
      const actions=[...main.matchAll(/<a [^>]*href="([^"]+)"[^>]*>Contact Us for a Quote<\/a>/g)].map(match=>match[1]!)
      expect(actions,target).toHaveLength(1)
      expect(actions[0],target).toContain(`typeform.com/to/F22cAgx3#page_path=${encodeURIComponent(target)}&amp;cta_placement=editorial_inline`)
      expect(actions[0],target).not.toMatch(/product_(?:slug|id)/)
      expect(main,target).not.toContain('href="/contact-us/">Contact Us for a Quote<')
    })
  }
  it('does not turn any other Contact link into a quote action',()=>{
    const main=mainOf(render('/cooling-tower-fan-stacks/'))
    // The same page's ordinary "Contact for pricing" link stays a Contact link when it carries no imported stamp.
    expect(main).toContain('href="/contact-us/">Contact for pricing<')
  })
})
