#!/usr/bin/env node
/**
 * MASTER SEO PASS — batch builder (R1: Control Tower brief 2026-10-04; Part 2: CT SEO parity follow-up R1). Offline; writes
 * data files only.
 *
 *   node ops/seo-pass/build-batch.mjs <decisions.tsv> <missing-metas.tsv> <content-check.json> <staging-probe.json> [ogcs-supplement.tsv] [--baseline=<dir>]
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
 * Part 2 (CT rulings 2026-10-04):
 *   - The two held designed pages are KEPT and the live duplicates 301 into them (REVERSED_FOR_DESIGNED below). The designed
 *     page keeps its current title and meta (conformance pins them; nothing is written to it); the duplicate is withdrawn.
 *   - Every redirect destination is repointed to its final destination (repointToFinal), so a reversal or a later decision can
 *     never create a chain; a loop stops the build.
 *   - OGCS supplement R1.2 (url, final_meta) supplies the 27 pending metas and 9 optional replacements.
 *   - FACTUAL_CORRECTIONS: a model number that contradicts the product's own title and route is corrected (disclosed).
 *   - OGCS Part 1 R1.2 (CT accepted 2026-10-05): --title-delta=<tsv> sets the R1.2 final titles (RESTORE_LIVE_TITLE, RESTORE_TERM,
 *     STANDARDISE_FAN_SUFFIX; REJECT_QUERY / NO_CHANGE rows change nothing) and STATE_CHANGE_301_TO_200 un-consolidates a page;
 *     --dup-resolution=<tsv> supplies the final meta of rows the delta changes. A delta title aimed at a 301 source is skipped and
 *     reported (deltaSkipped). A page that returns from 301 to 200 is re-published and its redirect record retired
 *     (redirects-retired.tsv: active:false, never deleted).
 *   - --content-decisions=<tsv>: the decided H1 of pages whose body stays (KEEP_STAGING_VERSION / RESTORE_SECTIONS) is written to
 *     the page's h1 heading slot (h1-fields.tsv). H1s that arrive with a restored live body ship with that body.
 *   - --meta-rewrites=<tsv> (path, old_meta, new_meta): CT ruling 2026-10-05 — OGCS finals that end in a truncation mark are
 *     rewritten as complete sentences (no new claims); a row applies only when the batch meta still equals old_meta.
 *   - CONTENT_FALLBACKS: a content decision's fallback 301, applied while the restoration has not shipped.
 *   - --claims-seo=<tsv> (row, path, field, old, new): R2.2 ruled title/meta strings (OGCS claims sweep R1, CT 2026-10-05); Round 5: field h1, a ruled page heading.
 *   - R2.4: --seo-set=<tsv> (path, field, value, reason) sets decided titles/metas (OGCS R2.4 R1); --ct-decisions takes several
 *     files (comma-separated). The batch also normalises stored redirect statuses to 301 (redirect-status.tsv).
 *   - --baseline=<dir>: the data directory of the batch already applied on staging (R1). Actions and expectations are then the
 *     delta against that applied state, so the dry run counts exactly what this round changes.
 *
 * Order: run against the BASE content/release/route-ledger.json (canonical and state diffs are computed from it), then
 * regenerate the changed ledger rows from release/authority.mjs, which reads the content/release/seo-pass-r1.json written here.
 *
 * Outputs (ops/seo-pass/data/): conformance.tsv, redirects.tsv, seo-fields.tsv, route-dispositions.tsv, gone.tsv,
 * expectations.json, and content/release/seo-pass-r1.json (the authority overrides release/authority.mjs reads).
 */
import {existsSync,mkdirSync,readdirSync,readFileSync,statSync,unlinkSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const flags=process.argv.slice(2).filter(a=>a.startsWith('--')),positional=process.argv.slice(2).filter(a=>!a.startsWith('--'))
const [decisionsFile,metasFile,contentFile,probeFile,supplementFile]=positional
const flag=name=>flags.find(f=>f.startsWith(`--${name}=`))?.slice(name.length+3)
const baselineDir=flag('baseline'),titleDeltaFile=flag('title-delta'),dupResolutionFile=flag('dup-resolution'),contentDecisionsFile=flag('content-decisions'),restoredFile=flag('restored'),metaRewritesFile=flag('meta-rewrites'),ctDecisionsFile=flag('ct-decisions'),localePartAFile=flag('locale-part-a'),localeRepointFile=flag('locale-repoint'),localeOverridesFile=flag('locale-overrides')
if(!probeFile){process.stderr.write('usage: build-batch.mjs <decisions.tsv> <missing-metas.tsv> <content-check.json> <staging-probe.json> [supplement.tsv] [--baseline=<dir>]\n');process.exit(2)}
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

/** Control Tower ruling (2026-10-04, SEO Pass R1 acceptance): keep the accepted designed page, 301 the live duplicate into it.
 * designed page -> the duplicate OGCS had chosen as the winner. */
const REVERSED_FOR_DESIGNED=new Map([['/thermal-upgrade/','/cooling-tower-thermal-upgrade/'],['/cooling-tower-japan/','/cooling-towers-construction-repair-in-japan/']])
/** A model number that contradicts the product's own title, H1 and route (CT parity audit risk 6). Disclosed in the return. */
const REVERSED_DUPLICATE=new Set([...REVERSED_FOR_DESIGNED.values()])
const FACTUAL_CORRECTIONS=new Map([['/product/tuf-lite-ii-5000h-series-hub-fan-assemblies/',[/\b6000H\b/g,'5000H']]])
const decisions=tsv(decisionsFile).map(d=>({...d}))
/** --ct-decisions=<tsv> (url, state, redirect_target, final_title, final_meta, reason): Control Tower rulings on URLs the OGCS
 * decisions do not cover (sitemap parity, CT 2026-10-05). Same meaning as an OGCS decision row; a URL OGCS already decided
 * stops the build. */
// R2.4: several files, comma-separated; a row's `live_route` (yes) marks a page that serves 200 now but is not in the staging
// probe (it is withdrawn to its redirect: route disposition WITHDRAW_TO_REDIRECT).
if(ctDecisionsFile){
  const known=new Set(decisions.map(d=>safeDecode(pathOf(d.url))))
  for(const row of ctDecisionsFile.split(',').flatMap(f=>tsv(f))){
    if(known.has(safeDecode(pathOf(row.url))))throw new Error(`CT decision for a URL OGCS already decided: ${row.url}`)
    decisions.push({gsc_clicks:'',canonical:'',fallback_if_not_published:'',...row,reason:`CT ruling 2026-10-05: ${row.reason}`})
  }
}
/** --locale-part-a=<PART_A.tsv> (OGCS Locale Preservation Part A, CT accepted 2026-10-05; owner decision): the decided state of
 * every locale URL replaces its R1 decision. 200 = the live locale page is preserved (a LIVE-LOCALE source route, or its held
 * Salmon record) and its R1 redirect is retired; 301 = one hop to the preserved locale page (or the kept English target);
 * 410 = gone. --locale-repoint=<tsv> (source, destination_now, destination_after_locale_b): CT-ruled redirects that pointed at
 * a page's English final until its locale page was served now point at the locale page (one hop). */
const localeA=new Map()
if(localePartAFile){
  const byKey=new Map(decisions.map(d=>[safeDecode(pathOf(d.url)),d]))
  for(const row of tsv(localePartAFile)){
    const key=safeDecode(pathOf(row.url))
    const state=row.final_state
    if(!['200','301','410'].includes(state))throw new Error(`Part A state ${state} for ${row.url}`)
    const target=state==='301'?row.redirect_target:''
    const decided={state,redirect_target:target,final_title:'',final_meta:'',canonical:'',reversed:'',delta:'LOCALE_PART_A',reason:`OGCS Locale Part A: ${row.change_vs_r1||row.final_state}`,locale:row.language}
    localeA.set(key,row)
    const d=byKey.get(key)
    if(d)Object.assign(d,decided)
    else decisions.push({url:row.url,gsc_clicks:row.gsc_clicks??'',fallback_if_not_published:'',...decided})
  }
  // --locale-overrides=<tsv> (url, final_state, redirect_target, reason): Control Tower rulings on single Part A rows.
  if(localeOverridesFile){
    const byKey2=new Map(decisions.map(d=>[safeDecode(pathOf(d.url)),d]))
    for(const row of tsv(localeOverridesFile)){
      const d=byKey2.get(safeDecode(pathOf(row.url)))
      if(!d||d.delta!=='LOCALE_PART_A')throw new Error(`locale override without a Part A row: ${row.url}`)
      Object.assign(d,{state:row.final_state,redirect_target:row.final_state==='301'?row.redirect_target:'',reason:row.reason})
    }
  }
}
if(localeRepointFile){
  const byKey=new Map(decisions.map(d=>[safeDecode(pathOf(d.url)),d]))
  for(const row of tsv(localeRepointFile)){
    const d=byKey.get(safeDecode(row.source))
    if(!d||d.state!=='301'||safeDecode(pathOf(d.redirect_target))!==safeDecode(row.destination_now))throw new Error(`locale repoint precondition failed for ${row.source}`)
    d.redirect_target=ORIGIN+row.destination_after_locale_b
    d.reason=`${d.reason} [Locale Part B: repointed to the preserved locale page]`
  }
}
/** Restored sections (data/restored-sections.json, written by build-restored.mjs): path → { routeId, h1?, groups }. */
const restored=restoredFile?JSON.parse(readFileSync(restoredFile,'utf8')):{}
const replacesBody=p=>Boolean(restored[p]?.groups?.some(g=>g.mode==='replace-body'))
/** Content decisions whose restoration has not shipped take their decided fallback 301 (CT 2026-10-05). A page whose live
 * body is restored in this batch keeps its 200 (the fallback is not needed). */
const CONTENT_FALLBACKS=new Map([['/chiller-and-cooling-tower/','/legionella-control-in-industrial-cooling-towers/']].filter(([p])=>!replacesBody(p)))
const deltaSkipped=[],deltaApplied=[]
if(titleDeltaFile){
  const byUrl=new Map(decisions.map(d=>[d.url,d]))
  const dupMeta=new Map(dupResolutionFile?tsv(dupResolutionFile).map(r=>[r.url,r.final_meta]):[])
  for(const row of tsv(titleDeltaFile)){
    const d=byUrl.get(row.url)
    if(!d)throw new Error(`title delta row has no decision: ${row.url}`)
    if(['RESTORE_LIVE_TITLE','RESTORE_TERM','STANDARDISE_FAN_SUFFIX'].includes(row.action)){
      if(d.state!=='200'||CONTENT_FALLBACKS.has(pathOf(d.url))||REVERSED_DUPLICATE.has(pathOf(d.url))){deltaSkipped.push({url:pathOf(row.url),action:row.action,reason:CONTENT_FALLBACKS.has(pathOf(d.url))?'content fallback 301 in force':`decision is ${REVERSED_DUPLICATE.has(pathOf(d.url))?'a withdrawn duplicate (CT reversal)':d.state}`});continue}
      d.final_title=row.r1_2_final_title;d.delta='R1_2_TITLE'
      if(dupMeta.get(row.url))d.final_meta=dupMeta.get(row.url)
      deltaApplied.push(pathOf(row.url))
    }else if(row.action==='STATE_CHANGE_301_TO_200'){
      Object.assign(d,{state:'200',redirect_target:'',final_title:row.r1_2_final_title,final_meta:dupMeta.get(row.url)??d.final_meta,delta:'R1_2_UNCONSOLIDATED'})
      deltaApplied.push(pathOf(row.url))
    }
  }
}
for(const [p,fallback] of CONTENT_FALLBACKS){const d=decisions.find(x=>pathOf(x.url)===p);if(d)Object.assign(d,{state:'301',redirect_target:ORIGIN+fallback,final_title:'',final_meta:'',reason:`content restoration pending: decided fallback 301 (OGCS R1.2, CT 2026-10-05)`})}
{
  const byPath=new Map(decisions.map(d=>[pathOf(d.url),d]))
  const duplicateToDesigned=new Map([...REVERSED_FOR_DESIGNED].map(([keep,dup])=>[dup,keep]))
  for(const [keep,dup] of REVERSED_FOR_DESIGNED){
    const k=byPath.get(keep),x=byPath.get(dup)
    if(!k||!x||k.state!=='301'||pathOf(k.redirect_target)!==dup||x.state!=='200')throw new Error(`reversal precondition failed for ${keep}`)
    Object.assign(k,{state:'200',redirect_target:'',final_title:'',final_meta:'',canonical:'',reversed:'DESIGNED_KEPT'})
    Object.assign(x,{state:'301',redirect_target:ORIGIN+keep,final_title:'',final_meta:'',canonical:'',reversed:'DUPLICATE_TO_DESIGNED',reason:`CT ruling 2026-10-04: designed ${keep} kept; duplicate 301s into it`})
  }
  for(const d of decisions)if(d.state==='301'&&duplicateToDesigned.has(pathOf(d.redirect_target)))d.redirect_target=ORIGIN+duplicateToDesigned.get(pathOf(d.redirect_target))
  // The surviving designed page receives the OGCS supplement / R1.1 meta keyed to the duplicate, if any.
}
const missing=new Map(tsv(metasFile).map(r=>[r.url,r.final_meta]))
const metaRewrites=new Map(metaRewritesFile?tsv(metaRewritesFile).map(r=>[safeDecode(r.path),r]):[])
let metaRewritesApplied=0
const supplement=new Map(supplementFile?tsv(supplementFile).map(r=>[r.url,r.final_meta]):[])
const content=JSON.parse(readFileSync(contentFile,'utf8'))
const probe=new Map(JSON.parse(readFileSync(probeFile,'utf8')).map(r=>[r.url,r]))
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8'))
const routeByKey=new Map(ledger.routes.map(r=>[safeDecode(r.path),r]))
/** The batch already applied on staging: what Payload holds now for each row it wrote. */
const baseline=baselineDir?{
  redirects:new Map(tsv(path.join(baselineDir,'redirects.tsv')).map(r=>[safeDecode(r.source),r])),
  seo:new Map(tsv(path.join(baselineDir,'seo-fields.tsv')).map(r=>[safeDecode(r.path),{title:r.title,meta:r.meta_origin.includes('PENDING_OGCS')?r.meta_now:r.meta}])),
  dispositions:new Set(tsv(path.join(baselineDir,'route-dispositions.tsv')).map(r=>`${r.action} ${safeDecode(r.path)} ${r.redirect??''}${r.canonical??''}`)),
  // Decided H1s the applied batch holds: written by it (UPDATE) or already in place for it (UNCHANGED, e.g. a delta baseline).
  h1:new Set(existsSync(path.join(baselineDir,'h1-fields.tsv'))?tsv(path.join(baselineDir,'h1-fields.tsv')).filter(r=>['UPDATE','UNCHANGED'].includes(r.action)).map(r=>`${safeDecode(r.path)} ${r.via} ${r.h1}`):[]),
  restored:existsSync(path.join(baselineDir,'restored-sections.json'))?JSON.parse(readFileSync(path.join(baselineDir,'restored-sections.json'),'utf8')):{},
  /** Every route the applied batch wrote (its slot fixes travelled with those writes). */
  written:new Set([
    ...tsv(path.join(baselineDir,'route-dispositions.tsv')).map(r=>r.path),
    ...tsv(path.join(baselineDir,'seo-fields.tsv')).filter(r=>r.action==='UPDATE').map(r=>r.path),
    ...(existsSync(path.join(baselineDir,'h1-fields.tsv'))?tsv(path.join(baselineDir,'h1-fields.tsv')).filter(r=>r.action==='UPDATE').map(r=>r.path):[]),
    ...(existsSync(path.join(baselineDir,'restored-sections.tsv'))?tsv(path.join(baselineDir,'restored-sections.tsv')).map(r=>r.path):[]),
    // An applied batch with the hygiene phase (apply phase 6) fixed every route in its slot fixes; an earlier batch only
    // the ones it wrote.
    ...(existsSync(path.join(baselineDir,'slot-fixes.json'))&&JSON.parse(readFileSync(path.join(baselineDir,'expectations.json'),'utf8')).expect?.hygiene?Object.keys(JSON.parse(readFileSync(path.join(baselineDir,'slot-fixes.json'),'utf8'))):[]),
  ].map(safeDecode)),
}:null
const dispositionKey=d=>`${d.action} ${safeDecode(d.path)} ${d.redirect??''}${d.canonical??''}`
const applied=d=>Boolean(baseline?.dispositions.has(dispositionKey(d)))

/** CT 2026-10-04: OGCS's two author rows are not taken; both addresses 301 to the public author archive. R2.5 (CT ruling,
 * fresh production database): those 301s were Payload records made before the batch existed, so the batch now owns them. */
const AUTHOR_ALIASES=new Set([`${ORIGIN}/author/tbozic/`,`${ORIGIN}/author/faizasyed-ai/`])
for(const d of decisions)if(AUTHOR_ALIASES.has(d.url))Object.assign(d,{state:'301',redirect_target:`${ORIGIN}/author/timbozic/`,final_title:'',final_meta:'',canonical:'',reason:'CT ruling 2026-10-04 (author identity) and R2.5 (fresh production DB): single-hop 301 to the public author archive'})
/** Rows held for a Control Tower ruling are marked HELD_FOR_CT_RULING and not applied. The two R1 holds (/thermal-upgrade/,
 * /cooling-tower-japan/) were ruled on 2026-10-04 (REVERSED_FOR_DESIGNED above); nothing is held now. */
const HELD_FOR_RULING=new Set()
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
/** Every held file the runtime serves, by lower-cased path → its exact served spelling (the runtime filesystem is
 * case-sensitive: a destination in another case is a 404 there even when a case-insensitive disk finds it). */
const servedFiles=new Map()
{
  const pub=path.join(APP,'public')
  const walk=dir=>{for(const name of readdirSync(dir)){const full=path.join(dir,name);if(statSync(full).isDirectory())walk(full);else{const p='/'+path.relative(pub,full).split(path.sep).join('/');servedFiles.set(p.toLowerCase(),encodeURI(p))}}}
  walk(path.join(pub,'wp-content'))
}
function resolveTarget(target){
  const route=routeByKey.get(safeDecode(target))
  if(route)return route.path
  if(/\.[a-z0-9]{2,5}$/i.test(safeDecode(target)))return servedFiles.get(safeDecode(target).toLowerCase())??served.get(safeDecode(target).toLowerCase())??target
  return served.get(safeDecode(target).toLowerCase())??target
}
const conformance=[],redirects=[],seo=[],dispositions=[],gone=[],retired=[]
const problemsEarly=[]
const expect={redirects:{create:0,update:0,unchanged:0,retire:0,normalise:0},routes:{publish:0,withdraw:0,index:0,canonical:0},seoFields:{update:0,unchanged:0,pendingOgcs:0},files:0,gone:0}
for(const d of decisions){
  const {path:reqPath,query,key}=requestPath(d.url)
  const now=probe.get(d.url)
  if(HELD_FOR_RULING.has(key)){conformance.push({url:reqPath,expect:'HELD_FOR_CT_RULING',target:pathOf(d.redirect_target)});continue}
  let state=d.state,target=d.redirect_target?pathOf(d.redirect_target):''
  const held=verdict.get(key)
  if(held&&held.verdict==='FAIL'){state='301';target=failedHeld.get(key)}
  if(state==='301'&&failedHeld.has(safeDecode(target)))target=failedHeld.get(safeDecode(target))
  if(state==='410'){
    gone.push({path:reqPath,query});conformance.push({url:reqPath+query,expect:'410'});expect.gone++
    // A locale page Part A retires as gone loses its R1 redirect record (kept, active:false): the proxy answers 410 first anyway.
    const prior=d.delta==='LOCALE_PART_A'?baseline?.redirects.get(safeDecode(reqPath)):undefined
    if(prior)retired.push({source:prior.source,was_destination:prior.destination,reason:'OGCS Locale Part A: 410 gone'})
    continue
  }
  if(state==='301'){
    // The proxy compares decoded paths; store the browser's encoded form (the collection refuses raw whitespace).
    const destination=resolveTarget(target)
    // R2.5 (CT 2026-10-05): a published route behind a decided 301 is withdrawn too, even where staging already answered the
    // 301 (an older redirect record served over it) — the ledger must not list a redirect source as PUBLIC.
    const baseRoute=routeByKey.get(key)
    const live=(now?now.status===200:d.live_route==='yes')||Boolean(baseRoute&&baseRoute.state==='PUBLIC'&&baseRoute.export)
    const source=/\/$/.test(key)||/\.[A-Za-z0-9]{2,5}$/.test(key)?reqPath:`${reqPath}/`
    const prior=baseline?.redirects.get(safeDecode(source))
    // The action is decided after repointToFinal (the destination may still change).
    const actionFor=dest=>prior?(safeDecode(prior.destination)===safeDecode(dest)?'UNCHANGED':'UPDATE'):now&&[301,308].includes(now.status)&&now.location&&safeDecode(now.location)===safeDecode(dest)?'UNCHANGED':now&&[301,308].includes(now.status)&&now.location&&!/\/$/.test(key)&&safeDecode(now.location)===key+'/'?'CREATE':now&&[301,308].includes(now.status)?'UPDATE':'CREATE'
    redirects.push({source,destination,status:'301',actionFor,was:prior?`301 ${prior.destination} (applied batch)`:now?`${now.status} ${now.location??''}`.trim():'',live_route:live?'yes':'',clicks:d.gsc_clicks,reason:d.reason})
    if(live){const r=routeByKey.get(key);dispositions.push({path:r?r.path:reqPath,routeId:r?.routeId??'',action:'WITHDRAW_TO_REDIRECT',redirect:destination})}
    conformance.push({url:reqPath+query,expect:'301',target:destination,framework_slash_hop:source!==reqPath?'yes':''})
    continue
  }
  // 200
  if(d.reversed==='DESIGNED_KEPT'){conformance.push({url:reqPath,expect:'200',kind:'html',title:now?.title??'',meta:now?.meta??''});continue}
  // A page the applied batch consolidated (withdrawn to a redirect) that is decided 200 again is re-published, and its
  // redirect record is retired (active:false, kept for history).
  const priorRedirect=baseline?.redirects.get(safeDecode(reqPath))
  if(priorRedirect&&d.delta==='LOCALE_PART_A')retired.push({source:priorRedirect.source,was_destination:priorRedirect.destination,reason:'OGCS Locale Part A: live locale page preserved (owner decision 2026-10-05)'})
  if(d.delta==='LOCALE_PART_A'){
    const r=routeByKey.get(key)
    if(!r){problemsEarly.push(`locale page without a route ${reqPath}`);continue}
    if(r.routeId.startsWith('LIVE-LOCALE-')){
      // Imported published by the authority import (a new LIVE-family record); its title and meta are the live page's.
      conformance.push({url:r.path,expect:'200',kind:'locale',lang:d.locale});continue
    }
    // The one preserved page that is a held source record (Salmon): published through the content check with its own title
    // (the live title minus the legacy WordPress suffix) and the live meta.
    const doc=JSON.parse(readFileSync(path.join(APP,'content/salmon',r.sourceFile),'utf8'))
    d.final_title=doc.seo.title;d.final_meta=localeA.get(key)?.live_meta_kept??''
  }
  if(priorRedirect&&d.delta!=='LOCALE_PART_A'){
    retired.push({source:priorRedirect.source,was_destination:priorRedirect.destination,reason:d.delta==='R1_2_UNCONSOLIDATED'?'OGCS R1.2 correction: false duplicate un-consolidated (CT 2026-10-05)':'decided 200'})
    const r=routeByKey.get(key)
    // A re-publish returns the route to its base authority state (it simply leaves redirectSources); it is not a held article.
    if(r){const row={path:r.path,routeId:r.routeId,action:'PUBLISH',republish:true};dispositions.push(row);if(!applied(row))expect.routes.publish++}
  }
  if(!d.final_title){conformance.push({url:reqPath+query,expect:'200',kind:query?'query-variant':'file'});continue}
  const route=routeByKey.get(key)
  let meta=supplement.get(d.url)??missing.get(d.url)??d.final_meta,origin=supplement.has(d.url)?'OGCS_SUPPLEMENT':missing.has(d.url)?'OGCS_R1_1':'OGCS'
  // "Buy … online" becomes "Request a quote for …"; the e-commerce "online" goes with it.
  if(QUOTE_ONLY.test(meta)){meta=meta.replace(QUOTE_ONLY,(_,opening)=>`${opening}Request a quote for`).replace(/\s+online(?=[,.;])/i,'');origin+='+QUOTE_ONLY'}
  if(meta.length>158){const trimmed=trimMeta(meta);if(trimmed){meta=trimmed;origin+='+MECHANICAL_TRIM'}else origin+='+PENDING_OGCS_LENGTH'}
  const rewrite=metaRewrites.get(safeDecode(route?route.path:reqPath))
  if(rewrite){if(rewrite.old_meta!==meta)throw new Error(`meta rewrite no longer matches the batch meta: ${reqPath}`);meta=rewrite.new_meta;origin+='+CT_COMPLETE_SENTENCE';metaRewritesApplied++}
  const correction=FACTUAL_CORRECTIONS.get(key)
  if(correction&&correction[0].test(meta)){meta=meta.replace(correction[0],correction[1]);origin+='+FACTUAL_CORRECTION'}
  const canonical=d.canonical&&route&&safeDecode(d.canonical)!==safeDecode(route.canonical)?d.canonical:''
  const prior=baseline?.seo.get(safeDecode(route?route.path:reqPath))
  seo.push({path:route?route.path:reqPath,routeId:route?.routeId??'',title:d.final_title,meta,canonical,meta_origin:origin,title_now:prior?prior.title:now?.title??'',meta_now:prior?prior.meta:now?.meta??''})
  if(held&&held.verdict==='PASS'){const row={path:route.path,routeId:route.routeId,action:'PUBLISH'};dispositions.push(row);if(!applied(row))expect.routes.publish++}
  if(canonical){const row={path:route.path,routeId:route.routeId,action:'CANONICAL',canonical};dispositions.push(row);if(!applied(row))expect.routes.canonical++}
  conformance.push({url:reqPath,expect:'200',kind:'html',title:d.final_title,meta})
}
/** Repoint every redirect to its final destination: a destination that is itself a redirect source is followed to the end. */
function repointToFinal(){
  const next=new Map(redirects.map(r=>[safeDecode(r.source),r.destination]))
  for(const r of redirects){
    const seen=new Set([safeDecode(r.source)])
    let destination=r.destination
    while(next.has(safeDecode(destination))){
      if(seen.has(safeDecode(destination))){problemsEarly.push(`loop ${r.source}`);break}
      seen.add(safeDecode(destination))
      destination=next.get(safeDecode(destination))
    }
    if(destination!==r.destination){r.reason=`${r.reason} [repointed from ${r.destination}]`;r.destination=destination}
  }
  for(const c of conformance)if(c.expect==='301'&&next.has(safeDecode(c.target))){const r=redirects.find(x=>safeDecode(x.source)===safeDecode(c.url.replace(/\?.*$/,''))||safeDecode(x.source)===safeDecode(c.url.replace(/\?.*$/,''))+'/');if(r)c.target=r.destination}
  for(const d of dispositions)if(d.action==='WITHDRAW_TO_REDIRECT'&&next.has(safeDecode(d.redirect))){const r=redirects.find(x=>safeDecode(x.source)===safeDecode(d.path));d.redirect=r?r.destination:d.redirect}
}
repointToFinal()
for(const r of redirects){r.action=r.actionFor(r.destination);expect.redirects[r.action.toLowerCase()]++}
for(const d of dispositions)if(d.action==='WITHDRAW_TO_REDIRECT'&&!applied(d))expect.routes.withdraw++
// Duplicate metas are pending OGCS (no copy is invented here): they are not written and are listed for OGCS.
const byMeta=new Map();for(const row of seo){byMeta.set(row.meta,[...(byMeta.get(row.meta)??[]),row])}
for(const rows of byMeta.values())if(rows.length>1)for(const row of rows)if(!supplement.has(ORIGIN+row.path)){row.meta_origin+='+PENDING_OGCS_DUPLICATE'}
// R2.2 (OGCS claims sweep R1, CT accepted 2026-10-05): --claims-seo=<tsv> (row, path, field title|meta, old, new). A ruled
// string in an existing row changes only while that row still holds it; a published page without a decided row gets one
// (its current title and meta, the ruled field changed). The JSON-LD copies are the text-override registry's.
const claimsSeoFile=flag('claims-seo')
let claimsSeoApplied=0
if(claimsSeoFile)for(const c of tsv(claimsSeoFile).filter(c=>c.field!=='h1')){
  const key=safeDecode(c.path)
  let row=seo.find(r=>safeDecode(r.path)===key)
  if(!row){
    const route=routeByKey.get(key)
    if(!route||route.state!=='PUBLIC'){problemsEarly.push(`claims seo ${c.row}: no published route ${c.path}`);continue}
    const doc=JSON.parse(readFileSync(path.join(APP,'content/salmon',route.sourceFile),'utf8'))
    const desc=doc.seo.meta.find(m=>m.name==='description')?.value??''
    const prior=baseline?.seo.get(key)
    row={path:route.path,routeId:route.routeId,title:prior?prior.title:doc.seo.title,meta:prior?prior.meta:desc,canonical:'',meta_origin:'SOURCE',title_now:prior?prior.title:doc.seo.title,meta_now:prior?prior.meta:desc}
    seo.push(row);conformance.push({url:route.path,expect:'200',kind:'html',title:row.title,meta:row.meta})
  }
  const field=c.field==='title'?'title':'meta'
  // already applied (an earlier batch wrote it; this batch's baseline holds it): nothing to change
  if(!row[field].includes(c.old)&&row[field].includes(c.new)){claimsSeoApplied++;continue}
  if(!row[field].includes(c.old)){problemsEarly.push(`claims seo ${c.row}: ${c.path} ${field} no longer holds the ruled text`);continue}
  row[field]=row[field].replace(c.old,c.new);row.meta_origin+=`+CLAIMS_SWEEP_${c.row}`;claimsSeoApplied++
  const cf=conformance.find(x=>safeDecode(x.url)===key);if(cf)cf[field]=row[field]
}
// R2.4 (OGCS SEO R2.4 titles/metas R1, CT accepted 2026-10-05): --seo-set=<tsv> (path, field title|meta, value, reason). The
// decided value of one field replaces the batch's; a published page without a decided row gets one (its current title and
// meta, the decided field set). Same rule checks as every decided row.
const seoSetFile=flag('seo-set')
let seoSetApplied=0
// R2.5: several files, comma-separated (R2.4's, then R2.5's); a later row for the same path and field wins
const seoSetRows=seoSetFile?seoSetFile.split(',').flatMap(f=>tsv(f)).filter(r=>r.path):[]
for(const c of seoSetRows){
  const key=safeDecode(c.path)
  if(!['title','meta'].includes(c.field)){problemsEarly.push(`seo set: field ${c.field} ${c.path}`);continue}
  let row=seo.find(r=>safeDecode(r.path)===key)
  if(!row){
    const route=routeByKey.get(key)
    if(!route||route.state!=='PUBLIC'){problemsEarly.push(`seo set: no published route ${c.path}`);continue}
    const doc=JSON.parse(readFileSync(path.join(APP,'content/salmon',route.sourceFile),'utf8'))
    const desc=doc.seo.meta.find(m=>m.name==='description')?.value??''
    const prior=baseline?.seo.get(key)
    row={path:route.path,routeId:route.routeId,title:prior?prior.title:doc.seo.title,meta:prior?prior.meta:desc,canonical:'',meta_origin:'SOURCE',title_now:prior?prior.title:doc.seo.title,meta_now:prior?prior.meta:desc}
    seo.push(row)
  }
  // a decided meta ends a pending state (the row's meta is written)
  if(c.field==='meta')row.meta_origin=row.meta_origin.replace(/\+PENDING_OGCS_[A-Z_]+/g,'')
  row[c.field]=c.value;row.meta_origin+=`+OGCS_R2_4_${c.field.toUpperCase()}`;seoSetApplied++
  const cf=conformance.find(x=>safeDecode(x.url)===key)
  if(cf)Object.assign(cf,{kind:'html',title:row.title,meta:row.meta})
  else conformance.push({url:row.path,expect:'200',kind:'html',title:row.title,meta:row.meta})
}
const conformanceByPath=new Map(conformance.map(c=>[safeDecode(c.url),c]))
for(const row of seo){
  const pending=row.meta_origin.includes('PENDING_OGCS')
  // A pending meta is not written: conformance requires a meta to be present, not this text.
  if(pending){const c=conformanceByPath.get(safeDecode(row.path));if(c){c.meta='';c.meta_pending='yes'}}
  // A canonical already applied by the baseline batch is not a change (the route-disposition phase owns it).
  const canonicalChange=Boolean(row.canonical)&&!applied({action:'CANONICAL',path:row.path,canonical:row.canonical})
  const changed=row.title!==row.title_now||(!pending&&row.meta!==row.meta_now)||canonicalChange
  row.action=changed?'UPDATE':'UNCHANGED'
  if(pending)expect.seoFields.pendingOgcs++
  expect.seoFields[changed?'update':'unchanged']++
}
// The ranking pages that ship noindex today and list public items (Control Tower ruling): indexable.
const INDEX=['/product-category/gearboxes/','/product-category/drive-shafts-assemblies/','/product-category/motors/','/product-category/drift-eliminators/','/product-category/nozzles/']
for(const p of INDEX){const r=routeByKey.get(p),row={path:r.path,routeId:r.routeId,action:'INDEX'};dispositions.push(row);if(!applied(row))expect.routes.index++}
const restore=restoreLedger
expect.files=restore.restored.length

// Rule checks (the brief's limits): a failure stops the build.
const problems=[...problemsEarly]
// R2.4: a row the batch created only to set a meta (--seo-set) keeps the page's current title unchanged; the title rules apply
// to decided titles (a noindex tag archive's term-list title is not one).
const keptTitle=row=>row.meta_origin.startsWith('SOURCE')&&row.title===row.title_now&&!row.meta_origin.includes('OGCS_R2_4_TITLE')
const titles=new Set();for(const row of seo){if(titles.has(row.title))problems.push(`duplicate title ${row.path}`);titles.add(row.title);if(keptTitle(row))continue;if(row.title.length>69)problems.push(`title>69 ${row.path}`);if(FORBIDDEN.test(row.title))problems.push(`title word ${row.path}`)}
if(seoSetApplied!==seoSetRows.length)problems.push(`seo set applied ${seoSetApplied} of ${seoSetRows.length}`)
if(metaRewritesApplied!==metaRewrites.size)problems.push(`meta rewrites applied ${metaRewritesApplied} of ${metaRewrites.size}`)
if(claimsSeoFile&&claimsSeoApplied!==tsv(claimsSeoFile).filter(c=>c.field!=='h1').length)problems.push(`claims seo applied ${claimsSeoApplied} of ${tsv(claimsSeoFile).filter(c=>c.field!=='h1').length}`)
for(const row of seo){if(!row.meta_origin.includes('PENDING_OGCS')&&/…|\.\.\.$/.test(row.meta))problems.push(`meta ends in a truncation mark ${row.path}`)}
for(const row of seo){if(row.meta_origin.includes('PENDING_OGCS'))continue;if(row.meta.length<70||row.meta.length>158)problems.push(`meta length ${row.path} ${row.meta.length}`);if(FORBIDDEN.test(row.meta))problems.push(`meta word ${row.path}: ${row.meta.match(FORBIDDEN)[0]}`)}
// Full-set uniqueness (CT ruling 2026-10-04 (b)): every meta this batch writes (R1 + R1.1 + supplement), compared with every
// other written meta and every meta left as-is on a pending row. Any collision stops the build.
const written=new Map()
for(const row of seo){const text=row.meta_origin.includes('PENDING_OGCS')?row.meta_now:row.meta;if(!text)continue;const key=text.trim().toLowerCase();if(written.has(key))problems.push(`duplicate meta ${row.path} = ${written.get(key)}`);else written.set(key,row.path)}
const sources=new Set(redirects.map(r=>safeDecode(r.source)))
const ok200=new Set([...served.values(),...servedFiles.values()].map(safeDecode))
for(const r of redirects){
  const dest=safeDecode(r.destination)
  if(sources.has(dest))problems.push(`chain ${r.source} -> ${r.destination}`)
  if(dest===safeDecode(r.source))problems.push(`self ${r.source}`)
  if(!ok200.has(dest)&&!['/author/timbozic/'].includes(dest))problems.push(`target not 200 ${r.source} -> ${r.destination}`)
  if(/^\/(?:wp-content|media)\//.test(dest)&&/\.[a-z0-9]{2,5}$/i.test(dest)&&servedFiles.get(dest.toLowerCase())!==encodeURI(dest))problems.push(`file target not served in this exact spelling ${r.source} -> ${r.destination}`)
}
if(sources.size!==redirects.length)problems.push('duplicate redirect source')

mkdirSync(OUT,{recursive:true})
writeTsv('conformance.tsv',['url','expect','target','kind','title','meta','meta_pending','framework_slash_hop'],conformance)
writeTsv('redirects.tsv',['source','destination','status','action','was','live_route','clicks','reason'],redirects)
writeTsv('seo-fields.tsv',['path','routeId','action','title','meta','canonical','meta_origin','title_now','meta_now'],seo)
writeTsv('route-dispositions.tsv',['path','routeId','action','redirect','canonical'],dispositions)
writeTsv('gone.tsv',['path','query'],gone)
expect.redirects.retire=retired.length
// R2.4 item k (CT 2026-10-05): every stored redirect record answers 301. The authority import stored the ledger's redirects
// with the ledger's status (308 for most consolidations); a record this batch does not create, update or retire, and whose
// imported status is not 301, has its status set to 301 (apply phase 2, NORMALISE). Read from the ledger as imported (the
// base ledger the rebuild starts from); no batch before R2.4 wrote or retired one of them.
{
  const touched=new Set([...redirects.filter(r=>r.action==='CREATE'||r.action==='UPDATE').map(r=>safeDecode(r.source)),...retired.map(r=>safeDecode(r.source))])
  // R2.5: records the applied batch already normalised (its redirect-status.tsv) are 301 on staging now
  const normalisedBefore=new Set(baselineDir&&existsSync(path.join(baselineDir,'redirect-status.tsv'))?tsv(path.join(baselineDir,'redirect-status.tsv')).map(r=>safeDecode(r.source)):[])
  const statusRows=ledger.redirects.filter(r=>String(r.status)!=='301'&&!touched.has(safeDecode(r.source))&&!normalisedBefore.has(safeDecode(r.source))).map(r=>({source:r.source,destination:r.destination,status_now:String(r.status),status:'301'}))
  expect.redirects.normalise=statusRows.length
  writeTsv('redirect-status.tsv',['source','destination','status_now','status'],statusRows)
}
// H1 decisions (OGCS R1.2 content TSV): written to the page's h1 heading slot through the editorial lifecycle.
const h1Rows=[]
if(contentDecisionsFile){
  const nodeText=n=>typeof n==='string'?n:n.children.map(nodeText).join('')
  const firstH1=nodes=>{for(const n of nodes){if(typeof n==='string')continue;if(n.tag==='h1')return nodeText(n).replace(/\s+/g,' ').trim();const found=firstH1(n.children);if(found!==undefined)return found}return undefined}
  for(const row of tsv(contentDecisionsFile)){
    if(!['KEEP_STAGING_VERSION','RESTORE_SECTIONS','KEEP_STAGING_LAYOUT_RESTORE_SECTIONS'].includes(row.decision))continue
    const decided=row.h1_decision.replace(/\s*\([^)]*\)\s*$/,'').trim()
    if(!decided||/^unchanged$/i.test(decided)||/\(keep\)\s*$/i.test(row.h1_decision))continue
    const route=routeByKey.get(safeDecode(pathOf(row.url)))
    if(!route){problems.push(`h1 decision without a route ${row.url}`);continue}
    const doc=JSON.parse(readFileSync(path.join(APP,'content/salmon',route.sourceFile),'utf8'))
    const now=firstH1(doc.children)
    if(now===undefined){problems.push(`h1 decision but no h1 node ${route.path}`);continue}
    h1Rows.push({path:route.path,routeId:route.routeId,via:'slot',h1:decided,h1_now:now,action:decided===now||baseline?.h1.has(`${safeDecode(route.path)} slot ${decided}`)?'UNCHANGED':'UPDATE'})
  }
}
// Round 5 (CT ruling 2026-10-05): a ruled page heading in --claims-seo (field h1). Article templates render the record title as
// the page heading, so it is written as the title (via=title), like a restored live H1; the ruled old text must still be there.
if(claimsSeoFile)for(const c of tsv(claimsSeoFile).filter(c=>c.field==='h1')){
  const route=routeByKey.get(safeDecode(c.path))
  if(!route||route.state!=='PUBLIC'){problems.push(`claims h1 ${c.row}: no published route ${c.path}`);continue}
  const doc=JSON.parse(readFileSync(path.join(APP,'content/salmon',route.sourceFile),'utf8'))
  const now=String((doc.seo?.h1??[])[0]??doc.title??'')
  if(now!==c.old&&!baseline?.h1.has(`${safeDecode(route.path)} title ${c.new}`)){problems.push(`claims h1 ${c.row}: ${c.path} heading is "${now}", not the ruled text`);continue}
  h1Rows.push({path:route.path,routeId:route.routeId,via:'title',h1:c.new,h1_now:now,action:c.new===now||baseline?.h1.has(`${safeDecode(route.path)} title ${c.new}`)?'UNCHANGED':'UPDATE'})
}
// A restored live body brings its live H1: article templates render the record title as the page heading.
for(const [p,page] of Object.entries(restored)){
  if(!page.h1)continue
  const route=routeByKey.get(safeDecode(p))
  if(!route){problems.push(`restored page without a route ${p}`);continue}
  const doc=JSON.parse(readFileSync(path.join(APP,'content/salmon',route.sourceFile),'utf8'))
  const now=String((doc.seo?.h1??[])[0]??doc.title??'')
  h1Rows.push({path:route.path,routeId:route.routeId,via:'title',h1:page.h1,h1_now:now,action:page.h1===now||baseline?.h1.has(`${safeDecode(route.path)} title ${page.h1}`)?'UNCHANGED':'UPDATE'})
}
// Restored sections: one write per page (the whole restoredSections array), delta against the applied batch (none before).
const restoredRows=Object.entries(restored).map(([p,page])=>({path:p,routeId:page.routeId,groups:page.groups.length,blocks:page.groups.reduce((n,g)=>n+g.blocks.length,0)}))
// Delta: a page whose sections the applied batch already wrote, unchanged, is not written again.
const restoredChanged=restoredRows.filter(r=>JSON.stringify(baseline?.restored?.[r.path]?.groups??null)!==JSON.stringify(restored[r.path].groups))
expect.restored={update:restoredChanged.length}
writeTsv('restored-sections.tsv',['path','routeId','groups','blocks'],restoredRows)
// Content assertions for the hosted checker: every restored H2 is served on its page (and a replaced body serves the live H1).
const contentAssertions=Object.entries(restored).flatMap(([p,page])=>[...(page.h1?[{path:p,kind:'h1',text:page.h1}]:[]),...page.groups.flatMap(g=>g.blocks.filter(b=>b.blockType==='restoredHeading'&&b.level==='2').map(b=>({path:p,kind:'h2',text:b.text})))])
writeTsv('content-assertions.tsv',['path','kind','text'],contentAssertions)
expect.h1={update:h1Rows.filter(r=>r.action==='UPDATE').length}
writeTsv('h1-fields.tsv',['path','routeId','via','action','h1','h1_now'],h1Rows)
// Slot hygiene (R1 residual, CT 2026-10-05): every route this batch writes and whose imported page elements the strict
// validator rejects carries its element fixes in the same write (data/slot-fixes.json, built by build-slot-fixes.ts).
{
  const fixesFile=path.join(OUT,'slot-fixes.json')
  const fixes=existsSync(fixesFile)?JSON.parse(readFileSync(fixesFile,'utf8')):{}
  const written=new Set([
    ...dispositions.filter(d=>!applied(d)).map(d=>safeDecode(d.path)),
    ...seo.filter(r=>r.action==='UPDATE').map(r=>safeDecode(r.path)),
    ...h1Rows.filter(r=>r.action==='UPDATE').map(r=>safeDecode(r.path)),
    ...restoredChanged.map(r=>safeDecode(r.path)),
  ])
  // A route the applied batch wrote already carries its fixes; the rest are written on their own (apply phase 6, hygiene).
  // R2.2: a route the applied batch fixed is pending again when this batch fixes any of its elements differently (a new
  // claim edit on an element, a new element, or a route it had no fixes for), as apply counts it from the elements' state.
  const baseFixes=baselineDir&&existsSync(path.join(baselineDir,'slot-fixes.json'))?new Map(Object.entries(JSON.parse(readFileSync(path.join(baselineDir,'slot-fixes.json'),'utf8'))).map(([k,v])=>[safeDecode(k),v])):new Map()
  const fixedAgain=p=>{if(!baseFixes.size)return false;const was=baseFixes.get(safeDecode(p));if(!was)return true;const before=new Map(was.slots.map(s=>[`${s.key} ${s.field}`,s.afterCanon]));return fixes[p].slots.some(s=>before.get(`${s.key} ${s.field}`)!==s.afterCanon)}
  const pending=Object.keys(fixes).filter(p=>!baseline?.written.has(safeDecode(p))||fixedAgain(p))
  expect.slotFixes={routes:pending.filter(p=>written.has(safeDecode(p))).length}
  expect.hygiene={routes:baseline?pending.filter(p=>!written.has(safeDecode(p))).length:0}
}
writeTsv('redirects-retired.tsv',['source','was_destination','reason'],retired)
const pending=seo.filter(r=>r.meta_origin.includes('PENDING_OGCS')||r.meta_origin.includes('MECHANICAL_TRIM'))
writeTsv('ogcs-meta-requests.tsv',['path','reason','current_batch_meta','title'],pending.map(r=>({path:r.path,reason:r.meta_origin.includes('PENDING_OGCS_DUPLICATE')?'DUPLICATE_META':r.meta_origin.includes('PENDING_OGCS_LENGTH')?'TOO_LONG_AFTER_QUOTE_ONLY_REWRITE_NO_CLEAN_TRIM':'TRIMMED_AFTER_QUOTE_ONLY_REWRITE_REVIEW',current_batch_meta:r.meta,title:r.title})))
writeFileSync(path.join(OUT,'expectations.json'),JSON.stringify({rows:conformance.length,redirects:redirects.length,seoFields:seo.length,expect,deltaSkipped,retired:retired.length,problems},null,2)+'\n')
// Case B (CT 2026-10-05): the applied batch ran without the R3.1 fix, so a CANONICAL route it also wrote SEO fields to had its
// canonical put back by that later write; this batch re-applies it. Same counts otherwise.
if(baselineDir){
  const seoWritten=new Set(tsv(path.join(baselineDir,'seo-fields.tsv')).filter(r=>r.action==='UPDATE').map(r=>safeDecode(r.path)))
  const reverted=tsv(path.join(baselineDir,'route-dispositions.tsv')).filter(r=>r.action==='CANONICAL'&&seoWritten.has(safeDecode(r.path))).map(r=>r.path)
  const caseB={...expect,routes:{...expect.routes,canonical:expect.routes.canonical+reverted.length}}
  // Only a baseline that ran the unfixed SEO write needs the variant; otherwise a stale copy is removed.
  if(!reverted.length){if(existsSync(path.join(OUT,'expectations.case-b.json')))unlinkSync(path.join(OUT,'expectations.case-b.json'))}
  else writeFileSync(path.join(OUT,'expectations.case-b.json'),JSON.stringify({rows:conformance.length,redirects:redirects.length,seoFields:seo.length,expect:caseB,caseB:{reapplied:reverted},deltaSkipped,retired:retired.length,problems},null,2)+'\n')
}
const overrides={
  note:'Master SEO Pass R1 (Control Tower brief 2026-10-04): release authority overrides, mirrored by the scripted Payload batch.',
  publish:dispositions.filter(d=>d.action==='PUBLISH'&&!d.republish).map(d=>d.path),
  canonical:Object.fromEntries(dispositions.filter(d=>d.action==='CANONICAL').map(d=>[d.path,d.canonical])),
  index:INDEX,
  redirectSources:Object.fromEntries(dispositions.filter(d=>d.action==='WITHDRAW_TO_REDIRECT').map(d=>[d.path,d.redirect])),
}
writeFileSync(path.join(APP,'content/release/seo-pass-r1.json'),JSON.stringify(overrides,null,2)+'\n')
process.stdout.write(JSON.stringify({rows:conformance.length,redirects:redirects.length,seoFields:seo.length,expect,deltaApplied:deltaApplied.length,deltaSkipped,retired,problems:problems.length,firstProblems:problems.slice(0,12)},null,2)+'\n')
if(problems.length)process.exit(1)
