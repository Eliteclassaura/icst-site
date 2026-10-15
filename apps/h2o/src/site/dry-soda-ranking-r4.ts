import {createElement,Fragment} from 'react'
import {salmonDocument,salmonRoutes,type SalmonDocument} from './salmon'
import type {R4Api,R4ButtonVariant} from './r4/R4System'

export const DRY_SODA_RANKING_PATH='/dry-soda-blast-cleaning-services-2/'
export const DRY_SODA_DESIGN_ROUTE_ID='SALMON-pages-1722'
export const DRY_SODA_RANKING_ROUTE_ID=['LIVE','pages','5010'].join('-')

/**
 * The October 7 accepted Design R4 presentation belongs to SALMON-pages-1722.
 * Keep the accepted source registered as the visual provenance, while the LIVE
 * document remains the authority for every word at the ranking URL.
 */
export function drySodaRankingR4(ranking:SalmonDocument):SalmonDocument{
  if(ranking.routeId!==DRY_SODA_RANKING_ROUTE_ID||ranking.targetPath!==DRY_SODA_RANKING_PATH)throw new Error('Dry Soda ranking authority changed')
  const source=salmonRoutes().find(row=>row.routeId===DRY_SODA_DESIGN_ROUTE_ID)
  if(!source)throw new Error('Accepted Dry Soda Design R4 source missing')
  const design=salmonDocument(source)
  if(design.targetPath!=='/dry-soda-blasting/')throw new Error('Accepted Dry Soda Design R4 path changed')
  if(design.sourceIdentity.sha256!=='ebffdd8e143dfed91b60438021c0767b9fa45a9a2f182e5f143ac540f57ffe6a')throw new Error('Accepted Dry Soda Design R4 source changed')
  return ranking
}

// Feed the ranking document's approved wording into the accepted SALMON-pages-1722
// composition. The composition, section order, media and responsive behavior remain
// the October 7 renderer; this adapter only translates its source-text keys.
export function drySodaRankingApi(api:R4Api):R4Api{
  const refs:Record<string,string|string[]|null>={
    'body.1.1.1.1.1':'dry-soda-ranking-h1',
    'body.1.1.1.3.1.0':['body.1.1.3.1.1.1.1.1.0.0','body.1.1.3.1.1.3.1.1.0.0'],
    'body.3.1.1.1.1.1':'body.1.3.1.1.1.1.1.3.1.1.1.1',
    'body.3.1.1.1.3.1.0':'body.1.3.1.1.1.1.1.3.1.3.1.1',
    'body.3.1.1.1.3.2.0':'body.1.3.1.1.1.1.1.3.1.5.1.1',
    'body.3.1.1.1.3.3.0':null,
    'body.5.1.1.1.1.1':'body.1.5.1.1.1.1.1.1.1.1.1.1',
    'body.5.1.1.1.3.1':'body.1.5.1.1.1.1.1.3.1.1.1.1',
    'body.5.1.1.1.5.1':'body.1.5.1.1.1.1.1.3.1.3.1.2',
    'body.5.1.1.1.5.2.0':null,
    'body.7.1.1.1.1.1':'body.1.9.1.1.1.1.1.3.1.1.1.1',
    'body.7.1.1.1.3.3.1.1.0':null, // the 1722 design's "Our Dry Soda Blast Cleaning Process" heading is not in the LIVE-5010 text: omitted, layout kept
    'body.9.1.1.1.1':'body.1.11.1.1.1.1.1.1',
    'body.9.1.1.3.1.0':null,
    'body.11.1.1.1.1.1':'body.1.13.1.1.1.1.1.1',
    'body.11.1.1.1.3.1.0':'body.1.13.1.1.1.3.1.1',
    'body.11.1.1.1.5.1.11.1.0':null,
    'body.13.1.1.1.1.1':'body.1.7.1.1.1.1.1.1.1.1.1.1',
    'body.13.1.1.1.3.1.0':'body.1.7.1.1.1.1.1.1.1.3.1.1',
    'body.13.1.1.1.3.2.0':'body.1.7.1.1.1.1.1.1.1.5.1.1',
    'body.13.1.1.1.3.3.0':'body.1.9.1.1.1.1.1.3.1.1.1.1',
    'body.13.1.1.1.3.4.0':null,
    'body.15.1.1.1.1':'body.1.15.1.1.1.1.1.1.1.1.1.1',
    'body.15.1.1.3.1.0':'body.1.15.1.1.1.1.1.1.1.3.1.1',
    'body.15.1.1.3.2.0':'body.1.15.1.1.1.1.1.1.1.5.1.1',
  }
  for(const [i,n] of [3,5,7,9,11].entries()){
    refs[`body.7.1.1.1.3.1.${i*2+1}.1.1.0`]=`body.1.9.1.1.1.1.1.3.1.${n}.1.1.3.1`
    refs[`body.7.1.1.1.3.1.${i*2+1}.1.1.1`]=`body.1.9.1.1.1.1.1.3.1.${n}.1.1.3.3`
  }
  const why=[5,7,9,11,13]
  const acceptedWhy=[
    ['body.11.1.1.1.5.1.1.1.1.0','body.11.1.1.1.5.1.1.1.1.1'],
    ['body.11.1.1.1.5.1.3.1.3.1','body.11.1.1.1.5.1.3.1.3.3'],
    ['body.11.1.1.1.5.1.5.1.3.1','body.11.1.1.1.5.1.5.1.3.3'],
    ['body.11.1.1.1.5.1.7.1.3.1','body.11.1.1.1.5.1.7.1.3.3'],
    ['body.11.1.1.1.5.1.9.1.3.1','body.11.1.1.1.5.1.9.1.3.3'],
  ]
  acceptedWhy.forEach(([head,body],i)=>{refs[head!]=`body.1.13.1.1.1.${why[i]}.1.1.3.1`;refs[body!]=`body.1.13.1.1.1.${why[i]}.1.1.3.3`})
  const mapped=(ref:string)=>refs[ref]===undefined?ref:refs[ref]
  return {
    ...api,
    inner:(ref)=>{
      const value=mapped(ref)
      if(value===null)return null
      if(Array.isArray(value))return createElement(Fragment,null,...value.map((key,i)=>createElement(Fragment,{key},api.inner(key),i<value.length-1?' ':null)))
      return api.inner(value)
    },
    tag:(ref)=>{const value=mapped(ref);return value===null||Array.isArray(value)?'':api.tag(value)},
    action:(ref,variant:R4ButtonVariant)=>{
      const label=ref==='body.1.1.1.5.1.1.1'?'Explore Air Coolers':'Request a Quote'
      if(label==='Request a Quote')return api.quote(`ranking-${ref}`,label,variant)
      return createElement('a',{className:`dr4-btn dr4-btn--${variant}`,href:'/air-coolers/','data-hero-action':'secondary'},label)
    },
  }
}
