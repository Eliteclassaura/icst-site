/**
 * SERVICE-EDITS-STEP-3 (1.2f-FIX-A, CT 2026-10-11): the two English service pages whose copy changed in the repository (STAGING-AUDIT-COPY-FIXES-1,
 * OGCS CP-01..CP-03) after the review database had imported them. In payload mode a service is the DATABASE record (compose.ts: the record's
 * `title` and its edited page elements over the imported `document`), not the repository file, so the new words only reach the site through a write:
 *   - /wet-hybrid-dry-cooling-tower-repair/ : the record title (page title, H1 and "| ICS" head) "Wet, Hybrid, and Dry Cooling Tower" -> "... Repair and Maintenance";
 *   - /emergency-cooling-tower-repair/ : the lead (page element `service:lead`), "... can be scoped quickly." -> "... can be scoped.".
 * The request and FAQ headings ("Request an urgent repair assessment" and the like) are code-owned: EnglishServices.tsx now adds them from the build's
 * own service-pages.json in payload mode, so no write is needed for them.
 *
 * Same rules as cf3-prod-step-1: a value is written only when it holds exactly the expected old value; the new value is UNCHANGED; anything else
 * (edited since) is REFUSED, and so is a route with an unpublished editor draft. A lead edited by staff is never overwritten.
 *
 *   H2O_STEP_BASE_URL=https://... H2O_STEP_ADMIN_EMAIL=... H2O_STEP_ADMIN_PASSWORD=... [H2O_STEP_ADMIN_TOTP_SECRET=...] \
 *     node ops/prod-step/service-edits-step-3.mjs --dry-run | --apply
 * Expected first dry run: 2 changes (1 title, 1 lead), 0 unchanged, 0 refused; after --apply the rerun prints 0 changes, 2 unchanged.
 * Exit 3: a target was REFUSED (nothing is applied). Exit 4: a write or the read-back failed. After --apply the content release must be published/promoted.
 */
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'

const HERE=path.dirname(new URL(import.meta.url).pathname)
export const DATA=JSON.parse(readFileSync(path.join(HERE,'service-edits-step-3.data.json'),'utf8'))
/** The page-element hash of the importer (content-slots.ts hashValue): an element whose copy no longer hashes to `sourceHash` was edited. */
const hashValue=v=>createHash('sha256').update(JSON.stringify(v??null)).digest('hex').slice(0,32)

async function route(api,pathname){
  const key=encodeURIComponent(pathname)
  const read=async draft=>(await api(`public-routes?where[pathKey][equals]=${key}&limit=1&depth=0&draft=${draft}`)).body?.docs?.[0]??null
  return {published:await read(false),latest:await read(true)}
}

/** @param {(p:string,init?:{method?:string,body?:string})=>Promise<{status:number,body:any}>} api */
export async function planServiceEdits(api,data=DATA){
  /** @type {{items:any[],lines:string[],counts:{changes:number,unchanged:number,refused:number}}} */
  const plan={items:[],lines:[],counts:{changes:0,unchanged:0,refused:0}}
  for(const svc of data.serviceEdits??[]){
    const r=await route(api,svc.path),doc=r.latest??r.published
    const base={path:svc.path,row:svc.row}
    const refuse=(what,reason)=>plan.items.push({...base,what,action:'REFUSE',reason})
    if(!doc||!r.published){refuse('record','route record not found');continue}
    if(r.latest&&r.published&&r.latest._status==='draft'&&r.latest.updatedAt!==r.published.updatedAt){refuse('record','unpublished editor draft pending');continue}
    const slots=(doc.slots??[]).map(s=>({...s}))
    let title
    let changed=false
    if(svc.title){
      const now=doc.title??null
      if(now===svc.title.new)plan.items.push({...base,what:'title',action:'UNCHANGED'})
      else if(now===svc.title.expectedOld){title=svc.title.new;changed=true;plan.items.push({...base,what:'title',action:'UPDATE',before:now,after:svc.title.new})}
      else refuse('title',`the stored title is neither the imported value nor the new one (edited since): ${now}`)
    }
    for(const c of svc.copy??[]){
      const slot=slots.find(s=>s.key===c.key)
      if(!slot){refuse(c.key,'the page element is missing');continue}
      const now=slot.copy??''
      if(now===c.new)plan.items.push({...base,what:c.key,action:'UNCHANGED'})
      else if(hashValue(now)!==slot.sourceHash)refuse(c.key,'the page element was edited by staff (not overwritten)')
      else if(now===c.expectedOld){
        // sourceHash stays the importer's: the element now counts as edited, which is what makes compose.ts apply it over the imported document
        slot.copy=c.new;changed=true;plan.items.push({...base,what:c.key,action:'UPDATE',before:now,after:c.new})
      }else refuse(c.key,`the page element differs from its imported value: ${now}`)
    }
    if(changed)for(const x of plan.items.filter(i=>i.path===svc.path&&i.action==='UPDATE')){x.id=doc.id;x.title=title;x.slots=slots;x.status=doc._status}
  }
  for(const x of plan.items)plan.lines.push(`${x.action.padEnd(9)} ${x.row??''} ${x.path} (${x.what})${x.action==='UPDATE'?`\n          old: ${x.before}\n          new: ${x.after}`:''}${x.reason?`  REFUSED: ${x.reason}`:''}`)
  plan.counts={changes:plan.items.filter(x=>x.action==='UPDATE').length,unchanged:plan.items.filter(x=>x.action==='UNCHANGED').length,refused:plan.items.filter(x=>x.action==='REFUSE').length}
  return plan
}

export async function applyServiceEdits(api,plan,data=DATA){
  const written=[],problems=[]
  const pages=new Map()
  for(const x of plan.items.filter(i=>i.action==='UPDATE'))pages.set(x.path,x)
  for(const [p,x] of pages){
    const body={slots:x.slots,_status:x.status==='draft'?'draft':'published'}
    if(x.title!==undefined)body.title=x.title
    const r=await api(`public-routes/${x.id}?depth=0`,{method:'PATCH',body:JSON.stringify(body)})
    if(r.status!==200&&r.status!==201){problems.push(`PATCH ${p} failed (${r.status})`);return {written,problems}}
    written.push(p)
  }
  const after=await planServiceEdits(api,data)
  for(const x of after.items)if(x.action==='UPDATE')problems.push(`read-back: ${x.path} (${x.what}) still needs an update`)
  return {written,problems}
}

export async function main(data=DATA){
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
  const plan=await planServiceEdits(api,data)
  process.stdout.write(plan.lines.join('\n')+'\n')
  const c=plan.counts
  if(apply&&!c.refused){const res=await applyServiceEdits(api,plan,data);process.stdout.write(`applied: ${res.written.join(', ')||'nothing'}\n`);if(res.problems.length){process.stderr.write(res.problems.join('\n')+'\n');process.exit(4)}}
  else if(apply)process.stdout.write('not applying: a target was refused; fix or rule on it first\n')
  process.stdout.write(`${c.changes} changes, ${c.unchanged} unchanged, ${c.refused} refused (${apply?'APPLY':'DRY-RUN'})\n`)
  if(c.refused)process.exit(3)
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))await main()
