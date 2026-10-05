#!/usr/bin/env node
/**
 * Held LIVE alt text (Control Tower SEO parity follow-up R1, Part 2 item 3). Offline; writes one data file.
 *
 *   node ops/seo-pass/build-live-alt.mjs <audit-raw-dir> [--evidence=<label>]
 *
 * Input: the read-only LIVE fetches of the CT on-page parity audit (H2O_SEO_PARITY_AUDIT_R1_2026-10-04; raw/*.json records
 * {which:'live',path,html}). Output: content/salmon/live-image-alt.json, the alt text h2ocooling.com serves today for each
 * upload, keyed by its upload path without the size suffix (the same key site/salmon.ts heldMediaAlt uses).
 * Only descriptive alt text is kept: at least two words, not a file name, no contact detail. Nothing is invented here.
 */
import {readFileSync,readdirSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const [rawDir]=process.argv.slice(2).filter(a=>!a.startsWith('--'))
const evidence=process.argv.find(a=>a.startsWith('--evidence='))?.slice('--evidence='.length)??'H2O_SEO_PARITY_AUDIT_R1_2026-10-04 live fetches'
if(!rawDir){process.stderr.write('usage: build-live-alt.mjs <audit-raw-dir> [--evidence=<label>]\n');process.exit(2)}
const APP=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','..')
const OUT=path.join(APP,'content/salmon/live-image-alt.json')

const ENTITIES={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',hellip:'…'}
const decode=v=>v.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,(e,b)=>b[0]==='#'?String.fromCodePoint(b[1]==='x'||b[1]==='X'?parseInt(b.slice(2),16):Number(b.slice(1))):ENTITIES[b]??e)
/** Upload key: the path after /wp-content/uploads/, without the size or "-scaled" suffix or a served ".webp" twin, lower-cased. */
export const uploadKey=url=>{
  let p=url.split(/[?#]/)[0]
  try{p=decodeURI(p)}catch{/* keep */}
  const m=/\/wp-content\/uploads\/(.+)$/i.exec(p)
  if(!m)return null
  return m[1].replace(/(\.(?:jpe?g|png|gif))\.webp$/i,'$1').replace(/-(?:\d+x\d+|scaled)(?=\.[a-z0-9]+$)/i,'').toLowerCase()
}
const descriptive=alt=>alt.split(/\s+/).length>=2&&!/\.(?:jpe?g|png|gif|webp|svg)\b/i.test(alt)&&!/@|https?:|\+?\d[\d\s().-]{8,}\d/.test(alt)

const index=new Map()
let pages=0
for(const file of readdirSync(rawDir).sort()){
  const record=JSON.parse(readFileSync(path.join(rawDir,file),'utf8'))
  if(record.which!=='live'||!record.html)continue
  pages++
  for(const tag of record.html.match(/<img\b[^>]*>/g)??[]){
    const raw=/\balt="([^"]*)"/.exec(tag)?.[1]
    if(!raw)continue
    const alt=decode(raw).replace(/\s+/g,' ').trim()
    if(!descriptive(alt))continue
    for(const [,src] of tag.matchAll(/\b(?:src|data-src|data-lazy-src|data-orig-src)="([^"]+)"/g)){
      if(src.startsWith('data:'))continue
      const key=uploadKey(src)
      if(key&&!index.has(key))index.set(key,alt)
    }
  }
}
const sorted=Object.fromEntries([...index].sort(([a],[b])=>a<b?-1:a>b?1:0))
writeFileSync(OUT,JSON.stringify({evidence,origin:'https://h2ocooling.com',livePages:pages,alt:sorted},null,1)+'\n')
process.stdout.write(JSON.stringify({livePages:pages,uploads:index.size,out:path.relative(APP,OUT)})+'\n')
