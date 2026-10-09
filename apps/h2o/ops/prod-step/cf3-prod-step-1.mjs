/**
 * CF3-PROD-STEP-1 R2 (CT 2026-10-09): a TARGETED, idempotent production content step.
 *
 * After GO the database holds staff edits, so the cumulative apply-seo-pass is never re-run. This step touches ONLY what
 * CONTENT-FIX-3, CATALOG-FANS-2, REDIRECTS-ADD-1 and PROJECT-IMAGES-1 R2 changed in data (cf3-prod-step-1.data.json):
 *   1. "meta": an SEO field (title or description) of the listed routes (UP2-02, the country pages): written only when the stored value
 *      is exactly the seeded value (null = never written); a different value (edited since seed) is REFUSED; a route with an unpublished editor draft pending is REFUSED.
 *   2. "slotEdits": the Howden size-range text edits (HWD-01..03, HWS-01..02), each one page element of a product page: written
 *      only when the element holds exactly its imported value (or a value the earlier batch listed as accepted); an element that
 *      already holds the new value is UNCHANGED; any other value (edited since) is REFUSED. Nothing else on the page is sent
 *      beyond the page-element list with that one element changed, the route stays published.
 *   3. "redirects": public-redirects records (the five catch-all redirects and the two PTT portfolio redirects): created when the
 *      source has no record; same destination = UNCHANGED; another destination or inactive = REFUSED.
 *   4. "withdraw": the two historical /rt-portfolios/ routes become REDIRECT drafts (out of the public site and the sitemap): done
 *      only when the route is still published as PUBLIC; already withdrawn = UNCHANGED; an unpublished editor draft pending = REFUSED.
 * Nothing else is written: no titles, H1s, canonicals, other page elements or other redirects.
 *
 *   H2O_STEP_BASE_URL=https://... H2O_STEP_ADMIN_EMAIL=... H2O_STEP_ADMIN_PASSWORD=... [H2O_STEP_ADMIN_TOTP_SECRET=...] \
 *     node ops/prod-step/cf3-prod-step-1.mjs --dry-run | --apply
 * --dry-run (default when neither flag is given) prints every item old -> new and writes nothing. --apply writes (fail fast, order:
 * redirects, page-element edits, meta, route withdrawals), then reads back. A run that finds nothing to do prints "0 changes".
 * Exit 3: at least one target was REFUSED (nothing is applied). Exit 4: a write or the read-back failed.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {slotFieldCanon} from '../seo-pass/lexical-canon.mjs'

const HERE=path.dirname(new URL(import.meta.url).pathname)
export const DATA=JSON.parse(readFileSync(path.join(HERE,'cf3-prod-step-1.data.json'),'utf8'))
const decode=v=>{try{return decodeURIComponent(v)}catch{return v}}
const DISPOSITION_KEYS=['state','export','indexable','sitemap','searchable','redirect','matchedArticle','releaseOverride']

/** @typedef {{action:string,[k:string]:any}} StepItem */
/** @typedef {(p:string,init?:{method?:string,body?:string})=>Promise<{status:number,body:any}>} StepApi */
/** @typedef {{meta:StepItem[],slotEdits:StepItem[],redirects:StepItem[],withdraw:StepItem[],lines:string[],counts:{meta:number,slotEdits:number,redirects:number,withdraw:number,unchanged:number,refused:number}}} StepPlan */

/**
 * Reads a route: the published record and the latest (draft) record.
 * @param {StepApi} api
 * @param {string} p
 */
async function route(api,p){
  const key=encodeURIComponent(decode(p))
  const published=(await api(`public-routes?where[pathKey][equals]=${key}&limit=1&depth=0&draft=false`)).body?.docs?.[0]??null
  const latest=(await api(`public-routes?where[pathKey][equals]=${key}&limit=1&depth=0&draft=true`)).body?.docs?.[0]??null
  return {published,latest}
}
const pendingDraft=r=>Boolean(r.latest&&r.published&&r.latest._status==='draft'&&r.latest.updatedAt!==r.published.updatedAt)

/**
 * Builds the plan from the current state. `api(path, init)` -> {status, body}. Reads only.
 * @param {StepApi} api
 * @param {any} [data]
 * @returns {Promise<StepPlan>}
 */
export async function planStep(api,data=DATA){
  /** @type {any} */
  const plan={meta:[],slotEdits:[],redirects:[],withdraw:[],lines:[]}
  const workingSeo=new Map() // one seo group per route, so two fields of one route go out in ONE write
  for(const m of data.meta??[]){
    const r=await route(api,m.path),pub=r.published
    if(!pub){plan.meta.push({...m,action:'REFUSE',reason:'published route record not found'});continue}
    if(pendingDraft(r)){plan.meta.push({...m,id:pub.id,action:'REFUSE',reason:'unpublished editor draft pending'});continue}
    const seo=pub.seo??{}
    const current=seo[m.field]??null // expectedOld null: a field the batch never wrote (the page shows its imported value)
    if(current===m.new)plan.meta.push({...m,id:pub.id,action:'UNCHANGED',current})
    else if(current===(m.expectedOld??null)){const next=workingSeo.get(m.path)??{...seo};next[m.field]=m.new;workingSeo.set(m.path,next);plan.meta.push({...m,id:pub.id,action:'UPDATE',current,seo:next})}
    else plan.meta.push({...m,id:pub.id,action:'REFUSE',current,reason:'the stored value is neither the seeded value nor the new one (edited since seed)'})
  }
  for(const page of data.slotEdits??[]){
    const r=await route(api,page.path),doc=r.latest??r.published
    if(!doc){for(const f of page.fixes)plan.slotEdits.push({path:page.path,key:f.key,row:f.row,action:'REFUSE',reason:'route record not found'});continue}
    if(pendingDraft(r)){for(const f of page.fixes)plan.slotEdits.push({path:page.path,key:f.key,row:f.row,action:'REFUSE',reason:'unpublished editor draft pending'});continue}
    const slots=(doc.slots??[]).map(slot=>({...slot}))
    let changed=false
    for(const f of page.fixes){
      const slot=slots.find(x=>x.key===f.key)
      const item={path:page.path,key:f.key,row:f.row}
      if(!slot){plan.slotEdits.push({...item,action:'REFUSE',reason:'the page element is missing'});continue}
      const now=slotFieldCanon(slot,f.field)
      if(now===f.afterCanon){plan.slotEdits.push({...item,action:'UNCHANGED'});continue}
      if(now!==f.before&&!(f.accept??[]).includes(now)){plan.slotEdits.push({...item,action:'REFUSE',current:now,reason:'the page element differs from its imported value (edited since; not overwritten)'});continue}
      slot[f.field]=f.after;changed=true
      plan.slotEdits.push({...item,action:'UPDATE',before:now,after:f.afterCanon})
    }
    if(changed){const mine=plan.slotEdits.filter(x=>x.path===page.path&&x.action==='UPDATE');for(const x of mine){x.id=doc.id;x.slots=slots;x.status=doc._status}}
  }
  const all=[];for(let page=1;;page++){const r=await api(`public-redirects?limit=500&page=${page}&depth=0`);if(r.status!==200)throw new Error(`read public-redirects failed (${r.status})`);all.push(...r.body.docs);if(!r.body.hasNextPage)break}
  const bySource=new Map(all.map(d=>[decode(String(d.source)),d]))
  for(const r of data.redirects??[]){
    const have=bySource.get(decode(r.source))
    if(!have)plan.redirects.push({...r,action:'CREATE'})
    else if(decode(String(have.destination))===decode(r.destination)&&have.active!==false)plan.redirects.push({...r,id:have.id,action:'UNCHANGED'})
    else plan.redirects.push({...r,id:have.id,action:'REFUSE',reason:`a record exists with destination ${have.destination}${have.active===false?' (inactive)':''}`})
  }
  for(const w of data.withdraw??[]){
    const r=await route(api,w.path),pub=r.published
    if(!pub){plan.withdraw.push({...w,action:'REFUSE',reason:'route record not found'});continue}
    const disp=pub.disposition??{}
    if(disp.state==='REDIRECT'&&pub._status!=='published'){plan.withdraw.push({...w,id:pub.id,action:'UNCHANGED'});continue}
    if(pendingDraft(r)){plan.withdraw.push({...w,id:pub.id,action:'REFUSE',reason:'unpublished editor draft pending'});continue}
    if(disp.state!=='PUBLIC'||pub._status!=='published'){plan.withdraw.push({...w,id:pub.id,action:'REFUSE',reason:`unexpected state ${disp.state}/${pub._status}`});continue}
    const next=Object.fromEntries(DISPOSITION_KEYS.map(k=>[k,disp[k]??null]))
    Object.assign(next,{state:'REDIRECT',export:false,indexable:false,sitemap:false,searchable:false,redirect:w.redirect})
    plan.withdraw.push({...w,id:pub.id,action:'WITHDRAW',disposition:next})
  }
  const fmt=(x,head,extra='')=>`${(x.action==='WITHDRAW'||x.action==='CREATE'||x.action==='UPDATE'?x.action:x.action).padEnd(9)} ${head}${extra}${x.reason?`  REFUSED: ${x.reason}`:''}`
  for(const m of plan.meta)plan.lines.push(fmt(m,`SEO ${m.field} ${m.path}`,m.action==='UPDATE'?`\n          old: ${m.current}\n          new: ${m.new}`:''))
  for(const s of plan.slotEdits)plan.lines.push(fmt(s,`TEXT ${s.row||s.key} ${s.path} (${s.key})`,s.action==='UPDATE'?`\n          old: ${s.before}\n          new: ${s.after}`:''))
  for(const r of plan.redirects)plan.lines.push(fmt(r,`301 ${r.source} -> ${r.destination}`))
  for(const w of plan.withdraw)plan.lines.push(fmt(w,`ROUTE ${w.path} -> REDIRECT ${w.redirect}`))
  const items=[...plan.meta,...plan.slotEdits,...plan.redirects,...plan.withdraw]
  plan.counts={meta:plan.meta.filter(x=>x.action==='UPDATE').length,slotEdits:plan.slotEdits.filter(x=>x.action==='UPDATE').length,redirects:plan.redirects.filter(x=>x.action==='CREATE').length,withdraw:plan.withdraw.filter(x=>x.action==='WITHDRAW').length,unchanged:items.filter(x=>x.action==='UNCHANGED').length,refused:items.filter(x=>x.action==='REFUSE').length}
  return plan
}

/**
 * Applies the non-refused items (fail fast), then reads back. Returns {written, problems}.
 * @param {StepApi} api
 * @param {StepPlan} plan
 * @param {any} [data]
 * @returns {Promise<{written:string[],problems:string[]}>}
 */
export async function applyStep(api,plan,data=DATA){
  /** @type {string[]} */
  const written=[]
  /** @type {string[]} */
  const problems=[]
  const ok=r=>r.status===200||r.status===201
  for(const x of plan.redirects.filter(r=>r.action==='CREATE')){
    const r=await api('public-redirects?depth=0',{method:'POST',body:JSON.stringify({source:x.source,destination:x.destination,status:'301',active:true,authority:'CF3-PROD-STEP-1 R2 (CT 2026-10-09)'})})
    if(!ok(r)){problems.push(`CREATE ${x.source} failed (${r.status})`);return {written,problems}}
    written.push(`301 ${x.source}`)
  }
  const pages=new Map()
  for(const s of plan.slotEdits.filter(x=>x.action==='UPDATE'))pages.set(s.path,s)
  for(const [p,s] of pages){
    const r=await api(`public-routes/${s.id}?depth=0`,{method:'PATCH',body:JSON.stringify({slots:s.slots,_status:s.status==='draft'?'draft':'published'})})
    if(!ok(r)){problems.push(`PATCH page elements ${p} failed (${r.status})`);return {written,problems}}
    written.push(`TEXT ${p}`)
  }
  const seoWrites=new Map()
  for(const m of plan.meta.filter(x=>x.action==='UPDATE'))seoWrites.set(m.id,m)
  for(const m of seoWrites.values()){
    const r=await api(`public-routes/${m.id}?depth=0`,{method:'PATCH',body:JSON.stringify({seo:m.seo,_status:'published'})})
    if(!ok(r)){problems.push(`PATCH ${m.path} failed (${r.status})`);return {written,problems}}
    written.push(`SEO ${m.path}`)
  }
  for(const w of plan.withdraw.filter(x=>x.action==='WITHDRAW')){
    const r=await api(`public-routes/${w.id}?depth=0`,{method:'PATCH',body:JSON.stringify({disposition:w.disposition,_status:'draft'})})
    if(!ok(r)){problems.push(`WITHDRAW ${w.path} failed (${r.status})`);return {written,problems}}
    written.push(`ROUTE ${w.path}`)
  }
  const after=await planStep(api,data)
  for(const x of [...after.meta,...after.slotEdits,...after.redirects,...after.withdraw])if(['UPDATE','CREATE','WITHDRAW'].includes(x.action))problems.push(`read-back: ${x.path??x.source} still needs ${x.action}`)
  return {written,problems}
}

async function main(){
  const env=process.env,args=process.argv
  const fail=(m,c=2)=>{process.stderr.write(`${m}\n`);process.exit(c)}
  const apply=args.includes('--apply')
  const BASE=(env.H2O_STEP_BASE_URL??'').replace(/\/+$/,'')
  if(!/^https?:\/\//.test(BASE))fail('H2O_STEP_BASE_URL is required')
  if(!env.H2O_STEP_ADMIN_EMAIL||!env.H2O_STEP_ADMIN_PASSWORD)fail('H2O_STEP_ADMIN_EMAIL and H2O_STEP_ADMIN_PASSWORD are required')
  let token=''
  const api=async(p,init={})=>{const res=await fetch(`${BASE}/api/${p}`,{...init,headers:{'content-type':'application/json',...(token?{authorization:`JWT ${token}`}:{}),...(init.headers??{})},signal:AbortSignal.timeout(60_000)});return {status:res.status,body:await res.json().catch(()=>null)}}
  const login=await api('users/login/',{method:'POST',body:JSON.stringify({email:env.H2O_STEP_ADMIN_EMAIL,password:env.H2O_STEP_ADMIN_PASSWORD})})
  if(login.status!==200||!login.body?.token)fail(`admin login failed (${login.status})`)
  token=String(login.body.token)
  try{const {completeMfa}=await import('../mfa/sign-in.mjs');await completeMfa(BASE,token,env.H2O_STEP_ADMIN_TOTP_SECRET,{envName:'H2O_STEP_ADMIN_TOTP_SECRET'})}catch(e){fail(String(e.message))}
  const plan=await planStep(api)
  process.stdout.write(plan.lines.join('\n')+'\n')
  const c=plan.counts,total=c.meta+c.slotEdits+c.redirects+c.withdraw
  if(apply&&!c.refused){const res=await applyStep(api,plan);process.stdout.write(`applied: ${res.written.join(', ')||'nothing'}\n`);if(res.problems.length){process.stderr.write(res.problems.join('\n')+'\n');process.exit(4)}}
  else if(apply)process.stdout.write('not applying: a target was refused; fix or rule on it first\n')
  process.stdout.write(`${total} changes (${c.meta} meta, ${c.slotEdits} text edits, ${c.redirects} redirects, ${c.withdraw} route withdrawals), ${c.unchanged} unchanged, ${c.refused} refused (${apply?'APPLY':'DRY-RUN'})\n`)
  if(c.refused)process.exit(3)
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))await main()
