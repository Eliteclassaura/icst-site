/**
 * Delivery derivatives for heavy held media (Tier 3 page weight, 2026-10-02).
 *
 * content/media-derivatives.json maps an original public media path to a compressed WebP of the same pixel
 * dimensions. Originals in public/media are never modified and stay the provenance identity: callers keep
 * data-source-sha256 pointing at the original. Only the delivered URL changes; unknown paths pass through.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'

type Derivative={src:string;derivative:string}
let derivatives:Map<string,string>|undefined
export function deliverySrc(src:string):string
export function deliverySrc(src:string|undefined):string|undefined
export function deliverySrc(src:string|undefined):string|undefined{
  if(!src)return src
  derivatives??=new Map((JSON.parse(readFileSync(path.join(process.cwd(),'content/media-derivatives.json'),'utf8')) as {items:Derivative[]}).items.map(item=>[item.src,item.derivative]))
  return derivatives.get(src)??src
}
