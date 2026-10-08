'use client'

import {useEffect,useId,useReducer,useRef,useState,useSyncExternalStore} from 'react'
import {menuReducer,readDismissed,suggestionFor,writeDismissed,type LanguageMenuData,type Suggestion} from './lang-model'

/**
 * LANG-1: the header's language button and menu (a disclosure: aria-expanded, Escape closes and returns focus, a click or focus
 * outside closes), and the first-visit suggestion bar. Normal links only; nothing here redirects or sets a cookie. The
 * suggestion choice is remembered in localStorage, wrapped in try/catch.
 */
const Globe=()=><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>

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
  const current=data.available.find(item=>item.current)
  return <div ref={root} className={`lang-menu lang-menu--${variant}`} data-lang-menu={variant}>
    <button ref={button} type="button" className="lang-button" aria-expanded={state.open} aria-controls={panelId} aria-label="Language" data-current={current?.native} onClick={()=>dispatch('toggle')}>
      <Globe/><span className="lang-button-label" lang={current?.lang}>{variant==='mobile'?'Language':current?.code.toUpperCase()}</span>{variant==='mobile'?<><span className="lang-current-name" lang={current?.lang}>{current?.native}</span><span className="lang-chevron" aria-hidden="true"/></>:null}
    </button>
    <div id={panelId} className="lang-panel" hidden={!state.open}>
      <p className="lang-group-label" id={`${panelId}-a`}>Available</p>
      <ul className="lang-list" aria-labelledby={`${panelId}-a`}>
        {/* LANG-1.2 (owner via CT 2026-10-08): only the languages that exist for this page are listed (usually English alone); a language with no counterpart is not shown as a disabled entry */}
        {data.available.filter(item=>item.href).map(item=><li key={item.code}>
          <a href={item.href!} lang={item.lang} hrefLang={item.lang} aria-current={item.current?'page':undefined} onClick={()=>dispatch('select')}>{item.current?<span className="lang-check" aria-hidden="true">✓</span>:null}{item.native}{item.current?<span className="lang-sr"> (current language)</span>:null}</a>
        </li>)}
      </ul>
      <p className="lang-group-label" id={`${panelId}-t`}>Translate this page (Google Translate)</p>
      <ul className="lang-list" aria-labelledby={`${panelId}-t`}>
        {data.translate.map(item=><li key={item.code}>
          <a href={item.href} target="_blank" rel="noopener noreferrer nofollow" lang={item.lang} dir={item.dir} onClick={()=>dispatch('select')}>{item.native}<span className="lang-ext" aria-hidden="true">↗</span><span className="lang-sr"> (opens Google Translate in a new tab; machine translation)</span></a>
        </li>)}
      </ul>
      <p className="lang-note">Machine translation by Google opens in a new tab. ICS does not review it.</p>
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

