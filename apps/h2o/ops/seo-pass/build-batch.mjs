#!/usr/bin/env node
/**
 * MASTER SEO PASS R1 — batch builder (Control Tower brief 2026-10-04). Offline; writes data files only.
 *
 *   node ops/seo-pass/build-batch.mjs <decisions.tsv> <missing-metas.tsv> <content-check.json> <staging-probe.json> [ogcs-supplement.tsv]
 *
 * Inputs: OGCS H2O_MASTER_SEO_PASS_DECISIONS_2026-10-03.tsv (in H2O_MASTER_SEO_PASS_R1_2026-10-03.zip), the R1.1 missing
 * metas TSV, Main's content-check verdicts for the seven held articles, and a read-only probe of staging (status, Location,
 * title, meta per decided URL) that sets the dry-run expectations. An optional OGCS supplement (url, final_meta) replaces
 * metas that are pending OGCS (duplicates) or mechanically trimmed.
 *
 * Control Tower amendments applied here:
 *   - OGCS's two author rows are dropped (/author/tbozic/ and /author/faizasyed-ai/ keep their single-hop 301s to /author/timbozic/).
 *   - The malformed /aluminum-vs-frp-fan-blades/https:/www.tcf.com/… URL 301s to exactly /aluminum-vs-frp-fan-blades/.
 *   - Held articles publish only after a PASS content check; a FAIL takes OGCS's fallback 301 (and redirects that pointed at it
 *     follow the same fallback, so nothing chains).
 * Quote-only rule: a meta that opens with Buy/Order/Shop takes the accepted rewrite (site/public-text normalizeWave3ProductDescription);
 * a meta that then exceeds 158 characters is trimmed at its last clause boundary and flagged for OGCS.
 *
 * Order: run against the BASE content/release/route-ledger.json (canonical and state diffs are computed from it), then
 * regenerate the changed ledger rows from release/authority.mjs, which reads the content/release/seo-pass-r1.json written here.
 *
 * Outputs (ops/seo-pass/data/): conformance.tsv, redirects.tsv, seo-fields.tsv, route-dispositions.tsv, gone.tsv,
 * expectations.json, and content/release/seo-pass-r1.json (the authority overrides release/authority.mjs reads).
 */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const [decisionsFile,metasFile,contentFile,probeFile,supplementFile]=process.argv.slice(2)
if(!probeFile){process.stderr.write('usage: build-batch.mjs <decisions.tsv> <missing-metas.tsv> <content-check.json> <staging-probe.json> [supplement.tsv]\n');process.exit(2)}
const APP=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','..')
const OUT=path.join(APP,'ops/seo-pass/data')
const ORIGIN='https://h2ocooling.com'
/** Tab-separated with CSV-style quoting (OGCS quotes fields that contain a double quote: "28"" 34'"). */
function tsv(file){
  const text=readFileSync(file,'utf8').replace(/\r/g,''),rows=[];let row=[],field='',quoted=false
  for(let i=0;i<text.length;i++){
    const c=text[i]
    if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c;continue}
    if(c==='"'&&field==='')quoted=true
    else if(c==='\t'){row.push(field);field=''}
    else if(c==='\n'){row.push(field);rows.push(row);row=[];field=''}
    else field+=c
  }
  if(field||row.length){row.push(field);rows.push(row)}
  const [cols,...body]=rows.filter(r=>r.length>1||r[0])
  return body.map(r=>Object.fromEntries(cols.map((c,i)=>[c,r[i]??''])))
}
const writeTsv=(file,cols,rows)=>writeFileSync(path.join(OUT,file),[cols.join('\t'),...rows.map(row=>cols.map(c=>String(row[c]??'').replace(/[\t\n]/g,' ')).join('\t'))].join('\n')+'\n')
const safeDecode=v=>{try{return decodeURIComponent(v)}catch{return v}}
/** The request path a browser sends (percent-encoded), and its decoded key (what the proxy compares). */
const requestPath=url=>{const u=new URL(url);return {path:u.pathname,query:u.search,key:safeDecode(u.pathname)}}
const pathOf=url=>url?requestPath(url).path:''

const decisions=tsv(decisionsFile)
const missing=new Map(tsv(metasFile).map(r=>[r.url,r.final_meta]))
const supplement=new Map(supplementFile?tsv(supplementFile).map(r=>[r.url,r.final_meta]):[])
const content=JSON.parse(readFileSync(contentFile,'utf8'))
const probe=new Map(JSON.parse(readFileSync(probeFile,'utf8')).map(r=>[r.url,r]))
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8'))
const routeByKey=new Map(ledger.routes.map(r=>[safeDecode(r.path),r]))

const DROPPED=new Set([`${ORIGIN}/author/tbozic/`,`${ORIGIN}/author/faizasyed-ai/`])
/** Held for a Control Tower ruling (Main, 2026-10-04): OGCS consolidates two accepted designed pages (the Thermal luxury page,
 * linked from the main navigation, and the designed Japan country page) into undesigned live duplicates on 0-1 vs 1-29 clicks.
 * Not applied until ruled; the conformance contract marks them HELD_FOR_CT_RULING. */
const HELD_FOR_RULING=new Set(['/thermal-upgrade/','/cooling-tower-japan/'])
const verdict=new Map(content.articles.map(a=>[a.path,a]))
const failedHeld=new Map(content.articles.filter(a=>a.verdict==='FAIL').map(a=>[a.path,null]))
for(const d of decisions){const p=pathOf(d.url);if(failedHeld.has(p))failedHeld.set(p,pathOf(d.fallback_if_not_published))}

const QUOTE_ONLY=/^((?:[^?]+\?\s+)?)(?:Buy|Order|Shop)\b/i
const FORBIDDEN=/\b(buy|shop|shopping|price[sd]?|pricing|cheap|for sale|order now|add to cart|purchase)\b|\$|@|\+?\d[\d\s().-]{8,}\d/i
/** Over-length after the quote-only rewrite: keep the opening clause ("Request a quote for the <product>.") when that is a
 * complete meta of at least 70 characters, otherwise cut at the last clause boundary. Every trim is flagged for OGCS. */
function trimMeta(meta){
  if(meta.length<=158)return meta
  const first=meta.indexOf(', ')
  if(first>=70&&first<=157)return `${meta.slice(0,first).replace(/[\s,;:–—-]+$/,'')}.`
  const cut=meta.slice(0,158)
  const sentence=cut.lastIndexOf('. ')
  if(sentence>=70)return cut.slice(0,sentence+1)
  return null // no clean boundary: pending OGCS (a mid-phrase cut is never shipped)
}

/** A redirect target as the server serves it: the route's own path, or a file/page path matched case-insensitively
 * (OGCS keys are lower-cased; the served file keeps its original case). */
const restoreLedger=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/file-restore-ledger.json'),'utf8'))
const served=new Map()
for(const p of [...decisions.filter(d=>d.state==='200').map(d=>pathOf(d.url)),...ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export).map(r=>r.path),...restoreLedger.restored.map(f=>encodeURI(f.served_path)),...restoreLedger.already_present.map(f=>encodeURI(f.served_path))])served.set(safeDecode(p).toLowerCase(),p)
function resolveTarget(target){
  const route=routeByKey.get(safeDecode(target))
  if(route)return route.path
  return served.get(safeDecode(target).toLowerCase())??target
}
const conformance=[],redirects=[],seo=[],dispositions=[],gone=[]
const expect={redirects:{create:0,update:0,unchanged:0},routes:{publish:0,withdraw:0,index:0,canonical:0},seoFields:{update:0,unchanged:0,pendingOgcs:0},files:0,gone:0}
for(const d of decisions){
  if(DROPPED.has(d.url))continue
  const {path:reqPath,query,key}=requestPath(d.url)
  const now=probe.get(d.url)
  if(HELD_FOR_RULING.has(key)){conformance.push({url:reqPath,expect:'HELD_FOR_CT_RULING',target:pathOf(d.redirect_target)});continue}
  let state=d.state,target=d.redirect_target?pathOf(d.redirect_target):''
  const held=verdict.get(key)
  if(held&&held.verdict==='FAIL'){state='301';target=failedHeld.get(key)}
  if(state==='301'&&failedHeld.has(safeDecode(target)))target=failedHeld.get(safeDecode(target))
  if(state==='410'){gone.push({path:reqPath,query});conformance.push({url:reqPath+query,expect:'410'});expect.gone++;continue}
  if(state==='301'){
    // The proxy compares decoded paths; store the browser's encoded form (the collection refuses raw whitespace).
    const destination=resolveTarget(target)
    const live=now&&now.status===200
    const correct=now&&[301,308].includes(now.status)&&now.location&&safeDecode(now.location)===safeDecode(destination)
    const action=correct?'UNCHANGED':now&&[301,308].includes(now.status)&&now.location&&!/\/$/.test(key)&&safeDecode(now.location)===key+'/'?'CREATE':now&&[301,308].includes(now.status)?'UPDATE':'CREATE'
    const source=/\/$/.test(key)||/\.[A-Za-z0-9]{2,5}$/.test(key)?reqPath:`${reqPath}/`
    redirects.push({source,destination,status:'301',action,was:now?`${now.status} ${now.location??''}`.trim():'',live_route:live?'yes':'',clicks:d.gsc_clicks,reason:d.reason})
    expect.redirects[action.toLowerCase()]++
    if(live){const r=routeByKey.get(key);dispositions.push({path:r?r.path:reqPath,routeId:r?.routeId??'',action:'WITHDRAW_TO_REDIRECT',redirect:destination});expect.routes.withdraw++}
    conformance.push({url:reqPath+query,expect:'301',target:destination,framework_slash_hop:source!==reqPath?'yes':''})
    continue
  }
  // 200
  if(!d.final_title){conformance.push({url:reqPath+query,expect:'200',kind:query?'query-variant':'file'});continue}
  const route=routeByKey.get(key)
  let meta=supplement.get(d.url)??missing.get(d.url)??d.final_meta,origin=supplement.has(d.url)?'OGCS_SUPPLEMENT':missing.has(d.url)?'OGCS_R1_1':'OGCS'
  // "Buy … online" becomes "Request a quote for …"; the e-commerce "online" goes with it.
  if(QUOTE_ONLY.test(meta)){meta=meta.replace(QUOTE_ONLY,(_,opening)=>`${opening}Request a quote for`).replace(/\s+online(?=[,.;])/i,'');origin+='+QUOTE_ONLY'}
  if(meta.length>158){const trimmed=trimMeta(meta);if(trimmed){meta=trimmed;origin+='+MECHANICAL_TRIM'}else origin+='+PENDING_OGCS_LENGTH'}
  const canonical=d.canonical&&route&&safeDecode(d.canonical)!==safeDecode(route.canonical)?d.canonical:''
  seo.push({path:route?route.path:reqPath,routeId:route?.routeId??'',title:d.final_title,meta,canonical,meta_origin:origin,title_now:now?.title??'',meta_now:now?.meta??''})
  if(held&&held.verdict==='PASS'){dispositions.push({path:route.path,routeId:route.routeId,action:'PUBLISH'});expect.routes.publish++}
  if(canonical){dispositions.push({path:route.path,routeId:route.routeId,action:'CANONICAL',canonical});expect.routes.canonical++}
  conformance.push({url:reqPath,expect:'200',kind:'html',title:d.final_title,meta})
}
// Duplicate metas are pending OGCS (no copy is invented here): they are not written and are listed for OGCS.
const byMeta=new Map();for(const row of seo){byMeta.set(row.meta,[...(byMeta.get(row.meta)??[]),row])}
for(const rows of byMeta.values())if(rows.length>1)for(const row of rows)if(!supplement.has(ORIGIN+row.path)){row.meta_origin+='+PENDING_OGCS_DUPLICATE'}
const conformanceByPath=new Map(conformance.map(c=>[safeDecode(c.url),c]))
for(const row of seo){
  const pending=row.meta_origin.includes('PENDING_OGCS')
  // A pending meta is not written: conformance requires a meta to be present, not this text.
  if(pending){const c=conformanceByPath.get(safeDecode(row.path));if(c){c.meta='';c.meta_pending='yes'}}
  const changed=row.title!==row.title_now||(!pending&&row.meta!==row.meta_now)||Boolean(row.canonical)
  row.action=changed?'UPDATE':'UNCHANGED'
  if(pending)expect.seoFields.pendingOgcs++
  expect.seoFields[changed?'update':'unchanged']++
}
// The ranking pages that ship noindex today and list public items (Control Tower ruling): indexable.
const INDEX=['/product-category/gearboxes/','/product-category/drive-shafts-assemblies/','/product-category/motors/','/product-category/drift-eliminators/','/product-category/nozzles/']
for(const p of INDEX){const r=routeByKey.get(p);dispositions.push({path:r.path,routeId:r.routeId,action:'INDEX'});expect.routes.index++}
const restore=restoreLedger
expect.files=restore.restored.length

// Rule checks (the brief's limits): a failure stops the build.
const problems=[]
const titles=new Set();for(const row of seo){if(row.title.length>69)problems.push(`title>69 ${row.path}`);if(titles.has(row.title))problems.push(`duplicate title ${row.path}`);titles.add(row.title);if(FORBIDDEN.test(row.title))problems.push(`title word ${row.path}`)}
for(const row of seo){if(row.meta_origin.includes('PENDING_OGCS'))continue;if(row.meta.length<70||row.meta.length>158)problems.push(`meta length ${row.path} ${row.meta.length}`);if(FORBIDDEN.test(row.meta))problems.push(`meta word ${row.path}: ${row.meta.match(FORBIDDEN)[0]}`)}
const sources=new Set(redirects.map(r=>safeDecode(r.source)))
const ok200=new Set([...served.values()].map(safeDecode))
for(const r of redirects){
  const dest=safeDecode(r.destination)
  if(sources.has(dest))problems.push(`chain ${r.source} -> ${r.destination}`)
  if(dest===safeDecode(r.source))problems.push(`self ${r.source}`)
  if(!ok200.has(dest)&&!['/author/timbozic/'].includes(dest))problems.push(`target not 200 ${r.source} -> ${r.destination}`)
}
if(sources.size!==redirects.length)problems.push('duplicate redirect source')

mkdirSync(OUT,{recursive:true})
writeTsv('conformance.tsv',['url','expect','target','kind','title','meta','meta_pending','framework_slash_hop'],conformance)
writeTsv('redirects.tsv',['source','destination','status','action','was','live_route','clicks','reason'],redirects)
writeTsv('seo-fields.tsv',['path','routeId','action','title','meta','canonical','meta_origin','title_now','meta_now'],seo)
writeTsv('route-dispositions.tsv',['path','routeId','action','redirect','canonical'],dispositions)
writeTsv('gone.tsv',['path','query'],gone)
const pending=seo.filter(r=>r.meta_origin.includes('PENDING_OGCS')||r.meta_origin.includes('MECHANICAL_TRIM'))
writeTsv('ogcs-meta-requests.tsv',['path','reason','current_batch_meta','title'],pending.map(r=>({path:r.path,reason:r.meta_origin.includes('PENDING_OGCS_DUPLICATE')?'DUPLICATE_META':r.meta_origin.includes('PENDING_OGCS_LENGTH')?'TOO_LONG_AFTER_QUOTE_ONLY_REWRITE_NO_CLEAN_TRIM':'TRIMMED_AFTER_QUOTE_ONLY_REWRITE_REVIEW',current_batch_meta:r.meta,title:r.title})))
writeFileSync(path.join(OUT,'expectations.json'),JSON.stringify({rows:conformance.length,redirects:redirects.length,seoFields:seo.length,expect,problems},null,2)+'\n')
const overrides={
  note:'Master SEO Pass R1 (Control Tower brief 2026-10-04): release authority overrides, mirrored by the scripted Payload batch.',
  publish:dispositions.filter(d=>d.action==='PUBLISH').map(d=>d.path),
  canonical:Object.fromEntries(dispositions.filter(d=>d.action==='CANONICAL').map(d=>[d.path,d.canonical])),
  index:INDEX,
  redirectSources:Object.fromEntries(dispositions.filter(d=>d.action==='WITHDRAW_TO_REDIRECT').map(d=>[d.path,d.redirect])),
}
writeFileSync(path.join(APP,'content/release/seo-pass-r1.json'),JSON.stringify(overrides,null,2)+'\n')
process.stdout.write(JSON.stringify({rows:conformance.length,redirects:redirects.length,seoFields:seo.length,expect,problems:problems.length,firstProblems:problems.slice(0,12)},null,2)+'\n')
if(problems.length)process.exit(1)
