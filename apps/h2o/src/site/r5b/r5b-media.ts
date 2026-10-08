import {readFileSync} from 'node:fs'
import path from 'node:path'
import type {R4Media} from '../design-r4-media'

/** Design R5b (CT 2026-10-07): the R5b page images, one ledger entry per slot (content/design/design-r5b-media.json). */
let cache:{slots:Record<string,R4Media>}|undefined
export const r5bMedia=(slot:string):R4Media=>{
  cache??=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/design-r5b-media.json'),'utf8')) as {slots:Record<string,R4Media>}
  const entry=cache.slots[slot]
  if(!entry)throw new Error(`Design R5b media slot missing: ${slot}`)
  return entry
}
