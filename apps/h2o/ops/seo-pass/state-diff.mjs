#!/usr/bin/env node
/**
 * R2.5 (Control Tower ruling, fresh production database): find state that lives only in one database. Read-only.
 *
 *   node ops/seo-pass/state-diff.mjs export <origin> --out <file.json>     (admin sign-in as apply-seo-pass: H2O_SEO_ADMIN_*)
 *   node ops/seo-pass/state-diff.mjs compare <a.json> <b.json> [--out report.json]
 *
 * Export reads, through the REST API with GETs only:
 *   - public-routes: per path, the published status, disposition, title, seo (title, description, canonical), the page
 *     elements (slots) and restored sections;
 *   - public-redirects: per source, destination, status, active;
 *   - the site-chrome global (navigation and footer content);
 *   - record COUNTS of media, products, product categories and manufacturers (their content belongs to the catalog and CRM;
 *     a count difference names a collection to reconcile). Users and CRM records are never read.
 * Compare prints every path, source or field that differs, and what exists on one side only. Run it on staging and on a
 * fresh-replay rehearsal database (authority import + the latest batch): anything only on staging is state a fresh production
 * database would not have.
 */
import {readFileSync,writeFileSync} from 'node:fs'
import {completeMfa} from '../mfa/sign-in.mjs'

const [mode,a,b]=process.argv.slice(2)
const outFile=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:null
const fail=m=>{process.stderr.write(`state-diff: ${m}\n`);process.exit(2)}
const decode=v=>{try{return decodeURIComponent(v)}catch{return v}}
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>!['id','createdAt','updatedAt','_order','blockName'].includes(k)).map(k=>[k,stable(v[k])])):v

async function exportState(origin){
  const BASE=origin.replace(/\/+$/,'')
  if(!/^https?:\/\//.test(BASE))fail('export needs an origin URL')
  let token=''
  const api=async p=>{const res=await fetch(`${BASE}/api/${p}`,{headers:{'content-type':'application/json',...(token?{authorization:`JWT ${token}`}:{})},signal:AbortSignal.timeout(60_000)});return {status:res.status,body:await res.json().catch(()=>null)}}
  const login=await fetch(`${BASE}/api/users/login/`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.H2O_SEO_ADMIN_EMAIL,password:process.env.H2O_SEO_ADMIN_PASSWORD}),signal:AbortSignal.timeout(60_000)})
  const lb=await login.json().catch(()=>null)
  if(login.status!==200||!lb?.token)fail(`admin login failed (${login.status})`)
  token=String(lb.token)
  try{await completeMfa(BASE,token,process.env.H2O_SEO_ADMIN_TOTP_SECRET,{envName:'H2O_SEO_ADMIN_TOTP_SECRET'})}catch(e){fail(String(e.message))}
  const all=async(collection,select)=>{const out=[];for(let page=1;;page++){const r=await api(`${collection}?limit=200&page=${page}&depth=0&draft=false${select}`);if(r.status!==200)fail(`read ${collection} failed (${r.status})`);out.push(...r.body.docs);if(!r.body.hasNextPage)return out}}
  const sel=['path','title','seo','disposition','_status','slots','restoredSections'].map(f=>`&select[${f}]=true`).join('')
  const routes=Object.fromEntries((await all('public-routes',sel)).map(d=>[decode(String(d.path)),stable({status:d._status,disposition:d.disposition,title:d.title,seo:{title:d.seo?.title??null,description:d.seo?.description??null,canonical:d.seo?.canonical??null},slots:d.slots??null,restoredSections:d.restoredSections??null})]))
  const redirects=Object.fromEntries((await all('public-redirects','')).map(d=>[decode(String(d.source)),{destination:decode(String(d.destination)),status:String(d.status),active:d.active!==false}]))
  const chrome=await api('globals/site-chrome?depth=0&draft=false')
  const counts={}
  for(const c of ['media','products','product-categories','manufacturers']){const r=await api(`${c}?limit=1&depth=0`);counts[c]=r.status===200?r.body.totalDocs:`unreadable (${r.status})`}
  return {origin:new URL(BASE).host,exportedAt:new Date().toISOString(),routes,redirects,siteChrome:stable(chrome.body??null),counts}
}

function compare(A,B){
  const report={a:A.origin,b:B.origin,routes:{onlyA:[],onlyB:[],differ:[]},redirects:{onlyA:[],onlyB:[],differ:[]},siteChrome:null,counts:{}}
  for(const p of Object.keys(A.routes))if(!(p in B.routes))report.routes.onlyA.push(p)
  for(const p of Object.keys(B.routes))if(!(p in A.routes))report.routes.onlyB.push(p)
  for(const p of Object.keys(A.routes))if(p in B.routes){
    const fields=['status','disposition','title','seo','slots','restoredSections'].filter(f=>JSON.stringify(A.routes[p][f])!==JSON.stringify(B.routes[p][f]))
    if(fields.length)report.routes.differ.push({path:p,fields})
  }
  for(const s of Object.keys(A.redirects))if(!(s in B.redirects))report.redirects.onlyA.push({source:s,...A.redirects[s]})
  for(const s of Object.keys(B.redirects))if(!(s in A.redirects))report.redirects.onlyB.push({source:s,...B.redirects[s]})
  for(const s of Object.keys(A.redirects))if(s in B.redirects&&JSON.stringify(A.redirects[s])!==JSON.stringify(B.redirects[s]))report.redirects.differ.push({source:s,a:A.redirects[s],b:B.redirects[s]})
  report.siteChrome=JSON.stringify(A.siteChrome)===JSON.stringify(B.siteChrome)?'identical':'DIFFERS'
  for(const c of new Set([...Object.keys(A.counts),...Object.keys(B.counts)]))report.counts[c]={a:A.counts[c],b:B.counts[c],equal:A.counts[c]===B.counts[c]}
  report.summary={routesOnlyA:report.routes.onlyA.length,routesOnlyB:report.routes.onlyB.length,routesDiffer:report.routes.differ.length,redirectsOnlyA:report.redirects.onlyA.length,redirectsOnlyB:report.redirects.onlyB.length,redirectsDiffer:report.redirects.differ.length,siteChrome:report.siteChrome,countsDiffer:Object.entries(report.counts).filter(([,v])=>!v.equal).map(([k])=>k)}
  return report
}

if(mode==='export'){
  if(!a||!outFile)fail('usage: state-diff.mjs export <origin> --out <file.json>')
  const state=await exportState(a)
  writeFileSync(outFile,JSON.stringify(state)+'\n')
  process.stdout.write(JSON.stringify({origin:state.origin,routes:Object.keys(state.routes).length,redirects:Object.keys(state.redirects).length,counts:state.counts})+'\n')
}else if(mode==='compare'){
  if(!a||!b)fail('usage: state-diff.mjs compare <a.json> <b.json> [--out report.json]')
  const report=compare(JSON.parse(readFileSync(a,'utf8')),JSON.parse(readFileSync(b,'utf8')))
  if(outFile)writeFileSync(outFile,JSON.stringify(report,null,1)+'\n')
  process.stdout.write(JSON.stringify(report.summary,null,2)+'\n')
}else fail('usage: state-diff.mjs export <origin> --out <file.json> | compare <a.json> <b.json> [--out report.json]')
