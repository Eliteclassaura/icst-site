import {readFileSync} from 'node:fs'
import path from 'node:path'
import {contactOffices} from './contact'

/**
 * Design Fixes R2 (Control Tower 2026-10-05; design audit R1 #7) and OGCS pre-launch copy R1 §4: the hero's primary action
 * on the service pages is the quote action; the secondary is an on-page anchor or, for one page, an office telephone. Which
 * routes, and every label, are data (content/design/hero-actions.json), so an OGCS wording change is a data change only.
 * `sourceLabel` names the source action the primary replaces on a source-rendered page (/cooling-tower/); without it the
 * renderer's hero signal is the action (the key-addressed luxury pages). `secondaryTargetDataId` names the source container
 * that becomes the anchor target on a source-rendered page.
 */
export type HeroSecondary={label:string;href?:string;office?:string}
export type HeroAction={label:string;sourceLabel?:string;secondary?:HeroSecondary;secondaryTargetDataId?:string}
type Authority={routes:Record<string,HeroAction>}
let cache:Authority|undefined
const authority=():Authority=>cache??=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/hero-actions.json'),'utf8')) as Authority
export const heroActionFor=(routePath:string):HeroAction|undefined=>authority().routes[routePath]
/** The secondary's link: its anchor, or the named owner-authority office's tel: link. */
export const heroSecondaryHref=(secondary:HeroSecondary):string=>{
  if(secondary.office){
    const office=contactOffices.find(o=>o.officeKey===secondary.office)
    if(!office)throw new Error(`Unknown office ${secondary.office}`)
    return office.telephoneHref
  }
  if(!secondary.href?.startsWith('#'))throw new Error('A hero secondary is an on-page anchor or an office telephone')
  return secondary.href
}
