import {readFileSync} from 'node:fs'
import path from 'node:path'
import {withImageUrls} from '../content/image-slugs'

/**
 * Design R4 (CT GO 2026-10-07): the R4 page images, one ledger entry per slot (content/design/design-r4-media.json, built
 * from the owner's cleared heroes, verified LIVE originals and byte-exact Figma fills). Every variant is at most its source
 * (or crop) width; owner AI-enhanced images are general imagery only and never captioned as a project.
 */
export type R4Variant={w:number;h:number;src:string;sha256:string;native?:boolean;byteExact?:boolean}
export type R4Media={kind:'owner'|'live'|'figma'|'staging';variants:R4Variant[];alt:string;identity:string;position:string;source:{path:string;sha256:string;width:number;height:number};note?:string}
type Ledger={slots:Record<string,R4Media>;reuse:Record<string,string>}
let cache:Ledger|undefined
const ledger=():Ledger=>cache??=withImageUrls(JSON.parse(readFileSync(path.join(process.cwd(),'content/design/design-r4-media.json'),'utf8')) as Ledger)
export const r4Media=(slot:string):R4Media=>{
  const entry=ledger().slots[slot]
  if(!entry)throw new Error(`Design R4 media slot missing: ${slot}`)
  return entry
}
/** A held staging asset reused by an R4 slot (no new bytes), or another slot's media. */
export const r4Reuse=(slot:string):string=>{
  const value=ledger().reuse[slot]
  if(!value)throw new Error(`Design R4 reuse slot missing: ${slot}`)
  return value
}

type Copy={eyebrows:Record<string,Record<string,string>>;comparisonLabels:string[];statBar:{stat:string;label:string;footnote:string;ctaText:string;authority:string}}
let copy:Copy|undefined
/** Decorative eyebrow labels (from the owner's Figma; listed for OGCS) and the Dry Soda StatBar (OGCS QUALIFY, CT ruling). */
export const r4Copy=():Copy=>copy??=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/design-r4-copy.json'),'utf8')) as Copy
