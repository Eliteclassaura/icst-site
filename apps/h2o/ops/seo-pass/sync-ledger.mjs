#!/usr/bin/env node
/**
 * MASTER SEO PASS — step 3 of the rebuild: regenerate the ledger rows the release authority changes.
 *
 *   node ops/seo-pass/sync-ledger.mjs [--check]
 *
 * Runs release/authority.mjs (which reads content/release/seo-pass-r1.json) and writes back into
 * content/release/route-ledger.json only the rows whose authority values differ. Route order and count never change.
 * A row whose only difference is a stale ENGLISH-SERVICE sourceSha256 is kept as is (a recorded cutover item, not this pass).
 * --check: write nothing; exit 1 when any row would change.
 */
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {releaseAuthority} from '../../release/authority.mjs'

const APP=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','..')
const LEDGER=path.join(APP,'content/release/route-ledger.json')
const check=process.argv.includes('--check')
const authority=releaseAuthority(APP),ledger=JSON.parse(readFileSync(LEDGER,'utf8'))
const byPath=new Map(authority.routes.map(r=>[r.path,r]))
if(authority.routes.length!==ledger.routes.length)throw new Error(`route count changed: ${ledger.routes.length} -> ${authority.routes.length}`)
const changed=[],stale=[]
ledger.routes=ledger.routes.map(row=>{
  const next=byPath.get(row.path)
  if(!next)throw new Error(`authority has no row for ${row.path}`)
  if(JSON.stringify(next)===JSON.stringify(row))return row
  const keys=Object.keys(next).filter(k=>JSON.stringify(next[k])!==JSON.stringify(row[k]))
  if(keys.length===1&&keys[0]==='sourceSha256'&&row.routeId.startsWith('ENGLISH-SERVICE-')){stale.push(row.path);return row}
  changed.push(`${row.path} [${keys.join(',')}]`)
  return next
})
if(!check)writeFileSync(LEDGER,JSON.stringify(ledger,null,2)+'\n')
process.stdout.write(JSON.stringify({changed:changed.length,staleEnglishServiceKept:stale.length,rows:changed},null,2)+'\n')
if(check&&changed.length)process.exit(1)
