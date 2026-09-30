import {isPayloadContent,releaseLedger,snapshotJson} from '../content/runtime-read'
import {salmonNavigation} from './navigation-data'

/**
 * Site chrome CONTENT (R1B): navigation labels/links and footer copy/links.
 *
 * Main Factory keeps the chrome's layout, type, geometry and styling in code (`SiteNavigation`, `LuxuryShell`).
 * The words and destinations are content: in Payload content mode they come from the published `site-chrome`
 * global (materialised into the release as `site-chrome.json`); in repository mode, and whenever the global
 * has never been saved, they are exactly the accepted defaults below, so the static release is unchanged.
 *
 * Fact safeguards: office phone numbers, addresses and social profiles are NOT chrome content. They stay on
 * the owner contact authority (`contact.ts`, `ClientReview`) and are rendered by code.
 * A navigation or footer link whose internal target is not a PUBLIC route in the current release (after
 * revocations) is suppressed rather than rendered as a dead link (accepted navigation contract rule 1).
 */
export type ChromeLink={label:string;href:string}
export type NavGroup={label:string;href?:string;items?:ChromeLink[];sections?:Array<{label:string;items:ChromeLink[]}>}
export type SiteChrome={
  navigation:NavGroup[]
  footer:{heading:string;contactLabel:string;description:string;columns:Array<{title:string;ariaLabel:string;links:ChromeLink[]}>;officesTitle:string;officesContactLabel:string;copyright:string;privacyLabel:string;privacyHref:string}
}

const pairs=(items:ReadonlyArray<readonly [string,string]>):ChromeLink[]=>items.map(([label,href])=>({label,href}))
export const DEFAULT_SITE_CHROME:SiteChrome={
  navigation:salmonNavigation.map(group=>({
    label:group.label,
    ...('href' in group?{href:group.href}:{}),
    ...('items' in group?{items:pairs(group.items)}:{}),
    ...('sections' in group?{sections:group.sections.map(section=>({label:section.label,items:pairs(section.items)}))}:{}),
  })),
  footer:{
    heading:'Let’s Build Efficient Industrial Cooling Systems',
    contactLabel:'Contact us',
    description:'ICS specializes in industrial cooling solutions, including cooling towers, evaporative cooling systems, and heat exchangers designed for efficient thermal management and industrial reliability.',
    columns:[
      {title:'Company',ariaLabel:'Company',links:pairs([['About ICS','/about-ics-industrial-cooling-solutions/'],['Projects','/all-projects/']])},
      {title:'Towers & services',ariaLabel:'Towers and services',links:pairs([['New Cooling Towers','/cooling-tower/'],['Cooling Tower Replacement','/cooling-tower-replacement/'],['Thermal Upgrade','/thermal-upgrade/'],['Repair & Maintenance','/cooling-tower-maintenance-repair-upgrade/'],['Disaster Recovery','/disaster-recovery/'],['Dry Soda Blasting','/dry-soda-blasting/'],['Air Coolers','/air-coolers/']])},
      {title:'Parts',ariaLabel:'Parts',links:pairs([['All Cooling Tower Parts','/cooling-tower-parts-online/'],['Fan stacks','/cooling-tower-fan-stacks/'],['Fans','/fans/'],['Fill media','/fill-media/'],['Drive shafts','/drive-shafts-assembles/'],['Gear boxes','/gear-box/'],['Motors','/motors/'],['Nozzles','/nozzles/'],['FRP members','/frp-members/'],['Tower hardware','/tower-hardware/']])},
      {title:'Resources',ariaLabel:'Resources',links:pairs([['Technical Articles','/tech-articles/'],['Brochures','/cooling-tower-brochures/'],['Tools','/cooling-tower-resources/tools/'],['Resources Library','/resources/'],['Search','/search/']])},
    ],
    officesTitle:'Contact',
    officesContactLabel:'Contact us',
    copyright:'Copyright © Industrial Cooling Solutions',
    privacyLabel:'Privacy Policy',
    privacyHref:'/privacy-policy/',
  },
}

/** The chrome content for this request (published global in Payload mode, accepted defaults otherwise). */
export function siteChrome():SiteChrome{
  if(!isPayloadContent())return DEFAULT_SITE_CHROME
  try{return snapshotJson<SiteChrome>('site-chrome.json')}catch{return DEFAULT_SITE_CHROME}
}

/** Keep a link only when its internal target is a PUBLIC route of the current release (external/tel pass). */
export function linkRenderable(href:string):boolean{
  if(!isPayloadContent()||!href.startsWith('/'))return true
  try{
    const ledger=releaseLedger() as {routes:Array<{path:string;state:string}>}
    const target=decodeURIComponent(href.split(/[?#]/)[0]!)
    const row=ledger.routes.find(r=>decodeURIComponent(r.path)===target)
    return !row||row.state==='PUBLIC'
  }catch{return true}
}

export function renderableChrome(chrome:SiteChrome=siteChrome()):SiteChrome{
  const keep=(links:ChromeLink[]|undefined)=>links?.filter(link=>linkRenderable(link.href))
  return {
    navigation:chrome.navigation.filter(group=>!group.href||linkRenderable(group.href)).map(group=>({...group,items:keep(group.items),sections:group.sections?.map(section=>({...section,items:keep(section.items)??[]}))})),
    footer:{...chrome.footer,columns:chrome.footer.columns.map(column=>({...column,links:keep(column.links)??[]}))},
  }
}
