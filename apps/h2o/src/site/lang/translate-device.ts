/**
 * LANG-2.1: translation on the visitor's own device, tried before Google (owner decision 2026-10-08).
 *
 * Browsers with the built-in Translator API (Chrome and Edge) translate the page's visible text nodes in place: no request to
 * Google, no cookie, nothing stored, no CSP change. The original text of every node is kept in memory, so "English" puts the page
 * back exactly. Visible text goes first, the rest follows while the browser is idle, and the work is capped so a long page stays
 * responsive. Regions marked translate="no" (form fields, phone numbers, code) and our own language bar are never touched.
 * When the API is missing, the pair is unsupported, or anything fails, `runOnDevice` returns false and the caller falls back
 * to the Google widget (translate-widget.ts), then to the new-tab link.
 */
export type DeviceTranslator={translate(text:string):Promise<string>;destroy?():void}
export type TranslatorApi={
  availability(options:{sourceLanguage:string;targetLanguage:string}):Promise<string>
  create(options:{sourceLanguage:string;targetLanguage:string;monitor?:(monitor:EventTarget)=>void}):Promise<DeviceTranslator>
}
export type DeviceEnv={doc:Document;win:Window&{Translator?:TranslatorApi}}

/** Our language codes → the Translator API's (BCP 47). */
const DEVICE_CODE:Record<string,string>={'zh-CN':'zh'}
export const deviceCode=(code:string)=>DEVICE_CODE[code]??code

export const MAX_NODES=1500
export const MAX_CHARS=90000
export const PIECE_CHARS=1500
const BATCH=8
/** A browser whose Translator never answers (no model, blocked) must not hold the visitor: after this long Google takes over. */
export const AVAILABILITY_TIMEOUT_MS=3000
export const READY_TIMEOUT_MS=15000
const within=<T,>(promise:Promise<T>,ms:number,win:Window):Promise<T>=>new Promise((resolve,reject)=>{const timer=win.setTimeout(()=>reject(new Error('timeout')),ms);promise.then(v=>{win.clearTimeout(timer);resolve(v)},e=>{win.clearTimeout(timer);reject(e)})})
/** Parts of the page whose text is never translated: our own controls and anything marked as untranslatable. */
import {PROTECTED_PATTERN} from './protected-names'

/**
 * Only the page BODY is translated (Design Director T2): the header and mega-menu navigation, the mobile panel and the footer
 * link lists keep their labels ("Parts" must not become "Regiones"), and so does the client-name strip. The same list is
 * marked translate="no" for the Google widget (translate-widget.ts).
 */
export const NO_TRANSLATE_REGIONS='.site-nav,.site-nav-panel,.site-mobile-panel,.lux-desktop-nav,.sp-footer-list,.sp-footer-category,.sp-footer-locations,.dr3-clients'
/** React-managed native RFQ panel and launcher (src/rfq-native, owned by CRM): never wrapped or rewritten, so React can unmount them safely in a translated session. */
export const RFQ_ROOTS='[data-rfq-panel],[data-rfq-launcher]'
export const SKIP_SELECTOR='script,style,noscript,textarea,code,pre,svg,option,[translate="no"],.notranslate,[data-lang-menu],.translate-note,#google_translate_element,[contenteditable="true"],a[href^="tel:"],a[href^="mailto:"],'+NO_TRANSLATE_REGIONS+',[data-lang-keep],'+RFQ_ROOTS

type Entry={node:Text;original:string;translated:string|null}
type Run={id:number;entries:Entry[];translator:DeviceTranslator|null;cancelled:boolean}
let current:Run|null=null
let counter=0

const ATTRS=['data-translated','data-translated-by','data-translate-progress']
const clearAttrs=(doc:Document)=>{for(const name of ATTRS)doc.documentElement.removeAttribute(name)}

/** Where the page stands: null, or `lang|by|progress` ("es|device|" / "es|google|" / "es|device|42"). One primitive string for useSyncExternalStore. */
export function translateStatus(doc:Document=document):string|null{
  const to=doc.documentElement.getAttribute('data-translated')
  if(!to)return null
  return `${to}|${doc.documentElement.getAttribute('data-translated-by')??'google'}|${doc.documentElement.getAttribute('data-translate-progress')??''}`
}

export function deviceTranslatorFor(win:DeviceEnv['win']):TranslatorApi|null{
  const api=(win as unknown as {Translator?:TranslatorApi}).Translator
  return api&&typeof api.availability==='function'&&typeof api.create==='function'?api:null
}

/** Wraps every protected name found in the page's text in a translate="no" span (the name stays exactly as written). */
export function wrapProtectedNames(doc:Document):number{
  const walker=doc.createTreeWalker(doc.body,4 /* SHOW_TEXT */)
  const targets:Text[]=[]
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    const parent=(node as Text).parentElement
    if(!parent||parent.closest('script,style,noscript,textarea,code,pre,svg,[translate="no"],.notranslate,[data-lang-keep],'+RFQ_ROOTS))continue
    PROTECTED_PATTERN.lastIndex=0
    if(PROTECTED_PATTERN.test(node.nodeValue??''))targets.push(node as Text)
  }
  let count=0
  for(const node of targets){
    const text=node.nodeValue!
    const frag=doc.createDocumentFragment()
    let last=0
    PROTECTED_PATTERN.lastIndex=0
    for(const m of text.matchAll(PROTECTED_PATTERN)){
      if(m.index!<last)continue // swallowed by the whitespace of the previous name
      let before=text.slice(last,m.index)
      // the spaces next to a name travel inside its span: a translator may trim the edge of a fragment, and "About ICS" must not become "Acerca deICS"
      const lead=/\s+$/.exec(before)?.[0]??''
      if(lead)before=before.slice(0,before.length-lead.length)
      if(before)frag.appendChild(doc.createTextNode(before))
      const end=m.index!+m[0].length
      const trail=/^\s+/.exec(text.slice(end))?.[0]??''
      const span=doc.createElement('span')
      span.setAttribute('translate','no');span.setAttribute('data-lang-keep','');span.textContent=lead+m[0]+trail
      frag.appendChild(span);count++
      last=end+trail.length
    }
    if(last<text.length)frag.appendChild(doc.createTextNode(text.slice(last)))
    node.parentNode!.replaceChild(frag,node)
  }
  return count
}

/** Undoes `wrapProtectedNames`: the spans give their text back and neighbouring text nodes merge again. */
export function unwrapProtectedNames(doc:Document):void{
  const parents=new Set<Node>()
  for(const span of Array.from(doc.querySelectorAll('span[data-lang-keep]'))){
    const parent=span.parentNode
    if(!parent)continue
    parent.replaceChild(doc.createTextNode(span.textContent??''),span)
    parents.add(parent)
  }
  for(const parent of parents)(parent as Element).normalize()
}

/** The visible text nodes worth translating, in document order. */
export function collectTextNodes(doc:Document):Text[]{
  const out:Text[]=[]
  const walker=doc.createTreeWalker(doc.body,4 /* SHOW_TEXT */)
  let total=0
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    const text=node.nodeValue??''
    if(!/\S/.test(text)||!/\p{L}/u.test(text))continue
    const parent=node.parentElement
    if(!parent||parent.closest(SKIP_SELECTOR))continue
    total+=text.length
    if(out.length>=MAX_NODES||total>MAX_CHARS)break
    out.push(node as Text)
  }
  return out
}

/** A long text is translated in sentence-sized pieces so no single call grows large. */
export function pieces(text:string,limit:number=PIECE_CHARS):string[]{
  if(text.length<=limit)return [text]
  const parts=text.split(/(?<=[.!?。！？])\s+/)
  const out:string[]=[]
  let acc=''
  for(const part of parts){
    if(acc&&acc.length+part.length+1>limit){out.push(acc);acc=part}
    else acc=acc?`${acc} ${part}`:part
  }
  if(acc)out.push(acc)
  return out.flatMap(p=>p.length>limit?(p.match(new RegExp(`[\\s\\S]{1,${limit}}`,'g'))??[p]):[p])
}

const inView=(node:Text,win:Window)=>{
  const rect=node.parentElement?.getBoundingClientRect()
  return !!rect&&rect.bottom>=0&&rect.top<=win.innerHeight*1.5&&rect.width>0
}
const yieldNow=(win:Window,idle:boolean)=>new Promise<void>(resolve=>{
  const ric=(win as unknown as {requestIdleCallback?:(cb:()=>void,o?:{timeout:number})=>number}).requestIdleCallback
  if(idle&&ric)ric.call(win,()=>resolve(),{timeout:400})
  else win.setTimeout(()=>resolve(),idle?30:0)
})

async function translateNode(translator:DeviceTranslator,entry:Entry):Promise<void>{
  const lead=/^\s*/.exec(entry.original)![0],trail=/\s*$/.exec(entry.original)![0]
  const core=entry.original.trim()
  const done:string[]=[]
  for(const piece of pieces(core))done.push((await translator.translate(piece)).trim())
  const result=lead+done.join(' ')+trail
  if(entry.node.isConnected&&entry.node.nodeValue===entry.original){entry.node.nodeValue=result;entry.translated=result}
}

/** Puts every translated node back exactly as it was and clears the page's translation state. */
export function restoreOnDevice(doc:Document):void{
  const run=current
  current=null
  if(run){
    run.cancelled=true
    for(const entry of run.entries)if(entry.translated!==null&&entry.node.nodeValue===entry.translated)entry.node.nodeValue=entry.original
    try{run.translator?.destroy?.()}catch{/* nothing to release */}
  }
  unwrapProtectedNames(doc)
  clearAttrs(doc)
}

/**
 * Translate the page on this device. Resolves true once the work is under way and the first (visible) batch has been translated;
 * false when this device cannot do it (the caller then uses Google). The remaining text keeps arriving while the browser is idle.
 */
export async function runOnDevice(to:string,from:string,env:DeviceEnv):Promise<boolean>{
  const {doc,win}=env
  const api=deviceTranslatorFor(win)
  if(!api)return false
  const target=deviceCode(to),source=deviceCode(from)
  let availability:string
  try{availability=await within(api.availability({sourceLanguage:source,targetLanguage:target}),AVAILABILITY_TIMEOUT_MS,win)}catch{return false}
  if(availability!=='available'&&availability!=='downloadable'&&availability!=='downloading')return false
  restoreOnDevice(doc) // a second choice starts again from the original text
  const run:Run={id:++counter,entries:[],translator:null,cancelled:false}
  current=run
  const root=doc.documentElement
  root.setAttribute('data-translated',to)
  root.setAttribute('data-translated-by','device')
  const fail=()=>{if(current===run)restoreOnDevice(doc);else run.cancelled=true;return false}
  try{
    const created=api.create({
      sourceLanguage:source,targetLanguage:target,
      monitor:availability==='available'?undefined:(monitor)=>{
        root.setAttribute('data-translate-progress','0')
        monitor.addEventListener('downloadprogress',(event)=>{
          const loaded=(event as unknown as {loaded:number}).loaded
          if(!run.cancelled)root.setAttribute('data-translate-progress',String(Math.max(0,Math.min(100,Math.round(loaded*100)))))
        })
      },
    })
    // an installed model is ready quickly; a download has its own progress and is not cut short
    run.translator=await (availability==='available'?within(created,READY_TIMEOUT_MS,win):created)
  }catch{return fail()}
  if(run.cancelled)return false
  root.removeAttribute('data-translate-progress')
  wrapProtectedNames(doc)
  const nodes=collectTextNodes(doc)
  const visible=nodes.filter(n=>inView(n,win)),rest=nodes.filter(n=>!visible.includes(n))
  run.entries=nodes.map(node=>({node,original:node.nodeValue!,translated:null}))
  const byNode=new Map(run.entries.map(e=>[e.node,e]))
  const work=async(list:Text[],idle:boolean)=>{
    for(let i=0;i<list.length;i+=BATCH){
      if(run.cancelled)return
      for(const node of list.slice(i,i+BATCH)){
        if(run.cancelled)return
        const entry=byNode.get(node)!
        if(entry.translated!==null)continue
        try{await translateNode(run.translator!,entry)}catch{/* one node that fails keeps its English */}
      }
      await yieldNow(win,idle)
    }
  }
  try{
    // A translator that cannot translate even the first visible node is not usable: fall back to Google.
    const first=visible[0]??rest[0]
    if(first){
      await translateNode(run.translator,byNode.get(first)!)
      if(byNode.get(first)!.translated===null&&first.isConnected&&first.nodeValue===byNode.get(first)!.original)return fail()
    }
  }catch{return fail()}
  void work(visible,false).then(()=>work(rest,true))
  return true
}
