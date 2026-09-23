import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {PartsIndex,ProductDetail} from '../Wave3Presentation'
import {activeProductRoutes,productPanels,productPrimaryMedia,productSummary} from '../Wave3Products'
import {salmonDocument,salmonNodeText,salmonRoutes} from '../salmon'
import {productMountGate} from '../gate'

const env={H2O_TYPEFORM_FORM_ID:'F22cAgx3',H2O_TYPEFORM_ORIGIN:'https://form.typeform.com'}
const withForm=<T,>(run:()=>T):T=>{
  const oldId=process.env.H2O_TYPEFORM_FORM_ID,oldOrigin=process.env.H2O_TYPEFORM_ORIGIN
  process.env.H2O_TYPEFORM_FORM_ID=env.H2O_TYPEFORM_FORM_ID
  process.env.H2O_TYPEFORM_ORIGIN=env.H2O_TYPEFORM_ORIGIN
  try{return run()}finally{
    if(oldId===undefined)delete process.env.H2O_TYPEFORM_FORM_ID;else process.env.H2O_TYPEFORM_FORM_ID=oldId
    if(oldOrigin===undefined)delete process.env.H2O_TYPEFORM_ORIGIN;else process.env.H2O_TYPEFORM_ORIGIN=oldOrigin
  }
}

describe('Wave 3 accepted product archetype',()=>{
  it('freezes exactly 183 unique active Salmon products',()=>{
    const rows=activeProductRoutes()
    expect(rows).toHaveLength(183)
    expect(new Set(rows.map(row=>row.targetPath)).size).toBe(183)
    expect(new Set(rows.map(row=>row.routeId)).size).toBe(183)
  })
  it('recovers all primary media by exact URL identity and verifies unchanged local bytes',()=>{
    for(const route of activeProductRoutes()){
      const doc=salmonDocument(route)
      const primary=productPrimaryMedia(doc)
      expect(primary,route.targetPath).not.toBeNull()
      if(!primary)continue
      const file=path.join(process.cwd(),'public',primary.src.slice(1))
      expect(createHash('sha256').update(readFileSync(file)).digest('hex'),route.targetPath).toBe(primary.media.sha256)
      expect(primary.media.width).toBeGreaterThan(0)
      expect(primary.media.height).toBeGreaterThan(0)
      expect(primary.image.src).toBe(doc.images[0].src)
    }
  })
  it('renders every route through one detail component with source name, modules, media and safe RFQ context',()=>withForm(()=>{
    for(const route of activeProductRoutes()){
      const doc=salmonDocument(route),before=JSON.stringify(doc)
      expect(productMountGate(doc,env).mounted,route.targetPath).toBe(true)
      const html=renderToStaticMarkup(<ProductDetail doc={doc}/>)
      expect(html,route.targetPath).toContain('data-wave3-archetype="ProductDetail"')
      expect(html,route.targetPath).toContain(doc.seo.h1[0].replaceAll('&','&amp;'))
      expect(html,route.targetPath).toContain(`data-salmon-document="${route.routeId}"`)
      expect(html,route.targetPath).toContain(`data-source-url="${doc.images[0].src.replaceAll('&','&amp;')}"`)
      expect(html,route.targetPath).toContain('https://form.typeform.com/to/F22cAgx3')
      expect(html,route.targetPath).toContain('product_id='+route.routeId.split('-').at(-1))
      expect(html,route.targetPath).not.toMatch(/<button[^>]*>\s*(?:Add to Cart|Buy Now|Checkout)/i)
      expect(html,route.targetPath).not.toMatch(/<input[^>]*type="number"/i)
      expect(productSummary(doc).length,route.targetPath).toBeGreaterThan(0)
      for(const panel of productPanels(doc))expect(html,route.targetPath).toContain(`data-product-module="${panel.kind}"`)
      expect(JSON.stringify(doc)).toBe(before)
    }
  }))
  it('uses an actual source-backed query and real pagination on the Parts index',()=>{
    const row=salmonRoutes().find(route=>route.targetPath==='/cooling-tower-parts-online/')!
    const doc=salmonDocument(row)
    const first=renderToStaticMarkup(<PartsIndex doc={doc}/>)
    const matching=renderToStaticMarkup(<PartsIndex doc={doc} query="Splash Fill"/>)
    const empty=renderToStaticMarkup(<PartsIndex doc={doc} query="nothing-matches-987654321"/>)
    expect(first).toContain('183 products')
    expect(first).toContain('Page 1 of 16')
    expect(first).not.toContain('Buy Now')
    expect(matching).toContain('Splash Fill')
    expect(empty).toContain('No matching parts')
    expect(first).toContain(doc.seo.h1[0])
    expect(first).toContain('data-wave3-archetype="PartsIndex"')
    expect(salmonNodeText({tag:'span',attrs:{},children:doc.children})).toContain('Cooling Tower Parts Online')
  })
  it('fails closed for invalid product identity and Typeform configuration',()=>{
    const doc=salmonDocument(activeProductRoutes()[0])
    expect(productMountGate({...doc,routeId:'SALMON-product-999999'},env).mounted).toBe(false)
    expect(productMountGate(doc,{...env,H2O_TYPEFORM_FORM_ID:'invalid/form'}).mounted).toBe(false)
  })
})
