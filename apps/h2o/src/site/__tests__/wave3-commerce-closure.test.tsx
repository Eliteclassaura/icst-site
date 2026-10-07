import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {R5ProductDetail} from '../r5/R5Product' // Design R5a: the shipped product detail
import {SalmonSeo,normalizeWave3IndexEditorial,normalizeWave3ProductDescription,renderSalmonNode} from '../SalmonCanonical'
import {activeProductRoutes} from '../Wave3Products'
import {salmonDocument,salmonRoutes,type SalmonNode} from '../salmon'

const descriptionNames=new Set(['description','og:description','twitter:description'])
const priceRoutes=[
  '/product/amarillo-a-series-double-reduction-gearbox/',
  '/product/amarillo-double-reduction-gearbox/',
  '/product/frp-angles/',
  '/product/frp-channels/',
  '/product/frp-deck-board/',
  '/product/frp-flatsheet/',
]
const sourcePriceLeaves=(nodes:SalmonNode[]):number=>nodes.reduce((count,node)=>count+(typeof node==='string'?/[$€£]\s*\d/.test(node)?1:0:sourcePriceLeaves(node.children)),0)

describe('Wave 3 R3 approved commerce closure',()=>{
  it('normalizes exactly the first approved imperative in all 297 held product description fields',()=>{
    let held=0
    const unique=new Set<string>()
    for(const route of activeProductRoutes()){
      const doc=salmonDocument(route)
      for(const meta of doc.seo.meta.filter(item=>descriptionNames.has(item.name))){
        const result=normalizeWave3ProductDescription(meta.value)
        if(!/^(?:Shop)\b/i.test(meta.value)&&result!==meta.value){held++;unique.add(meta.value)}
        if(/^(?:[^?]+\?\s+)?(?:Buy|Order|Shop)\b/i.test(meta.value)){
          expect(result,route.targetPath).toMatch(/^(?:[^?]+\?\s+)?Request a quote for\b/i)
          expect(result,route.targetPath).not.toMatch(/^(?:[^?]+\?\s+)?(?:Buy|Order|Shop)\b/i)
        }
      }
    }
    expect(held).toBe(297)
    expect(unique.size).toBe(99)
    const abb=salmonDocument(activeProductRoutes().find(route=>route.targetPath==='/product/abb-motor-example/')!)
    expect(renderToStaticMarkup(<SalmonSeo doc={abb}/>)).toContain('Request a quote for the ABB Motor Example')
  })

  it('suppresses all 17 numeric price leaves while retaining their non-price dimensions',()=>{
    let leaves=0
    for(const routePath of priceRoutes){
      const route=activeProductRoutes().find(row=>row.targetPath===routePath)!
      const doc=salmonDocument(route)
      leaves+=sourcePriceLeaves(doc.children)
      const html=renderToStaticMarkup(<R5ProductDetail doc={doc}/>)
      expect(html,routePath).not.toMatch(/[$€£]\s*\d/)
      expect(html,routePath).not.toMatch(/\b(?:Estimated\s+)?Price(?:\s+Range)?:/i)
      expect(html,routePath).not.toMatch(/Add to Cart|Buy Now|Checkout|type="number"/i)
      expect(html,routePath).toContain('data-product-module="specifications"')
    }
    expect(leaves).toBe(17)
    const frp=salmonDocument(activeProductRoutes().find(row=>row.targetPath==='/product/frp-angles/')!)
    const html=renderToStaticMarkup(<R5ProductDetail doc={frp}/>)
    for(const size of ['2 Inch','3 Inch','4 Inch'])expect(html).toContain(`>${size}</li>`)
  })

  it('uses only the exact approved Parts-index replacements and preserves source files',()=>{
    const route=salmonRoutes().find(row=>row.targetPath==='/cooling-tower-parts-online/')!
    const doc=salmonDocument(route)
    const heading='Order Cooling Tower Parts Online — Simple, Transparent, Fast'
    const paragraph='Full product specifications, compatibility details, and pricing are listed on our website for immediate reference. Products with listed prices are available for direct purchase.'
    const tail=' For custom configurations or large-volume orders, request a free quote'
    expect(normalizeWave3IndexEditorial(heading)).toBe('Cooling Tower Parts Online — Simple, Transparent, Fast')
    expect(normalizeWave3IndexEditorial(paragraph)).toBe('Product specifications and compatibility details are provided where available. Contact ICS to request a quote.')
    expect(normalizeWave3IndexEditorial(paragraph+tail)).toBe('Product specifications and compatibility details are provided where available. Contact ICS to request a quote.'+tail)
    expect(renderToStaticMarkup(<>{renderSalmonNode(heading,'heading',doc)}</>)).not.toContain('Order Cooling Tower Parts Online')
    const bytes=readFileSync(path.join(process.cwd(),'content/salmon',route.file))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(route.sha256)
    for(const product of activeProductRoutes()){
      const original=readFileSync(path.join(process.cwd(),'content/salmon',product.file))
      expect(createHash('sha256').update(original).digest('hex'),product.targetPath).toBe(product.sha256)
    }
  })
})
