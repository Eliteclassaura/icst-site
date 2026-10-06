import {readFileSync} from 'node:fs'
import path from 'node:path'

/**
 * Design R3 (CT approval 2026-10-06): the About and Contact photos, one verified ICS original per slot
 * (content/design/design-r3-media.json; h2o-corpus-asset-curator). The owner's Figma photos are recorded per slot as
 * rejected (A1: AI-retouched copies, or another country's project on an office card); each slot names its replacement,
 * its original's path and SHA-256, and its identity. Client logos join this file when the owner supplies them.
 */
export type DesignR3Media={src:string;sha256:string;width:number;height:number;alt:string;caption?:string;identity:string;original:{path:string;sha256:string;width:number;height:number}}
type DesignR3Ledger={slots:Record<string,{figma:{fileKey:string;node:string;figmaSha256:string[];reason:string};media:DesignR3Media;disposition:string}>;clientLogos:{status:string;logos?:Record<string,{src:string;sha256:string;width:number;height:number}>}}
let cache:DesignR3Ledger|undefined
export const designR3Ledger=():DesignR3Ledger=>cache??=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/design-r3-media.json'),'utf8')) as DesignR3Ledger
export const designR3Media=(slot:string):DesignR3Media=>{
  const entry=designR3Ledger().slots[slot]
  if(!entry)throw new Error(`Design R3 media slot missing: ${slot}`)
  return entry.media
}
/** A client's logo once the owner's file is registered; until then the client strip shows the name as a grey wordmark. */
export const clientLogo=(name:string)=>designR3Ledger().clientLogos.logos?.[name]
