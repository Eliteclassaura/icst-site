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
 *   2. redirects: public-redirects records, 301, one hop (CREATE, or UPDATE of a record whose target differs); RETIRE sets
 *                 active:false on a record whose source is decided 200 again (redirects-retired.tsv; the record is kept).
 *   3. seo:       seo.title / seo.description on the route records (published); a meta pending OGCS is not written.
 *   4. h1:        a decided page heading: the page's h1 heading slot (via=slot), or the record title that article templates
 *                 render as the heading (via=title; a restored live body brings its live H1). h1-fields.tsv.
 *   0. slots:     imported page elements the strict save-hook validator rejects (legacy http links, legacy upload paths,
 *                 over-long alt text) are fixed in the SAME write as the decided change (data/slot-fixes.json; every write
 *                 to such a record would otherwise fail). An element whose current value is neither the imported value nor
 *                 the fixed value (edited since) blocks the run.
 *   5. restored:  restoredSections (typed blocks at explicit anchors; data/restored-sections.json), one write per page. The
 *                 save hook re-validates every anchor; an unknown anchor fails the write.
 * A route with an unpublished editor draft pending is never overwritten: the plan reports it and the run stops.
 * Output: one JSON report on stdout (plan counts, per-phase results, failures). No secret, password or token.
 */
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {slotFieldCanon} from './lexical-canon.mjs'
import {publishedAsDecided,withdrawnAsDecided} from './lifecycle.mjs'

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
  const body=await res.json().catch(()=>null)
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

const plan={routes:{publish:[],withdraw:[],index:[],canonical:[]},redirects:{create:[],update:[],unchanged:[],retire:[]},seo:{update:[],unchanged:[]},h1:{update:[]},restored:{update:[]},blocked:[]}
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
const retiredRows=existsSync(path.join(DATA,'redirects-retired.tsv'))?tsv('redirects-retired.tsv').filter(row=>row.source):[]
for(const row of retiredRows){
  const existing=redirectRecords.get(decode(row.source))
  if(existing&&existing.active!==false)plan.redirects.retire.push({...row,id:existing.id})
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
const h1Rows=existsSync(path.join(DATA,'h1-fields.tsv'))?tsv('h1-fields.tsv').filter(row=>row.path):[]
for(const row of h1Rows){
  const r=await getRoute(row.path),doc=r.published
  if(!doc){plan.blocked.push({path:row.path,reason:'published route record not found (h1)'});continue}
  if(pendingDraft(r)){plan.blocked.push({path:row.path,reason:'unpublished editor draft pending'});continue}
  if(row.via==='title'){if(doc.title!==row.h1)plan.h1.update.push({id:doc.id,path:row.path,title:row.h1,h1:row.h1});continue}
  const slots=Array.isArray(doc.slots)?doc.slots:[]
  const index=slots.findIndex(slot=>slot.kind==='heading'&&slot.tag==='h1')
  if(index<0){plan.blocked.push({path:row.path,reason:'no h1 heading slot'});continue}
  if(slots[index].heading===row.h1)continue
  plan.h1.update.push({id:doc.id,path:row.path,slots:slots.map((slot,i)=>i===index?{...slot,heading:row.h1}:slot),h1:row.h1})
}
/** Comparable form of restored sections: Payload round-trips rich text with extra keys, so compare what renders. */
const lexText=state=>(state?.root?.children??[]).map(p=>(p.children??[]).map(c=>c.type==='link'?`[${(c.children??[]).map(t=>t.text).join('')}](${c.fields?.url??''})`:c.type==='text'?`${c.format&1?'**':''}${c.format&2?'*':''}${c.text}${c.format&2?'*':''}${c.format&1?'**':''}`:'').join('')).join('\n')
const canonBlock=b=>b.blockType==='restoredParagraph'?['p',lexText(b.content)]:b.blockType==='restoredList'?['l',Boolean(b.ordered),(b.items??[]).map(i=>lexText(i.content))]:b.blockType==='restoredHeading'?['h',String(b.level),b.text]:b.blockType==='restoredTable'?['t',(b.header??[]).map(h=>h.text??''),(b.rows??[]).map(r=>(r.cells??[]).map(c=>c.text??''))]:b.blockType==='restoredFaq'?['f',(b.items??[]).map(i=>[i.question,i.answer])]:[b.blockType]
const canonRestored=groups=>JSON.stringify((groups??[]).map(g=>[g.mode,g.anchor,(g.blocks??[]).map(canonBlock)]))
const restoredPages=existsSync(path.join(DATA,'restored-sections.json'))?JSON.parse(readFileSync(path.join(DATA,'restored-sections.json'),'utf8')):{}
for(const [p,page] of Object.entries(restoredPages)){
  const r=await getRoute(p),doc=r.published
  if(!doc){plan.blocked.push({path:p,reason:'published route record not found (restored sections)'});continue}
  if(pendingDraft(r)){plan.blocked.push({path:p,reason:'unpublished editor draft pending'});continue}
  if(canonRestored(doc.restoredSections)===canonRestored(page.groups))continue
  plan.restored.update.push({id:doc.id,path:p,groups:page.groups})
}
// Slot hygiene: the fixed page elements every write to an affected route carries.
const slotFixes=existsSync(path.join(DATA,'slot-fixes.json'))?JSON.parse(readFileSync(path.join(DATA,'slot-fixes.json'),'utf8')):{}
const slotFixOf=new Map(Object.entries(slotFixes).map(([p,v])=>[decode(p),v]))
const fixedSlots=new Map() // path → slots to send (only when a fix is still needed)
const writtenPaths=new Set([...plan.routes.publish,...plan.routes.withdraw,...plan.routes.index,...plan.routes.canonical,...plan.seo.update,...plan.h1.update,...plan.restored.update].map(item=>decode(item.path)))
for(const p of writtenPaths){
  const fix=slotFixOf.get(p)
  if(!fix)continue
  const r=await getRoute(p),doc=r.latest??r.published
  const slots=(doc?.slots??[]).map(slot=>({...slot}))
  let needed=false,problem=''
  for(const f of fix.slots){
    const slot=slots.find(x=>x.key===f.key)
    if(!slot){problem=`page element ${f.key} is missing`;break}
    const now=slotFieldCanon(slot,f.field)
    if(now===f.afterCanon)continue
    if(now!==f.before){problem=`page element ${f.key} differs from its imported value (edited since; not overwritten)`;break}
    slot[f.field]=f.after;needed=true
  }
  if(problem){plan.blocked.push({path:p,reason:problem});continue}
  if(needed)fixedSlots.set(p,slots)
}
// An h1 slot edit is made on top of the fixed elements.
for(const item of plan.h1.update)if(item.slots&&fixedSlots.has(decode(item.path))){const base=fixedSlots.get(decode(item.path));const i=base.findIndex(slot=>slot.kind==='heading'&&slot.tag==='h1');item.slots=base.map((slot,j)=>j===i?{...slot,heading:item.h1}:slot)}
const counts={
  redirects:{create:plan.redirects.create.length,update:plan.redirects.update.length,unchanged:plan.redirects.unchanged.length,retire:plan.redirects.retire.length},
  routes:{publish:plan.routes.publish.length,withdraw:plan.routes.withdraw.length,index:plan.routes.index.length,canonical:plan.routes.canonical.length},
  seoFields:{update:plan.seo.update.length},
  h1:{update:plan.h1.update.length},
  restored:{update:plan.restored.update.length},
  slotFixes:{routes:fixedSlots.size},
  blocked:plan.blocked.length,
}
const e=expectations.expect.redirects
// Same key order as counts (the comparison is exact); an older expectations file without `retire` expects none.
const expected={redirects:{create:e.create,update:e.update,unchanged:e.unchanged,retire:e.retire??0},routes:expectations.expect.routes,seoFields:{update:expectations.expect.seoFields.update},h1:{update:expectations.expect.h1?.update??0},restored:{update:expectations.expect.restored?.update??0},slotFixes:{routes:expectations.expect.slotFixes?.routes??0},blocked:0}
const match=JSON.stringify(counts)===JSON.stringify(expected)
const report={mode:MODE,base:new URL(BASE).host,counts,expected,match,blocked:plan.blocked}
if(MODE==='dry-run'||!match){process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exit(match?0:3)}

// APPLY — counts match exactly. Routes first (published articles serve 200 before anything points at them).
const results={routes:[],redirects:[],seo:[],failures:[],skipped:[]}
// Fail fast (R1 continued after its first 400 and left a scattered partial state): the first failed write stops the run,
// then everything already written is read back. A route write carries the route's fixed page elements.
let stopped=false
const write=async(kind,label,p,init)=>{
  if(stopped){results.skipped.push(label);return false}
  const routePath=label.split(' ').slice(1).join(' ')
  if(init?.method==='PATCH'&&p.startsWith('public-routes/')&&fixedSlots.has(decode(routePath))){const body=JSON.parse(init.body);if(!body.slots)body.slots=fixedSlots.get(decode(routePath));init={...init,body:JSON.stringify(body)}}
  const r=await api(p,init);const ok=r.status===200||r.status===201
  ;(ok?results[kind]:results.failures).push({kind,label,status:r.status,...(ok?{}:{error:JSON.stringify(r.body?.errors??r.body).slice(0,300)})})
  if(!ok)stopped=true
  return ok
}
for(const item of plan.routes.publish)await write('routes',`PUBLISH ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:item.disposition,_status:'published'})})
for(const row of plan.redirects.create)await write('redirects',`CREATE ${row.source}`,'public-redirects?depth=0',{method:'POST',body:JSON.stringify({source:row.source,destination:row.destination,status:'301',active:true,authority:'MASTER_SEO_PASS_R1 (OGCS 2026-10-03 + R1.1; CT brief 2026-10-04)'})})
for(const row of plan.redirects.update)await write('redirects',`UPDATE ${row.source}`,`public-redirects/${row.id}?depth=0`,{method:'PATCH',body:JSON.stringify({destination:row.destination,status:'301',active:true,authority:'MASTER_SEO_PASS_R1 (OGCS 2026-10-03 + R1.1; CT brief 2026-10-04)'})})
for(const row of plan.redirects.retire)await write('redirects',`RETIRE ${row.source}`,`public-redirects/${row.id}?depth=0`,{method:'PATCH',body:JSON.stringify({active:false})})
for(const item of plan.routes.withdraw)await write('routes',`WITHDRAW ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:item.disposition,_status:'draft'})})
for(const item of plan.routes.index)await write('routes',`INDEX ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:item.disposition,_status:'published'})})
for(const item of plan.routes.canonical)await write('routes',`CANONICAL ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:item.disposition,seo:{...item.seo,canonical:item.canonical},_status:'published'})})
for(const item of plan.seo.update)await write('seo',`SEO ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({seo:item.seo,_status:'published'})})
for(const item of plan.h1.update)await write('seo',`H1 ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({...(item.title!==undefined?{title:item.title}:{slots:item.slots}),_status:'published'})})
for(const item of plan.restored.update)await write('seo',`RESTORED ${item.path}`,`public-routes/${item.id}?depth=0`,{method:'PATCH',body:JSON.stringify({restoredSections:item.groups,_status:'published'})})
// Read back: every write is verified through the API (published state as the public sees it).
const verify=[]
routeCache.clear()
for(const item of [...plan.routes.publish,...plan.routes.index,...plan.routes.canonical]){const r=await getRoute(item.path);if(!publishedAsDecided(r.published,item.disposition))verify.push({path:item.path,problem:'not published as decided'})}
for(const item of plan.routes.withdraw){
  const r=await getRoute(item.path)
  const onlyPublished=await api(`public-routes?where[pathKey][equals]=${encodeURIComponent(decode(item.path))}&where[_status][equals]=published&limit=1&depth=0&draft=false`)
  if(!withdrawnAsDecided(r.published,onlyPublished.body?.docs,item.disposition))verify.push({path:item.path,problem:'not withdrawn as decided',status:r.published?._status??null,state:r.published?.disposition?.state??null})
}
for(const [p,slots] of fixedSlots){const r=await getRoute(p);const fix=slotFixOf.get(p);for(const f of fix.slots){const slot=(r.published?.slots??[]).find(x=>x.key===f.key);if(slotFieldCanon(slot,f.field)!==f.afterCanon)verify.push({path:p,problem:`page element ${f.key} not as fixed`})};void slots}
for(const item of plan.seo.update){const r=await getRoute(item.path);if(r.published?.seo?.title!==item.seo.title||(item.seo.description!==undefined&&r.published?.seo?.description!==item.seo.description))verify.push({path:item.path,problem:'seo fields not as decided'})}
for(const item of plan.h1.update){const r=await getRoute(item.path);const value=item.title!==undefined?r.published?.title:(r.published?.slots??[]).find(s=>s.kind==='heading'&&s.tag==='h1')?.heading;if(value!==item.h1)verify.push({path:item.path,problem:'h1 not as decided'})}
for(const item of plan.restored.update){const r=await getRoute(item.path);if(canonRestored(r.published?.restoredSections)!==canonRestored(item.groups))verify.push({path:item.path,problem:'restored sections not as decided'})}
const after=new Map((await all('public-redirects')).map(doc=>[decode(String(doc.source)),doc]))
for(const row of retiredRows){const d=after.get(decode(row.source));if(d&&d.active!==false)verify.push({path:row.source,problem:'retired redirect still active'})}
for(const row of tsv('redirects.tsv')){const d=after.get(decode(row.source));if(!d||decode(String(d.destination))!==decode(row.destination)||d.active===false)verify.push({path:row.source,problem:'redirect record not as decided'})}
process.stdout.write(JSON.stringify({...report,applied:{routes:results.routes.length,redirects:results.redirects.length,seo:results.seo.length},failures:results.failures,skipped:results.skipped,verify},null,2)+'\n')
if(verify.length)process.exit(5)
process.exit(results.failures.length?4:0)
