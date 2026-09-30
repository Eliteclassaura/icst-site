/**
 * Public text corrections for Salmon source copy — pure functions, no React.
 * Owner phone, About geography, business-scope and Parts-index editorial corrections, shared by
 * the generic renderer (`SalmonCanonical`) and the Salmon family adapter.
 */
import {ownerText,type SalmonDocument} from './salmon'
const INDEX_HEADING_SOURCE='Order Cooling Tower Parts Online — Simple, Transparent, Fast'
const INDEX_HEADING_RENDERED='Cooling Tower Parts Online — Simple, Transparent, Fast'
const INDEX_PARAGRAPH_SOURCE='Full product specifications, compatibility details, and pricing are listed on our website for immediate reference. Products with listed prices are available for direct purchase.'
const INDEX_PARAGRAPH_RENDERED='Product specifications and compatibility details are provided where available. Contact ICS to request a quote.'
// Current owner geography authority supersedes only these historical About statements.
export const aboutGeographyCorrections=new Map([
  ['We are committed to delivering reliable solutions that improve system performance, operational stability, and long-term efficiency for industrial facilities across regional and international markets.','We are committed to delivering reliable solutions that improve system performance, operational stability, and long-term efficiency for industrial facilities.'],
  ['ICS combines the expertise of cooling tower professionals across our headquarters in Lakewood, Colorado, USA, and branch offices in Japan, Thailand, and the Philippines.','ICS combines cooling tower expertise from its main office in Lakewood, Colorado, with confirmed presence in Japan and Bangkok, Thailand.'],
  ['ICS’s USA headquarters are located in Lakewood, Colorado, where key engineering, design, procurement, and management functions are centralized. From this base, we support both domestic and global industrial clients with complete cooling tower solutions.','ICS’s main office is located in Lakewood, Colorado.'],
  ['ICS’s Thailand office in Bangkok serves as a strategic regional hub for Asia, providing complete support for industrial cooling operations across multiple markets.','ICS has a confirmed presence in Bangkok, Thailand.'],
  ['From this base, we manage project engineering, procurement, sales, after-sales services, field support, and technical assistance for cooling tower systems, ensuring fast and reliable service delivery across the region with rapid deployment across Asia and the Middle East.','ICS provides project engineering, procurement, field support, and technical assistance for cooling tower systems.'],
  ['ICS’s Japan office serves Japan, Korea, and China, providing comprehensive sales, after-sales service, engineering support, and project execution for industrial cooling tower systems.','ICS has a confirmed presence in Japan.'],
  ['We support new cooling tower installations, repair and upgrade projects, and supply spare parts for all major cooling tower models, ensuring reliable performance and long-term operational efficiency for industrial clients across the region.','ICS supports new cooling tower installations, repair and upgrade projects, and spare parts supply.'],
  ['Saudi Arabia',''],
])
export const normalizeWave3IndexEditorial=(value:string):string=>value.replace(INDEX_HEADING_SOURCE,INDEX_HEADING_RENDERED).replace(INDEX_PARAGRAPH_SOURCE,INDEX_PARAGRAPH_RENDERED)
export const normalizeWave3ProductDescription=(value:string):string=>value.replace(/^((?:[^?]+\?\s+)?)(?:Buy|Order|Shop)\b/i,(_,opening:string)=>`${opening}Request a quote for`)
// Owner-confirmed industrial business scope; retain source-backed product compatibility.
export const reconcileCommercialScope=(doc:SalmonDocument,value:string):string=>{
  switch(doc.targetPath){
    case '/product/high-efficiency-fill/':
      return value.replaceAll('Commercial HVAC cooling towers','Product compatibility: commercial HVAC cooling towers')
    case '/cooling-tower-rehabilitation-services/':
      return value.replaceAll('power generation, manufacturing, chemical processing, and commercial HVAC sectors','power generation, manufacturing, and chemical processing sectors')
    case '/cooling-tower-singapore/':
      return value.replaceAll('Manufacturing plants, data centers, and commercial HVAC systems all depend','Manufacturing plants and data centers depend').replaceAll('humid climates, space-limited facilities, HVAC integration, maintenance, and industrial cooling systems','humid climates, maintenance demands, and industrial cooling systems')
    case '/hvac-cooling-tower-systems/':
      return value.replaceAll('We specialize in engineering and retrofitting HVAC cooling tower systems','Our engineering and retrofit work focuses on industrial cooling tower systems')
    default:return value
  }
}
/** The public form of one source text node: owner phone, geography and business-scope corrections. */
export const publicSourceString=(doc:SalmonDocument,node:string):string=>ownerText(reconcileCommercialScope(doc,doc.routeId==='SALMON-pages-1931'?(aboutGeographyCorrections.get(node.trim())??node):doc.routeId==='SALMON-pages-411'?normalizeWave3IndexEditorial(node):node))
