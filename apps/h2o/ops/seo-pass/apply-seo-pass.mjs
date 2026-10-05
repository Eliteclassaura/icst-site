#!/usr/bin/env node
/**
 * MASTER SEO PASS R1 — scripted Payload batch (Control Tower brief 2026-10-04). Run by Commander against STAGING only.
 *
 *   node ops/seo-pass/apply-seo-pass.mjs --dry-run      # reads Payload, prints the plan; exits 3 if counts differ from expectations
 *   node ops/seo-pass/apply-seo-pass.mjs --apply        # re-plans, refuses unless the counts match exactly, then writes
 *
 * Environment (values from the protected secrets location; never printed):
 *   H2O_SEO_BASE_URL         staging origin (required; refuses h2ocooling.com)
 *   H2O_SEO_ADMIN_EMAIL      an Admin user
 *   H2O_SEO_ADMIN_PASSWORD   its password
 *
 * Every write goes through Payload's REST API, so the collection hooks, guards, versions and publication events apply
 * (the normal editorial lifecycle; nothing writes the database directly and no frozen source JSON is touched):
 *   1. routes:    PUBLISH (3 content-checked held articles), WITHDRAW_TO_REDIRECT (17 live pages consolidated by a redirect:
 *                 disposition REDIRECT and unpublished), INDEX (5 ranking archives), CANONICAL (4 self canonicals).
 *                 Each disposition is the release-authority row from content/release/route-ledger.json.
 *   2. redirects: public-redirects records, 301, one hop (CREATE, or UPDATE of a record whose target differs).
 *   3. seo:       seo.title / seo.description on the route records (published); a meta pending OGCS is not written.
 * A route with an unpublished editor draft pending is never overwritten: the plan reports it and the run stops.
 * Output: one JSON report on stdout (plan counts, per-phase results, failures). No secret, password or token.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'

const HERE=path.dirname(new URL(import.meta.url).pathname)
const APP=path.resolve(HERE,'..','..')
const DATA=path.join(HERE,'data')
const env=process.env
const BASE=(env.H2O_SEO_BASE_URL??'').replace(/\/+$/,'')
const MODE=process.argv.includes('--apply')?'apply':process.argv.includes('--dry-run')?'dry-run':null
const fail=(message,code=2)=>{process.stderr.write(`${message}\n`);process.exit(code)}
if(!MODE)fail('pass --dry-run or --apply')
if(!/^https?:\/\//.test(BASE))fail('H2O_SEO_BASE_URL is required')
if(/(^|\.)h2ocooling\.com$/i.test(new URL(BASE).hostname))fail('refusing: this script never runs against the production host')
if(!env.H2O_SEO_ADMIN_EMAIL||!env.H2O_SEO_ADMIN_PASSWORD)fail('H2O_SEO_ADMIN_EMAIL and H2O_SEO_ADMIN_PASSWORD are required')

const tsv=file=>{const [head,...lines]=readFileSync(path.join(DATA,file),'utf8').trimEnd().split('\n');const cols=head.split('\t');return lines.map(line=>Object.fromEntries(line.split('\t').map((v,i)=>[cols[i],v])))}
const decode=v=>{try{return decodeURIComponent(v)}catch{return v}}
const expectations=JSON.parse(readFileSync(path.join(DATA,'expectations.json'),'utf8'))
const ledger=new Map(JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')).routes.map(row=>[decode(row.path),row]))
const DISPOSITION=['state','export','indexable','sitemap','searchable','redirect','matchedArticle','releaseOverride']
const dispositionOf=row=>Object.fromEntries(DISPOSITION.map(k=>[k,row[k]??null]))

let token=''
async function api(p,init={}){
  const res=await fetch(`${BASE}/api/${p}`,{...init,headers:{'content-type':'application/json',...(token?{authorization:`JWT ${token}`}:{}),...(init.headers??{})},signal:AbortSignal.timeout(60_000)})
  let body=null;try{body=await res.json()}catch{body=null}
  return {status:res.status,body}
}
const login=await api('users/login/',{method:'POST',body:JSON.stringify({email:env.H2O_SEO_ADMIN_EMAIL,password:env.H2O_SEO_ADMIN_PASSWORD})})
if(login.status!==200||!login.body?.token)fail(`admin login failed (${login.status})`)
token=String(login.body.token)

// Current state, read through the same API.
async function all(collection){const out=[];for(let page=1;;page++){const r=await api(`${collection}?limit=500&page=${page}&depth=0`);if(r.status!==200)fail(`read ${collection} failed (${r.status})`);out.push(...r.body.docs);if(!r.body.hasNextPage)return out}}
const redirectRecords=new Map((await all('public-redirects')).map(doc=>[decode(String(doc.source)),doc]))
async function route(p){
  const key=encodeURIComponent(decode(p))
  const published=await api(`public-routes?where[pathKey][equals]=${key}&limit=1&depth=0&draft=false`)
  const latest=await api(`public-routes?where[pathKey][equals]=${key}&limit=1&depth=0&draft=true`)
  return {published:published.body?.docs?.[0]??null,latest:latest.body?.docs?.[0]??null}
}
const pendingDraft=r=>Boolean(r.latest&&r.published&&r.latest._status==='draft'&&r.latest.updatedAt!==r.published.updatedAt)

const plan={routes:{publish:[],withdraw:[],index:[],canonical:[]},redirects:{create:[],update:[],unchanged:[]},seo:{update:[],unchanged:[]},blocked:[]}
const routeCache=new Map()
const getRoute=async p=>{if(!routeCache.has(decode(p)))routeCache.set(decode(p),await route(p));return routeCache.get(decode(p))}

for(const row of tsv('route-dispositions.tsv')){
  const r=await getRoute(row.path),doc=r.latest??r.published,authority=ledger.get(decode(row.path))
  if(!doc){plan.blocked.push({path:row.path,reason:'route record not found'});continue}
  if(!authority){plan.blocked.push({path:row.path,reason:'no authority row'});continue}
  if(pendingDraft(r)){plan.blocked.push({path:row.path,reason:'unpublished editor draft pending'});continue}
  const want=dispositionOf(authority),have=dispositionOf(doc.disposition??{})
  const canonicalDone=row.action!=='CANONICAL'||doc.seo?.canonical===row.canonical
  const done=JSON.stringify(want)===JSON.stringify(have)&&canonicalDone&&(row.action==='WITHDRAW_TO_REDIRECT'?doc._status!=='published':doc._status==='published')
  if(done)continue
  plan.routes[{PUBLISH:'publish',WITHDRAW_TO_REDIRECT:'withdraw',INDEX:'index',CANONICAL:'canonical'}[row.action]].push({id:doc.id,path:row.path,disposition:want,canonical:row.canonical||null,seo:doc.seo??{}})
}
for(const row of tsv('redirects.tsv')){
  const existing=redirectRecords.get(decode(row.source))
  if(!existing)plan.redirects.create.push(row)
  else if(decode(String(existing.destination))===decode(row.destination)&&existing.active!==false)plan.redirects.unchanged.push(row)
  else plan.redirects.update.push({...row,id:existing.id})
}
for(const row of tsv('seo-fields.tsv')){
  const pending=row.meta_origin.includes('PENDING_OGCS')
  if(row.action!=='UPDATE'){plan.seo.unchanged.push(row.path);continue}
  const r=await getRoute(row.path),doc=r.published
  if(!doc&&!tsv('route-dispositions.tsv').some(d=>d.action==='PUBLISH'&&decode(d.path)===decode(row.path))){plan.blocked.push({path:row.path,reason:'published route record not found'});continue}
  if(pendingDraft(r)){plan.blocked.push({path:row.path,reason:'unpublished editor draft pending'});continue}
  const seo=(doc??r.latest)?.seo??{}
  if(seo.title===row.title&&(pending||seo.description===row.meta)){plan.seo.unchanged.push(row.path);continue}
  plan.seo.update.push({id:(doc??r.latest).id,path:row.path,seo:{...seo,title:row.title,...(pending?{}:{description:row.meta})}})
}
const counts={
  redirects:{create:plan.redirects.create.length,update:plan.redirects.update.length,unchanged:plan.redirects.unchanged.length},
  routes:{publish:plan.routes.publish.length,withdraw:plan.routes.withdraw.length,index:plan.routes.index.length,canonical:plan.routes.canonical.length},
  seoFields:{update:plan.seo.update.length},
  blocked:plan.blocked.length,
}
const expected={redirects:expectations.expect.redirects,routes:expectations.expect.routes,seoFields:{update:expectations.expect.seoFields.update},blocked:0}
const match=JSON.stringify(counts)===JSON.stringify(expected)
const report={mode:MODE,base:new URL(BASE).host,counts,expected,match,blocked:plan.blocked}
if(MODE==='dry-run'||!match){process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exit(match?0:3)}

// APPLY — counts match exactly. Routes first (published articles serve 200 before anything points at them).
const results={routes:[],redirects:[],seo:[],failures:[]}
const write=async(kind,label,p,init)=>{const r=await api(p,init);const ok=r.status===200||r.status===201;(ok?results[kind]:results.failures).push({kind,label,status:r.status,...(ok?{}:{error:JSON.stringify(r.body?.errors??r.body).slice(0,300)})});return ok}
for(const item of plan.routes.publish)await write('routes',`PUBLISH ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:item.disposition,_status:'published'})})
for(const row of plan.redirects.create)await write('redirects',`CREATE ${row.source}`,'public-redirects?depth=0',{method:'POST',body:JSON.stringify({source:row.source,destination:row.destination,status:'301',active:true,authority:'MASTER_SEO_PASS_R1 (OGCS 2026-10-03 + R1.1; CT brief 2026-10-04)'})})
for(const row of plan.redirects.update)await write('redirects',`UPDATE ${row.source}`,`public-redirects/${row.id}?depth=0`,{method:'PATCH',body:JSON.stringify({destination:row.destination,status:'301',active:true,authority:'MASTER_SEO_PASS_R1 (OGCS 2026-10-03 + R1.1; CT brief 2026-10-04)'})})
for(const item of plan.routes.withdraw)await write('routes',`WITHDRAW ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:item.disposition,_status:'draft'})})
for(const item of plan.routes.index)await write('routes',`INDEX ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:item.disposition,_status:'published'})})
for(const item of plan.routes.canonical)await write('routes',`CANONICAL ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:item.disposition,seo:{...item.seo,canonical:item.canonical},_status:'published'})})
for(const item of plan.seo.update)await write('seo',`SEO ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({seo:item.seo,_status:'published'})})
// Read back: every write is verified through the API (published state as the public sees it).
const verify=[]
routeCache.clear()
for(const item of [...plan.routes.publish,...plan.routes.index,...plan.routes.canonical]){const r=await getRoute(item.path);if(r.published?.disposition?.state!=='PUBLIC'||r.published?.disposition?.indexable!==item.disposition.indexable)verify.push({path:item.path,problem:'not published as decided'})}
for(const item of plan.routes.withdraw){const r=await getRoute(item.path);if(r.published)verify.push({path:item.path,problem:'still published'})}
for(const item of plan.seo.update){const r=await getRoute(item.path);if(r.published?.seo?.title!==item.seo.title||(item.seo.description!==undefined&&r.published?.seo?.description!==item.seo.description))verify.push({path:item.path,problem:'seo fields not as decided'})}
const after=new Map((await all('public-redirects')).map(doc=>[decode(String(doc.source)),doc]))
for(const row of tsv('redirects.tsv')){const d=after.get(decode(row.source));if(!d||decode(String(d.destination))!==decode(row.destination)||d.active===false)verify.push({path:row.source,problem:'redirect record not as decided'})}
process.stdout.write(JSON.stringify({...report,applied:{routes:results.routes.length,redirects:results.redirects.length,seo:results.seo.length},failures:results.failures,verify},null,2)+'\n')
if(verify.length)process.exit(5)
process.exit(results.failures.length?4:0)
