'use client'

import {useEffect,useId,useReducer,useRef,useState,useSyncExternalStore,type MouseEvent} from 'react'
import {resumeIfOptedIn,subscribeTranslated} from './translate-widget'
import {translateStatus} from './translate-device'
import {restorePage,translatePage} from './translate-page'
import {useTranslateMode} from './TranslateMode'
import type {TranslateMode} from './translate-switch'
import {menuReducer,readDismissed,suggestionFor,writeDismissed,type LanguageMenuData,type Suggestion} from './lang-model'

/**
 * LANG-1: the header's language button and menu (a disclosure: aria-expanded, Escape closes and returns focus, a click or focus
 * outside closes), and the first-visit suggestion bar. Normal links only; nothing here redirects or sets a cookie. The
 * suggestion choice is remembered in localStorage, wrapped in try/catch.
 */
const Globe=()=><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>

/** A plain left click (a modified click keeps its normal new-tab behaviour). */
const plain=(event:MouseEvent)=>!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey

/**
 * LANG-2: the note that stays on screen while a page is translated, with the way back. It also continues the choice of a visitor who
 * picked a language on an earlier page (their googtrans cookie); anyone else loads nothing from Google.
 */
export function TranslateNote({pageLanguage}:{pageLanguage:string}){
  const status=useSyncExternalStore(subscribeTranslated,()=>translateStatus(),()=>null)
  const mode=useTranslateMode()
  useEffect(()=>{if(mode==='full')resumeIfOptedIn(pageLanguage)},[pageLanguage,mode])
  if(!status)return null
  const [,by,progress]=status.split('|')
  const text=progress?`Preparing translation on your device… ${progress}%`:by==='device'?'Translated on your device. ICS does not review it.':'Machine translation by Google. ICS does not review it.'
  return <div className="translate-note notranslate" translate="no" role="status">
    <span>{text}</span>
    {by==='device'&&!progress?<span className="translate-help">Translation applies to this page. Choose a language again on other pages.</span>:null}
    <button type="button" onClick={()=>restorePage()}>Show original</button>
  </div>
}

/** What the menu says before a language is chosen: true for the path this request will actually take. */
export const DISCLOSURE:Record<TranslateMode,string>={
  full:'Translation runs in your browser where supported. Otherwise Google Translate is used, which sends the page text to Google.',
  'no-google':'Translation runs in your browser where supported. Otherwise Google Translate opens in a new tab.',
  links:'Google Translate opens in a new tab.',
}

export function LanguageMenu({data,variant}:{data:LanguageMenuData;variant:'desktop'|'mobile'}){
  const [state,dispatch]=useReducer(menuReducer,{open:false,focusButton:false})
  const root=useRef<HTMLDivElement|null>(null)
  const button=useRef<HTMLButtonElement|null>(null)
  const panelId=useId()
  useEffect(()=>{
    if(state.focusButton)button.current?.focus()
  },[state])
  useEffect(()=>{
    if(!state.open)return
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dispatch('escape')}}
    const onOutside=(event:Event)=>{if(root.current&&!root.current.contains(event.target as Node))dispatch('outside')}
    document.addEventListener('keydown',onKey,true)
    document.addEventListener('pointerdown',onOutside)
    document.addEventListener('focusin',onOutside)
    return()=>{document.removeEventListener('keydown',onKey,true);document.removeEventListener('pointerdown',onOutside);document.removeEventListener('focusin',onOutside)}
  },[state.open])
  const mode=useTranslateMode()
  const status=useSyncExternalStore(subscribeTranslated,()=>translateStatus(),()=>null)
  const current=data.available.find(item=>item.current)
  // Design Director T3: while a page is translated the control names the language being shown (ES, Español), and says EN again after "Show original".
  const shown=status?data.translate.find(item=>item.tl===status.split('|')[0]):undefined
  return <div ref={root} className={`lang-menu lang-menu--${variant}`} data-lang-menu={variant} translate="no">
    <button ref={button} type="button" className="lang-button" aria-expanded={state.open} aria-controls={panelId} aria-label="Language" data-current={shown?.native??current?.native} onClick={()=>dispatch('toggle')}>
      <Globe/><span className="lang-button-label" lang={shown?.lang??current?.lang}>{variant==='mobile'?'Language':(shown?.code??current?.code)?.toUpperCase()}</span>{variant==='mobile'?<><span className="lang-current-name" lang={shown?.lang??current?.lang}>{shown?.native??current?.native}</span><span className="lang-chevron" aria-hidden="true"/></>:null}
    </button>
    <div id={panelId} className="lang-panel" hidden={!state.open}>
      <p className="lang-group-label" id={`${panelId}-a`}>Available</p>
      <ul className="lang-list" aria-labelledby={`${panelId}-a`}>
        {/* LANG-1.2 (owner via CT 2026-10-08): only the languages that exist for this page are listed (usually English alone); a language with no counterpart is not shown as a disabled entry */}
        {data.available.filter(item=>item.href).map(item=><li key={item.code}>
          <a href={item.href!} lang={item.lang} hrefLang={item.lang} aria-current={item.current?'page':undefined} onClick={event=>{if(item.code==='en'&&translateStatus()&&plain(event)){event.preventDefault();dispatch('select');restorePage()}else dispatch('select')}}>{item.current?<span className="lang-check" aria-hidden="true">✓</span>:null}{item.native}{item.current?<span className="lang-sr"> (current language)</span>:null}</a>
        </li>)}
      </ul>
      <p className="lang-group-label" id={`${panelId}-t`}>Translate this page</p>
      <p className="lang-note lang-disclosure">{DISCLOSURE[mode]} See our <a href="/cookie-notice/">Cookie Notice</a> and <a href="/privacy-policy/">Privacy Notice</a>.</p>
      <ul className="lang-list" aria-labelledby={`${panelId}-t`}>
        {data.translate.map(item=><li key={item.code}>
          <a href={item.href} target="_blank" rel="noopener noreferrer nofollow" lang={item.lang} dir={item.dir} onClick={event=>{dispatch('select');if(mode!=='links'&&plain(event)){event.preventDefault();void translatePage({to:item.tl,from:data.current==='en'?'en':data.current,fallbackHref:item.href,mode})}}}>{item.native}<span className="lang-ext" aria-hidden="true">↗</span><span className="lang-sr"> (machine translation; falls back to Google Translate in a new tab if your browser cannot translate in place)</span></a>
        </li>)}
      </ul>
      <p className="lang-note">Machine translation. ICS does not review it.</p>
    </div>
  </div>
}

/** The first-visit suggestion: a small dismissible bar, never a redirect. Shown only when the browser prefers another language. */
const subscribeNothing=()=>()=>{}
const browserStorage=():Storage|undefined=>{try{return window.localStorage}catch{return undefined}}
export function LanguageBar({data}:{data:LanguageMenuData}){
  // Read on the client only (the server snapshot is empty): nothing is rendered on the server, so there is no hydration mismatch.
  const raw=useSyncExternalStore(subscribeNothing,()=>{
    if(readDismissed(browserStorage()))return ''
    const preferred=navigator.languages?.length?navigator.languages:[navigator.language].filter(Boolean)
    return JSON.stringify(suggestionFor(data,preferred)??'')
  },()=>'')
  const [dismissed,setDismissed]=useState(false)
  const suggestion:Suggestion=raw&&raw!=='""'&&!dismissed?JSON.parse(raw) as Suggestion:null
  const dismiss=()=>{writeDismissed(browserStorage());setDismissed(true)}
  if(!suggestion)return null
  const external=suggestion.kind==='translate'
  return <div className="lang-bar" role="region" aria-label="Language suggestion" data-lang-suggestion={suggestion.code}>
    <p>{external?<>This page can be translated into <span lang={suggestion.lang} dir={suggestion.dir}>{suggestion.native}</span> (machine translation by Google).</>:<>This page is available in <span lang={suggestion.lang}>{suggestion.native}</span>.</>}</p>
    <a href={suggestion.href} lang={suggestion.lang} {...(external?{target:'_blank',rel:'noopener noreferrer nofollow'}:{hrefLang:suggestion.lang})} onClick={dismiss}>{external?'Translate':'View'} →</a>
    <button type="button" onClick={dismiss} aria-label="Dismiss language suggestion">×</button>
  </div>
}

