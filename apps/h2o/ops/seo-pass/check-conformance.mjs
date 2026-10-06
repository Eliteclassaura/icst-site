#!/usr/bin/env node
/**
 * MASTER SEO PASS R1 — conformance checker (read-only GETs). Runs against staging after deploy and the batch.
 *
 *   node ops/seo-pass/check-conformance.mjs <base-url> [--out report.json]
 *
 * For each row of data/conformance.tsv (1,003 decisions = OGCS 1,005 minus the two author rows):
 *   200 html  status 200, <title> equals the decided title, exactly one meta description, equal to the decided meta
 *             (present only, for a meta pending OGCS), and exactly one canonical link equal to the release authority's
 *             canonical for the path (content/release/route-ledger.json; R3.1, CT 2026-10-05: a reverted canonical is caught)
 *   200 locale (Locale Part B) status 200, `<html lang>` = the page language (OGCS Part A; the content language for the swapped
 *             pair), exactly one self canonical. Every HTML page's hreflang set is collected, and every page a set names must
 *             name the identical set (reciprocity), self included.
 *   200 file  status 200 and not an HTML page
 *   301       status 301/308, Location equals the decided target, and the target answers 200 (one hop, no chain)
 *             A decided source with no trailing slash and no file extension first receives the framework's own
 *             trailing-slash 308 (Next.js, before the proxy); that hop is reported as FRAMEWORK_SLASH_HOP, not hidden.
 *             Control Tower accepted it (308 → 301 → 200) for the malformed tcf.com URL only (ruling 3, 2026-10-04); a framework
 *             hop on any other source fails.
 *   410       status 410
 *   HELD_FOR_CT_RULING  reported with its current status only
 * Typeform and other third parties are never requested. Exit 1 when any row fails.
 */
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const [baseArg,...rest]=process.argv.slice(2)
const BASE=(baseArg??'').replace(/\/+$/,'')
if(!/^https?:\/\//.test(BASE)){process.stderr.write('usage: check-conformance.mjs <base-url> [--out report.json]\n');process.exit(2)}
const out=rest.includes('--out')?rest[rest.indexOf('--out')+1]:null
const DATA=path.join(path.dirname(new URL(import.meta.url).pathname),'data')
const [head,...lines]=readFileSync(path.join(DATA,'conformance.tsv'),'utf8').trimEnd().split('\n')
const cols=head.split('\t'),rows=lines.map(line=>Object.fromEntries(line.split('\t').map((v,i)=>[cols[i],v])))
const decode=v=>{try{return decodeURIComponent(v)}catch{return v}}
const ORIGIN='https://h2ocooling.com'
const authority=new Map(JSON.parse(readFileSync(path.join(DATA,'..','..','..','content/release/route-ledger.json'),'utf8')).routes.map(r=>[decode(r.path),r.canonical||ORIGIN+r.path]))
const urlKey=u=>{try{const x=new URL(u);return x.origin+decode(x.pathname)}catch{return u}}
const localeData=JSON.parse(readFileSync(path.join(DATA,'..','..','..','content/locale/sitemap-locale.json'),'utf8'))
const languageOf=p=>localeData.contentLanguages?.[decode(p)]??localeData.languages[decode(p)]??'en'
/** page key → its hreflang set as served (for the reciprocity pass) */
const hreflangSets=new Map()
const alternatesIn=body=>[...body.matchAll(/<link[^>]+rel="alternate"[^>]*>/g)].map(m=>[(m[0].match(/hreflang="([^"]*)"/)||[])[1],(m[0].match(/href="([^"]*)"/)||[])[1]]).filter(([h,u])=>h&&u).map(([h,u])=>[h,entities(u)])
/** Framework trailing-slash hops Control Tower accepted (ruling 3, 2026-10-04). */
const ACCEPTED_SLASH_HOP=/^\/aluminum-vs-frp-fan-blades\/https:\/www\.tcf\.com\//
const entities=s=>s.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&quot;/g,'"').replace(/&apos;|&#039;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
async function get(url){
  for(let attempt=0;;attempt++){
    try{
      const res=await fetch(BASE+url,{redirect:'manual',signal:AbortSignal.timeout(30_000),headers:{'user-agent':'H2O-SEO-pass-conformance/1 (read-only)'}})
      const type=res.headers.get('content-type')??''
      const body=res.status===200&&/html/.test(type)?await res.text():(await res.arrayBuffer(),'')
      const location=res.headers.get('location')
      return {status:res.status,type,body,location:location?new URL(location,BASE).pathname:null}
    }catch(error){if(attempt>=2)return {status:-1,type:'',body:'',location:null,error:String(error).slice(0,120)}}
  }
}
async function check(row){
  const r=await get(row.url)
  const fail=reason=>({url:row.url,expect:row.expect,status:r.status,ok:false,reason})
  if(row.expect==='HELD_FOR_CT_RULING')return {url:row.url,expect:row.expect,status:r.status,location:r.location,ok:true,held:true}
  if(row.expect==='410')return r.status===410?{url:row.url,ok:true}:fail('not 410')
  if(row.expect==='200'){
    if(r.status!==200)return fail('not 200')
    if(row.kind==='file')return /html/.test(r.type)?fail('file answered as HTML'):{url:row.url,ok:true}
    if(row.kind==='query-variant')return /html/.test(r.type)?{url:row.url,ok:true}:fail('query variant not an HTML page')
    const alternates=alternatesIn(r.body)
    if(alternates.length)hreflangSets.set(urlKey(ORIGIN+row.url),alternates)
    const lang=(r.body.match(/<html[^>]*\blang="([^"]*)"/)||[])[1]??''
    if(lang!==languageOf(row.url))return fail(`html lang "${lang}" ≠ "${languageOf(row.url)}"`)
    if(row.kind==='locale'){
      const canonicals=[...r.body.matchAll(/<link[^>]+rel="canonical"[^>]*>/g)].map(m=>entities((m[0].match(/href="([^"]*)"/)||[])[1]??''))
      const decided=authority.get(decode(row.url))
      if(!decided||canonicals.length!==1||urlKey(canonicals[0])!==urlKey(decided))return fail(`canonical ${canonicals.join(' ')||'(none)'} ≠ ${decided}`)
      return {url:row.url,ok:true,locale:true,alternates:alternates.length}
    }
    const title=entities((r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/)||[])[1]??'')
    const metas=[...r.body.matchAll(/<meta name="description" content="([^"]*)"/g)].map(m=>entities(m[1]))
    if(title!==row.title)return fail(`title "${title}" ≠ "${row.title}"`)
    // A meta pending OGCS is not written: a page with no description yet is reported, not passed silently.
    if(row.meta_pending==='yes'&&metas.length===0)return {url:row.url,ok:true,metaPendingOgcs:true,metaMissing:true}
    if(metas.length!==1)return fail(`${metas.length} meta descriptions`)
    if(row.meta_pending!=='yes'&&metas[0]!==row.meta)return fail(`meta differs: "${metas[0].slice(0,80)}"`)
    const canonicals=[...r.body.matchAll(/<link[^>]+rel="canonical"[^>]*>/g)].map(m=>entities((m[0].match(/href="([^"]*)"/)||[])[1]??''))
    const decided=authority.get(decode(row.url))
    if(decided&&(canonicals.length!==1||urlKey(canonicals[0])!==urlKey(decided)))return fail(`canonical ${canonicals.join(' ')||'(none)'} ≠ ${decided}`)
    return {url:row.url,ok:true,...(row.meta_pending==='yes'?{metaPendingOgcs:true}:{})}
  }
  // 301
  let hop=r,framework=false
  if(row.framework_slash_hop==='yes'&&[301,308].includes(r.status)&&decode(r.location??'')===decode(row.url)+'/'){framework=true;hop=await get(r.location)}
  if(framework&&!ACCEPTED_SLASH_HOP.test(decode(row.url)))return fail('framework slash hop not accepted')
  if(![301,308].includes(hop.status))return fail(`not a redirect (${hop.status})`)
  if(decode(hop.location??'')!==decode(row.target))return fail(`Location ${hop.location} ≠ ${row.target}`)
  const target=await get(hop.location)
  if(target.status!==200)return fail(`target answers ${target.status} (chain or missing)`)
  return {url:row.url,ok:true,status:hop.status,...(framework?{frameworkSlashHop:true}:{})}
}
const results=[]
for(let i=0;i<rows.length;i+=6)results.push(...await Promise.all(rows.slice(i,i+6).map(check)))
// Content assertions (SEO parity Part 2 R2): restored live sections and live H1s are served on their pages.
const assertionsFile=path.join(DATA,'content-assertions.tsv')
if(existsSync(assertionsFile)){
  const [ahead,...alines]=readFileSync(assertionsFile,'utf8').trimEnd().split('\n')
  const acols=ahead.split('\t')
  const byPage=new Map()
  for(const line of alines){const row=Object.fromEntries(line.split('\t').map((v,i)=>[acols[i],v]));if(row.path)byPage.set(row.path,[...(byPage.get(row.path)??[]),row])}
  for(const [p,list] of byPage){
    const r=await get(p)
    const strip=v=>entities(v.replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim().toLowerCase()
    const served={h1:[...r.body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>strip(m[1])),h2:[...r.body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map(m=>strip(m[1]))}
    const missing=r.status!==200?list.map(a=>a.text):list.filter(a=>!served[a.kind]?.includes(a.text.replace(/\s+/g,' ').trim().toLowerCase())).map(a=>`${a.kind}: ${a.text}`)
    results.push(missing.length?{url:p,ok:false,reason:`restored content missing: ${missing.slice(0,4).join(' | ')}`,status:r.status}:{url:p,ok:true,contentAssertions:list.length})
  }
}
// hreflang reciprocity: every page a served set names serves the identical set (self included). A named page that is not a
// conformance row is fetched for its set.
{
  for(const set of [...hreflangSets.values()])for(const [,u] of set){
    const k=urlKey(u);if(hreflangSets.has(k))continue
    const r=await get(new URL(u).pathname);hreflangSets.set(k,r.status===200?alternatesIn(r.body):[])
  }
  const sig=set=>JSON.stringify(set.map(([h,u])=>`${h} ${urlKey(u)}`).sort())
  for(const [page,set] of hreflangSets){
    if(!set.length)continue // a named page without a set is reported by the pages that name it
    const problems=[]
    if(!set.some(([,u])=>urlKey(u)===page))problems.push('no self reference')
    for(const [,u] of set){const other=hreflangSets.get(urlKey(u));if(urlKey(u)===page)continue;if(!other)problems.push(`${u} serves no hreflang set (or was not checked)`);else if(sig(other)!==sig(set))problems.push(`${u} serves a different set`)}
    results.push(problems.length?{url:new URL(page).pathname,ok:false,reason:`hreflang: ${problems.slice(0,3).join('; ')}`}:{url:new URL(page).pathname,ok:true,hreflangReciprocal:true})
  }
}
const failures=results.filter(r=>!r.ok)
const summary={
  base:new URL(BASE).host,rows:rows.length,passed:results.filter(r=>r.ok&&!r.held).length,failed:failures.length,
  held:results.filter(r=>r.held).length,metaPendingOgcs:results.filter(r=>r.metaPendingOgcs).length,metaMissingPendingOgcs:results.filter(r=>r.metaMissing).map(r=>r.url),
  status308:results.filter(r=>r.status===308).length,locale:results.filter(r=>r.locale).length,hreflangPages:hreflangSets.size,frameworkSlashHopAccepted:results.filter(r=>r.frameworkSlashHop).map(r=>r.url),
}
const report={summary,failures,held:results.filter(r=>r.held)}
if(out)writeFileSync(out,JSON.stringify({...report,results},null,1))
process.stdout.write(JSON.stringify(report,null,2)+'\n')
process.exit(failures.length?1:0)
