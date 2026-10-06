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
 * R2.4 (CT 2026-10-05, SEO Checker items a c d f k; ./head-assertions.mjs):
 *   every HTML page above, plus every paginated archive, the nine template pages that had no head (six English services,
 *             two portfolios, /search/) and /thank-you/: og/twitter title and description mirror the served <title> and meta,
 *             og:url, og:image, twitter:card, the Organization and WebSite @ids, no legacy title suffix; a paginated archive
 *             names "Page N" and has a meta; /search/ and every empty archive root are noindex(,follow) and /thank-you/ noindex
 *             ("follow" is checked with --policy=production; staging serves noindex, nofollow everywhere)
 *   404       page 2+ of an archive that lists nothing public (src/content/empty-archives.ts, R2.4 R2)
 *   R2.5a: every archive taxonomy route that is not indexable expects noindex,follow (follow checked with --policy=production)
 *   301       is a 301 (a 308 fails), for the decided rows and every ledger redirect
 *   h1        every decided H1 (h1-fields.tsv: OGCS R1.2, the R2.2a ruling) is the page's served H1
 *   readiness /api/ready reports publication "current" after the checks: the served release covers the latest committed
 *             event (a backlog means some values above may not have been served yet; the run fails)
 *   HELD_FOR_CT_RULING  reported with its current status only
 * Typeform and other third parties are never requested. Exit 1 when any row fails.
 */
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {authorProblems,headProblems,paginationProblems,servedTitleOf,entities} from './head-assertions.mjs'

const [baseArg,...rest]=process.argv.slice(2)
const BASE=(baseArg??'').replace(/\/+$/,'')
if(!/^https?:\/\//.test(BASE)){process.stderr.write('usage: check-conformance.mjs <base-url> [--out report.json]\n');process.exit(2)}
const out=rest.includes('--out')?rest[rest.indexOf('--out')+1]:null
/** --policy=production: the origin serves the production indexing policy, so "follow" is checked too (staging serves
 * noindex, nofollow everywhere; there only "noindex" is asserted). */
const PRODUCTION_POLICY=rest.includes('--policy=production')
/** R2.4 R2 (CT 2026-10-05): the archives that list nothing public (src/content/empty-archives.ts, read as text). */
const EMPTY_ARCHIVES=[...readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'..','..','src/content/empty-archives.ts'),'utf8').matchAll(/^\s+'(\/[^']+)',$/gm)].map(m=>m[1])
const EMPTY_PAGES=new Set(EMPTY_ARCHIVES.filter(p=>/\/page\/\d+\/$/.test(p)))
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
  if(row.expect==='404')return r.status===404?{url:row.url,ok:true,emptyArchivePage:true}:fail(`empty archive page answers ${r.status}, not 404`)
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
      const head=headOf(r.body,row.url,{legacySuffix:false})
      if(head.length)return fail(`head: ${head.slice(0,3).join('; ')}`)
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
    const head=headOf(r.body,row.url)
    if(head.length)return fail(`head: ${head.slice(0,3).join('; ')}`)
    return {url:row.url,ok:true,...(row.meta_pending==='yes'?{metaPendingOgcs:true}:{})}
  }
  if(row.expect==='head'){
    if(r.status!==200)return fail('not 200')
    const head=headOf(r.body,row.url)
    // A paginated archive whose archive page itself has no meta yet has nothing to derive one from: reported (OGCS), not failed.
    const root=/^(.*\/)page\/\d+\/$/.exec(row.url)?.[1]
    if(root&&head.length===1&&head[0]==='no meta description'){const rr=await get(root);if(rr.status===200&&!metaValuesOf(rr.body,'description').length)return {url:row.url,ok:true,head:true,metaPendingOgcs:true,metaMissing:true}}
    return head.length?fail(`head: ${head.slice(0,3).join('; ')}`):{url:row.url,ok:true,head:true}
  }
  if(row.expect==='ledger-301'){
    if(r.status!==301)return fail(`ledger redirect answers ${r.status}, not 301`)
    const target=await get(r.location)
    return target.status===200?{url:row.url,ok:true,status:301}:fail(`target answers ${target.status} (chain or missing)`)
  }
  // 301
  let hop=r,framework=false
  if(row.framework_slash_hop==='yes'&&[301,308].includes(r.status)&&decode(r.location??'')===decode(row.url)+'/'){framework=true;hop=await get(r.location)}
  if(framework&&!ACCEPTED_SLASH_HOP.test(decode(row.url)))return fail('framework slash hop not accepted')
  if(![301,308].includes(hop.status))return fail(`not a redirect (${hop.status})`)
  if(hop.status!==301)return fail(`redirect answers ${hop.status}, not 301`)
  if(decode(hop.location??'')!==decode(row.target))return fail(`Location ${hop.location} ≠ ${row.target}`)
  const target=await get(hop.location)
  if(target.status!==200)return fail(`target answers ${target.status} (chain or missing)`)
  return {url:row.url,ok:true,status:hop.status,...(framework?{frameworkSlashHop:true}:{})}
}
/** R2.4 (CT rulings 2026-10-05): pages that must stay out of the index, whatever row checks them. */
// R2.5a (CT 2026-10-05): every archive taxonomy route that is not indexable is noindex,follow (its links stay followed)
const NOINDEX_ARCHIVES=JSON.parse(readFileSync(path.join(DATA,'..','..','..','content/release/route-ledger.json'),'utf8')).routes.filter(r=>r.state==='PUBLIC'&&r.export&&!r.indexable&&/^\/(?:category|product-category|product-tag|tag)\//.test(r.path)&&!EMPTY_PAGES.has(decode(r.path))).map(r=>decode(r.path))
const ROBOTS={'/search/':'noindex,follow','/thank-you/':'noindex',...Object.fromEntries(EMPTY_ARCHIVES.filter(p=>!EMPTY_PAGES.has(p)).map(p=>[p,'noindex,follow'])),...Object.fromEntries(NOINDEX_ARCHIVES.map(p=>[p,'noindex,follow']))}
const robotsProblems=(html,url)=>{
  const want=ROBOTS[decode(url)];if(!want)return []
  const robots=(metaValuesOf(html,'robots')[0]??'').toLowerCase()
  if(want==='noindex,follow'&&PRODUCTION_POLICY&&!(/\bnoindex\b/.test(robots)&&/(?:^|[ ,])follow\b/.test(robots)&&!/nofollow/.test(robots)))return [`robots "${robots}" ≠ noindex, follow`]
  if(!/\bnoindex\b/.test(robots))return [`robots "${robots}" is not noindex`]
  return []
}
/** R2.4: the head checks for one served page (title and meta as served). */
const metaValuesOf=(html,key)=>[...html.matchAll(/<meta\b[^>]*>/g)].map(m=>m[0]).filter(t=>new RegExp(`\\s(?:name|property)="${key}"`).test(t)).map(t=>entities((t.match(/\scontent="([^"]*)"/)||[])[1]??''))
const headOf=(html,url,options)=>{const title=servedTitleOf(html),meta=metaValuesOf(html,'description')[0]??'';return [...authorProblems(html).problems,...headProblems(html,{title,meta},{...options,projectPage:/^\/all-projects\/[^/]+\/$/.test(decode(url))}),...paginationProblems(decode(url.replace(/\?.*$/,'')),{title,meta}),...robotsProblems(html,url)]}
// R2.4 rows beyond the decisions: paginated archives, the template pages that had no head, the noindex pages, every ledger redirect.
{
  const ledgerAll=JSON.parse(readFileSync(path.join(DATA,'..','..','..','content/release/route-ledger.json'),'utf8'))
  const have=new Set(rows.map(r=>decode(r.url.replace(/\?.*$/,''))))
  const add=row=>{if(!have.has(decode(row.url))){rows.push(row);have.add(decode(row.url))}}
  // an empty archive's page N answers 404 (R2.4 R2); every other paginated archive carries the full head
  for(const r of ledgerAll.routes)if(r.state==='PUBLIC'&&r.export&&/\/page\/\d+\/$/.test(r.path))add(EMPTY_PAGES.has(decode(r.path))?{url:r.path,expect:'404'}:{url:r.path,expect:'head'})
  for(const p of ['/cooling-tower-rebuilds-new-towers/','/counterflow-cooling-tower-repair-maintenance/','/crossflow-cooling-tower-repair-maintenance/','/emergency-cooling-tower-repair/','/low-drift-cooling-tower-solutions/','/wet-hybrid-dry-cooling-tower-repair/'])add({url:p,expect:'head'})
  for(const r of ledgerAll.routes)if(r.state==='PUBLIC'&&r.export&&r.path.startsWith('/rt-portfolios/'))add({url:r.path,expect:'head'})
  for(const p of Object.keys(ROBOTS))add({url:p,expect:'head'})
  for(const r of ledgerAll.redirects)add({url:r.source,expect:'ledger-301'})
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
// R2.4: every decided H1 (OGCS R1.2 content decisions, the R2.2a ruling) is the page's served H1.
const h1File=path.join(DATA,'h1-fields.tsv')
if(existsSync(h1File)){
  const [hhead,...hlines]=readFileSync(h1File,'utf8').trimEnd().split('\n')
  const hcols=hhead.split('\t')
  for(const line of hlines){
    const row=Object.fromEntries(line.split('\t').map((v,i)=>[hcols[i],v]))
    if(!row.path)continue
    const r=await get(row.path)
    const h1=entities(((r.body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)||[])[1]??'').replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim()
    results.push(r.status===200&&h1===row.h1?{url:row.path,ok:true,h1:true}:{url:row.path,ok:false,status:r.status,reason:`h1 "${h1.slice(0,80)}" ≠ "${row.h1}"`})
  }
}
// R2.5: the recorded edits of the OGCS pre-flight fixes and CS161, as served: each new text present, each replaced sentence gone.
{
  const edits=JSON.parse(readFileSync(path.join(DATA,'claim-edits.json'),'utf8')).edits.filter(e=>e.row==='CS161'||String(e.row??'').startsWith('R25-OGCS-'))
  const byPage=new Map();for(const e of edits)byPage.set(e.path,[...(byPage.get(e.path)??[]),e])
  const norm=v=>entities(v.replace(/<[^>]+>/g,'')).replace(/[\s\u00a0]+/g,' ')
  for(const [p,list] of byPage){
    const r=await get(p)
    const text=norm(r.body)
    const missing=list.filter(e=>!text.includes(norm(e.replace??'').trim())).map(e=>`missing "${(e.replace??'').trim().slice(0,60)}"`)
    const stale=list.filter(e=>e.find.trim().length>30&&text.includes(norm(e.find).trim())).map(e=>`still serves "${e.find.trim().slice(0,60)}"`)
    const problems=r.status!==200?[`status ${r.status}`]:[...missing,...stale]
    results.push(problems.length?{url:p,ok:false,reason:`R2.5 edits: ${problems.slice(0,3).join('; ')}`}:{url:p,ok:true,r25Edits:list.length})
  }
}
// R2.4: the served release covers the latest committed event (readiness publication "current"), checked after every page.
{
  const publication=await fetch(BASE+'/api/ready',{redirect:'follow',signal:AbortSignal.timeout(30_000),headers:{'user-agent':'H2O-SEO-pass-conformance/1 (read-only)'}}).then(res=>res.json()).then(body=>body.publication??null).catch(()=>null)
  results.push(publication==='current'?{url:'/api/ready/',ok:true,publication}:{url:'/api/ready/',ok:false,reason:`publication "${publication}": the served release does not cover the latest committed event`})
}
const failures=results.filter(r=>!r.ok)
const summary={
  base:new URL(BASE).host,rows:rows.length,passed:results.filter(r=>r.ok&&!r.held).length,failed:failures.length,
  held:results.filter(r=>r.held).length,metaPendingOgcs:results.filter(r=>r.metaPendingOgcs).length,metaMissingPendingOgcs:results.filter(r=>r.metaMissing).map(r=>r.url),
  status308:results.filter(r=>r.status===308).length,headPages:results.filter(r=>r.head).length,emptyArchivePages404:results.filter(r=>r.emptyArchivePage).length,h1:results.filter(r=>r.h1).length,locale:results.filter(r=>r.locale).length,hreflangPages:hreflangSets.size,frameworkSlashHopAccepted:results.filter(r=>r.frameworkSlashHop).map(r=>r.url),
}
const report={summary,failures,held:results.filter(r=>r.held)}
if(out)writeFileSync(out,JSON.stringify({...report,results},null,1))
process.stdout.write(JSON.stringify(report,null,2)+'\n')
process.exit(failures.length?1:0)
