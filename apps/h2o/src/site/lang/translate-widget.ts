import {AVAILABLE,TRANSLATE,translateUrl} from './lang-model'
import {NO_TRANSLATE_REGIONS,RFQ_ROOTS,unwrapProtectedNames,wrapProtectedNames} from './translate-device'

/**
 * LANG-2: in-page translation with the Google Translate website widget, strictly opt-in.
 *
 * Nothing here runs against Google until the visitor picks a translation language in our menu (`translateInPlace`), or until the next
 * page of a visitor who already picked one (their `googtrans` cookie is the record of that choice: `resumeIfOptedIn`). Choosing
 * English (`restoreEnglish`) clears the cookie and reloads the original. If the widget cannot load (blocked, offline, slow), the
 * visitor gets the existing new-tab Google Translate link instead. The translated text exists only in the visitor's browser: no
 * URL, hreflang or sitemap entry changes. The script is added by our own (nonce'd) code, so the page's `'strict-dynamic'`
 * policy trusts it without any script host being allowed.
 */
export const GOOGTRANS='googtrans'
export const WIDGET_SRC='https://translate.google.com/translate_a/element.js'
export const WIDGET_CALLBACK='googleTranslateElementInit'
export const CONTAINER_ID='google_translate_element'
/** The private areas never load the widget (they have no language menu either). */
export const EXCLUDED_PATH=/^\/(?:admin|crm|api)(?:\/|$)/
export const LOAD_TIMEOUT_MS=12000

type Env={doc:Document;win:Window}
const here=():Env=>({doc:document,win:window})
type TranslateGlobal={google?:{translate?:{TranslateElement?:new(options:Record<string,unknown>,id:string)=>unknown}}}

const FROM_CODES:ReadonlySet<string>=new Set(AVAILABLE.map(item=>item.code))
const TO_CODES:ReadonlySet<string>=new Set(TRANSLATE.map(item=>item.tl))
export const validPair=(from:string,to:string):boolean=>FROM_CODES.has(from)&&TO_CODES.has(to)

/** `/from/to` in the cookie → the target language, or null. */
export function readGoogtrans(doc:Document=document):{from:string;to:string}|null{
  const match=/(?:^|;\s*)googtrans=([^;]*)/.exec(doc.cookie)
  if(!match)return null
  let value=match[1]!
  try{value=decodeURIComponent(value)}catch{/* keep the raw value */}
  const parts=/^\/([A-Za-z-]+)\/([A-Za-z-]+)$/.exec(value)
  // N2 (Security Auditor): the cookie is only trusted when it names a pair we offer: a page language, and one of the five translation languages.
  return parts&&validPair(parts[1]!,parts[2]!)?{from:parts[1]!,to:parts[2]!}:null
}

/** A session cookie for this host: it records the visitor's choice and is the only thing we set. */
export function setGoogtrans(doc:Document,from:string,to:string,secure:boolean):void{
  doc.cookie=`${GOOGTRANS}=/${from}/${to}; path=/; SameSite=Lax${secure?'; Secure':''}`
}

/** Expires every copy the widget may have made: this host and each parent domain (a leading dot or not). */
export function clearGoogtrans(doc:Document,hostname:string):void{
  const expire='expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  doc.cookie=`${GOOGTRANS}=; ${expire}`
  const labels=hostname.split('.')
  for(let i=0;i<labels.length-1;i++){
    const domain=labels.slice(i).join('.')
    doc.cookie=`${GOOGTRANS}=; ${expire}; domain=${domain}`
    doc.cookie=`${GOOGTRANS}=; ${expire}; domain=.${domain}`
  }
}

/** What the visitor typed, phone numbers and addresses stay exactly as written (Google does not alter input values; this makes the intent explicit). */
export function markNoTranslate(doc:Document):void{
  for(const el of doc.querySelectorAll('input,textarea,select,a[href^="tel:"],a[href^="mailto:"],[data-notranslate],'+NO_TRANSLATE_REGIONS+','+RFQ_ROOTS))el.setAttribute('translate','no')
  wrapProtectedNames(doc)
}

export const translatedLanguage=(doc:Document=document):string|null=>doc.documentElement.getAttribute('data-translated')

/** For `useSyncExternalStore`: the attribute on <html> is the state, a MutationObserver is the subscription. */
export function subscribeTranslated(onChange:()=>void,doc:Document=document):()=>void{
  const observer=new MutationObserver(onChange)
  observer.observe(doc.documentElement,{attributes:true,attributeFilter:['data-translated','data-translated-by','data-translate-progress']})
  return ()=>observer.disconnect()
}

function ensureContainer(doc:Document):void{
  if(doc.getElementById(CONTAINER_ID))return
  const box=doc.createElement('div')
  box.id=CONTAINER_ID
  box.hidden=true
  box.setAttribute('translate','no')
  box.className='notranslate'
  doc.body.appendChild(box)
}

/** After the widget is up, a second choice is made through its own (hidden) language control. */
function applyThroughCombo(doc:Document,to:string):boolean{
  const combo=doc.querySelector<HTMLSelectElement>('select.goog-te-combo')
  if(!combo)return false
  combo.value=to
  combo.dispatchEvent(new Event('change'))
  return true
}

export type TranslateOptions={to:string;from?:string;fallbackHref:string;env?:Env;timeoutMs?:number}

export function translateInPlace({to,from='en',fallbackHref,env=here(),timeoutMs=LOAD_TIMEOUT_MS}:TranslateOptions):void{
  const {doc,win}=env
  let failed=false
  let stopWatching=()=>{}
  const fail=()=>{
    if(failed)return
    failed=true
    stopWatching()
    // N-3: leave nothing behind, so the next language choice is not mistaken for "still loading" and retries (or opens the new tab)
    doc.querySelector('script[data-lang-widget]')?.remove?.()
    delete (win as unknown as Record<string,unknown>)[WIDGET_CALLBACK]
    clearGoogtrans(doc,win.location.hostname)
    doc.documentElement.removeAttribute('data-translated')
    doc.documentElement.removeAttribute('data-translated-by')
    unwrapProtectedNames(doc)
    if(!win.open(fallbackHref,'_blank','noopener'))win.location.assign(fallbackHref)
  }
  if(EXCLUDED_PATH.test(win.location.pathname)||!validPair(from,to)){fail();return}
  markNoTranslate(doc)
  setGoogtrans(doc,from,to,win.location.protocol==='https:')
  ensureContainer(doc)
  const marked=()=>{doc.documentElement.setAttribute('data-translated',to);doc.documentElement.setAttribute('data-translated-by','google')}
  // The widget is already up (an earlier choice on this page): switch through its own control.
  if((win as unknown as TranslateGlobal).google?.translate?.TranslateElement&&applyThroughCombo(doc,to)){marked();return}
  if(doc.querySelector('script[data-lang-widget]'))return // still loading: the cookie is set, the widget will pick it up
  ;(win as unknown as Record<string,unknown>)[WIDGET_CALLBACK]=()=>{
    const ctor=(win as unknown as TranslateGlobal).google?.translate?.TranslateElement
    if(!ctor){fail();return}
    new ctor({pageLanguage:from,autoDisplay:false},CONTAINER_ID)
    stopWatching();failed=true // loaded: a later error or violation must not tear the translation down
    marked()
  }
  const script=doc.createElement('script')
  script.src=`${WIDGET_SRC}?cb=${WIDGET_CALLBACK}`
  script.async=true
  script.setAttribute('data-lang-widget','')
  script.onerror=fail
  // N3: where the page's policy cannot run an injected script (the static hash-based policy, a misconfigured header), the browser
  // reports the block at once: go straight to the new-tab link instead of waiting out the timeout.
  // N-b: one listener per page, removed as soon as the widget is up, so a later unrelated violation can never navigate away.
  const onViolation=(event:Event)=>{
    const v=event as SecurityPolicyViolationEvent
    if(/^script-src/.test(v.effectiveDirective??'')&&/translate\.google\.com/.test(v.blockedURI??''))fail()
  }
  doc.addEventListener?.('securitypolicyviolation',onViolation)
  stopWatching=()=>doc.removeEventListener?.('securitypolicyviolation',onViolation)
  doc.head.appendChild(script)
  win.setTimeout(()=>{if(!(win as unknown as TranslateGlobal).google?.translate?.TranslateElement)fail()},timeoutMs)
}

export function restoreEnglish(env:Env=here()):void{
  const {doc,win}=env
  clearGoogtrans(doc,win.location.hostname)
  doc.documentElement.removeAttribute('data-translated')
  doc.documentElement.removeAttribute('data-translated-by')
  win.location.reload()
}

/** A visitor who chose a language earlier (the cookie) keeps it on the next page; anyone else loads nothing from Google. */
export function resumeIfOptedIn(pageLanguage:string,env:Env=here()):void{
  const {doc,win}=env
  if(EXCLUDED_PATH.test(win.location.pathname))return
  const chosen=readGoogtrans(doc)
  if(!chosen||chosen.to===pageLanguage)return
  translateInPlace({to:chosen.to,from:chosen.from,fallbackHref:translateUrl(win.location.pathname,chosen.to,chosen.from,win.location.origin),env})
}
