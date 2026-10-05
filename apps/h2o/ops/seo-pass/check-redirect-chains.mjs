#!/usr/bin/env node
/**
 * MASTER SEO PASS R1 — redirect chain and loop checker.
 *
 *   node ops/seo-pass/check-redirect-chains.mjs                 # the batch data: every source, target and hop
 *   node ops/seo-pass/check-redirect-chains.mjs <base-url>      # also follows each batch source live (read-only GETs)
 *
 * Static: a target that is itself a source is a chain; a source reached again is a loop; a source that equals its target
 * is a self-redirect. Live: following Location from each source must reach a 200 within one hop (two only for the framework
 * trailing-slash case, which is reported). Exit 1 on any chain, loop, self-redirect or non-200 final target.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'

const DATA=path.join(path.dirname(new URL(import.meta.url).pathname),'data')
const BASE=(process.argv[2]??'').replace(/\/+$/,'')
const [head,...lines]=readFileSync(path.join(DATA,'redirects.tsv'),'utf8').trimEnd().split('\n')
const cols=head.split('\t'),rows=lines.map(line=>Object.fromEntries(line.split('\t').map((v,i)=>[cols[i],v])))
const decode=v=>{try{return decodeURIComponent(v)}catch{return v}}
const next=new Map(rows.map(r=>[decode(r.source),decode(r.destination)]))
const problems=[]
for(const [source,target] of next){
  if(source===target){problems.push({source,problem:'self-redirect'});continue}
  const seen=new Set([source]);let hop=target,hops=1
  while(next.has(hop)){if(seen.has(hop)){problems.push({source,problem:'loop'});break}seen.add(hop);hop=next.get(hop);hops++}
  if(hops>1&&!problems.some(p=>p.source===source))problems.push({source,problem:`chain of ${hops} hops`})
}
const live=[]
if(/^https?:\/\//.test(BASE)){
  const get=async url=>{const res=await fetch(BASE+url,{redirect:'manual',signal:AbortSignal.timeout(30_000)});await res.arrayBuffer().catch(()=>{});const loc=res.headers.get('location');return {status:res.status,location:loc?new URL(loc,BASE).pathname:null}}
  for(let i=0;i<rows.length;i+=6)await Promise.all(rows.slice(i,i+6).map(async row=>{
    let hops=0,r=await get(row.source)
    const trail=[]
    while([301,302,307,308].includes(r.status)&&hops<5){trail.push(`${r.status} ${r.location}`);hops++;r=await get(r.location)}
    if(r.status!==200||hops>1)live.push({source:row.source,hops,final:r.status,trail})
  }))
}
const report={redirects:rows.length,static:{problems},live:BASE?{checked:rows.length,problems:live}:'not run'}
process.stdout.write(JSON.stringify(report,null,2)+'\n')
process.exit(problems.length||live.length?1:0)
