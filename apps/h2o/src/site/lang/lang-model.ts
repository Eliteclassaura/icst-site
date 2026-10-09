/**
 * LANG-1 (owner decision 2026-10-08, "Option A"): the language selector's data model. Pure functions, no I/O, so the counterpart
 * lookup, the translate-URL builder, the first-visit suggestion and the menu state machine are unit-tested.
 *
 * Counterparts come from the existing OGCS locale clusters (the same source hreflang uses, with the sitemap's redirect guard),
 * handed in as `alternates` (hreflang -> absolute URL). A language with no counterpart for the page is disabled: the selector
 * never links to a 3xx/4xx target and never redirects anyone.
 */
export const CANONICAL_ORIGIN='https://h2ocooling.com'

export type AvailableCode='en'|'th'|'ja'|'id'|'vi'
export type TranslateCode='ms'|'zh'|'ko'|'es'|'ar'|'th'|'ja'|'vi'|'id'

type Lang={native:string;lang:string;dir?:'rtl'}
export const AVAILABLE:ReadonlyArray<Lang&{code:AvailableCode}>=[
  {code:'en',native:'English',lang:'en'},
  {code:'th',native:'ไทย',lang:'th'},
  {code:'ja',native:'日本語',lang:'ja'},
  {code:'id',native:'Bahasa Indonesia',lang:'id'},
  {code:'vi',native:'Tiếng Việt',lang:'vi'},
]
export const TRANSLATE:ReadonlyArray<Lang&{code:TranslateCode;tl:string}>=[
  {code:'ms',tl:'ms',native:'Bahasa Melayu',lang:'ms'},
  {code:'zh',tl:'zh-CN',native:'中文 (简体)',lang:'zh-CN'},
  {code:'ko',tl:'ko',native:'한국어',lang:'ko'},
  {code:'es',tl:'es',native:'Español',lang:'es'},
  {code:'ar',tl:'ar',native:'العربية',lang:'ar',dir:'rtl'},
  {code:'th',tl:'th',native:'ไทย',lang:'th'},
  {code:'ja',tl:'ja',native:'日本語',lang:'ja'},
  {code:'vi',tl:'vi',native:'Tiếng Việt',lang:'vi'},
  {code:'id',tl:'id',native:'Bahasa Indonesia',lang:'id'},
]

export type AvailableItem={code:AvailableCode;native:string;lang:string;href:string|null;current:boolean}
export type TranslateItem={code:TranslateCode;native:string;lang:string;dir?:'rtl';href:string;/** the Google language code (googtrans) */tl:string;/** the page's canonical path + query and its source language, so the client can name the serving host in `u=` (translateHref) */path:string;sl:string}
export type LanguageMenuData={current:AvailableCode;available:AvailableItem[];translate:TranslateItem[]}

const LOCALE_PREFIX=/^\/(th|ja|id|vi)\//
const decode=(value:string)=>{try{return decodeURIComponent(value)}catch{return value}}

/** The language of a page by its public path: the four preserved locale folders, otherwise English. */
export function languageOfPath(pathname:string):AvailableCode{
  const match=LOCALE_PREFIX.exec(decode(pathname))
  return (match?.[1] as AvailableCode|undefined)??'en'
}

/**
 * LANG-HOST-1: the hosts whose own origin may be named in a Google Translate link (exact match only): the public site, its www host and
 * the private preview. Anything else, a spoofed or unknown Host included, falls back to the canonical origin; a Host header is never echoed.
 */
export const TRANSLATE_ORIGINS:ReadonlySet<string>=new Set(['https://h2ocooling.com','https://www.h2ocooling.com','https://staging.h2ocooling.org'])
export const translateOriginFor=(origin?:string|null):string=>origin&&TRANSLATE_ORIGINS.has(origin)?origin:CANONICAL_ORIGIN

/** An absolute or site-relative URL to its normalised, percent-encoded path on the canonical host (or an allowlisted serving origin). */
export function canonicalUrl(pathname:string,origin:string=CANONICAL_ORIGIN):string{
  const url=new URL(pathname.startsWith('http')?pathname:pathname.startsWith('/')?pathname:'/'+pathname,CANONICAL_ORIGIN)
  return translateOriginFor(origin)+url.pathname+url.search
}

/** A same-site path (percent-encoded) for a cluster member URL; null if the URL is not on the canonical host. */
export function sitePath(url:string):string|null{
  try{
    const parsed=new URL(url,CANONICAL_ORIGIN)
    if(parsed.origin!==CANONICAL_ORIGIN)return null
    return parsed.pathname
  }catch{return null}
}

/**
 * The outbound Google Translate link for a page. `origin` is the host serving the request: when it is one of TRANSLATE_ORIGINS the page
 * URL names that host (so the private preview translates itself, not the old site behind the public name); otherwise the canonical origin.
 */
export function translateUrl(pathname:string,tl:string,sl='en',origin?:string|null):string{
  return `https://translate.google.com/translate?sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&u=${encodeURIComponent(canonicalUrl(pathname,translateOriginFor(origin)))}`
}
/** A menu item's link for the serving origin (the client knows it; the server renders the canonical one). */
export const translateHref=(item:Pick<TranslateItem,'path'|'tl'|'sl'>,origin?:string|null):string=>translateUrl(item.path,item.tl,item.sl,origin)

export function languageMenu(pathname:string,alternates?:Readonly<Record<string,string>>):LanguageMenuData{
  const current=languageOfPath(pathname)
  const sl=current==='en'?'en':'auto'
  return {
    current,
    available:AVAILABLE.map(item=>{
      const isCurrent=item.code===current
      const member=alternates?.[item.code]
      const href=isCurrent?(sitePath(canonicalUrl(pathname))):(member?sitePath(member):null)
      return {code:item.code,native:item.native,lang:item.lang,href:href??null,current:isCurrent}
    }),
    // LANG-HOST-1: a language this page already has a native version of (the Available group) is not offered as a machine translation too
    translate:TRANSLATE.filter(item=>!AVAILABLE.some(a=>a.code===item.code&&(a.code===current||alternates?.[a.code]&&sitePath(alternates[a.code]!)))).map(item=>({code:item.code,native:item.native,lang:item.lang,...(item.dir?{dir:item.dir}:{}),href:translateUrl(pathname,item.tl,sl),tl:item.tl,path:canonicalUrl(pathname).slice(CANONICAL_ORIGIN.length),sl})),
  }
}

/** First-visit suggestion. Never a redirect: the caller only shows a dismissible bar with a link. */
export type Suggestion={kind:'page';code:AvailableCode;native:string;lang:string;href:string}|{kind:'translate';code:TranslateCode;native:string;lang:string;dir?:'rtl';href:string}|null
const PRIMARY=(tag:string)=>tag.toLowerCase().split('-')[0]!
export function suggestionFor(data:LanguageMenuData,preferred:ReadonlyArray<string>):Suggestion{
  for(const tag of preferred){
    const code=PRIMARY(tag)
    if(code==='en')return null
    const page=data.available.find(item=>item.code===code)
    if(page){
      if(page.current)return null
      return page.href?{kind:'page',code:page.code,native:page.native,lang:page.lang,href:page.href}:null
    }
    const translate=data.translate.find(item=>item.code===code)
    if(translate)return {kind:'translate',code:translate.code,native:translate.native,lang:translate.lang,...(translate.dir?{dir:translate.dir}:{}),href:translate.href}
  }
  return null
}

/** The suggestion is remembered (dismissed or chosen) per browser; reads and writes never throw. */
export const LANG_STORAGE_KEY='h2o-lang-suggestion'
export function readDismissed(storage:Pick<Storage,'getItem'>|undefined):boolean{
  try{return storage?.getItem(LANG_STORAGE_KEY)==='1'}catch{return false}
}
export function writeDismissed(storage:Pick<Storage,'setItem'>|undefined):void{
  try{storage?.setItem(LANG_STORAGE_KEY,'1')}catch{/* storage unavailable: the bar simply shows again */}
}

/** The menu button's state machine (keyboard and pointer). `focusButton` tells the component to return focus to the button. */
export type MenuState={open:boolean;focusButton:boolean}
export type MenuEvent='toggle'|'escape'|'outside'|'select'
export function menuReducer(state:MenuState,event:MenuEvent):MenuState{
  switch(event){
    case 'toggle':return {open:!state.open,focusButton:false}
    case 'escape':return state.open?{open:false,focusButton:true}:state
    case 'outside':return state.open?{open:false,focusButton:false}:state
    case 'select':return {open:false,focusButton:false}
  }
}
