/**
 * Delivery derivatives for heavy held media (Tier 3 page weight, 2026-10-02).
 *
 * content/media-derivatives.json maps an original public media path to a compressed WebP of the same pixel
 * dimensions. Originals in public/media are never modified and stay the provenance identity: callers keep
 * data-source-sha256 pointing at the original. Only the delivered URL changes; unknown paths pass through.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {imageUrlPath,physicalImagePath} from '../content/image-slugs'

type Derivative={src:string;derivative:string}
let derivatives:Map<string,string>|undefined
export function deliverySrc(src:string):string
export function deliverySrc(src:string|undefined):string|undefined
export function deliverySrc(src:string|undefined):string|undefined{
  if(!src)return src
  derivatives??=new Map((JSON.parse(readFileSync(path.join(process.cwd(),'content/media-derivatives.json'),'utf8')) as {items:Derivative[]}).items.map(item=>[item.src,item.derivative]))
  // IMG-SEO-1 phase B: the delivered URL is the descriptive one (the physical file name stays the provenance identity)
  const physical=physicalImagePath(src)??src
  return imageUrlPath(derivatives.get(physical)??physical)
}

/**
 * R2.5 (CT ruling on the SEO pre-flight, 2026-10-05): the provenance attributes (data-source-src / data-source-url) name the
 * imported image without the old Salmon staging host, so no served page carries that host (`salmon:/wp-content/…`).
 * Other sources pass through unchanged.
 */
export const SALMON_HOST_ORIGIN=/^https?:\/\/salmon-rhinoceros-754457\.hostingersite\.com(?=\/|$)/
export function provenanceRef(src:string):string
export function provenanceRef(src:string|undefined):string|undefined
export function provenanceRef(src:string|undefined):string|undefined{
  return src?src.replace(SALMON_HOST_ORIGIN,'salmon:'):src
}
