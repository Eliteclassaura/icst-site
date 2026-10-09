'use client'

import {useEffect} from 'react'

/**
 * LANG-PROXY-NAV-1: on Google's translation proxy (`<host>.translate.goog`) every page URL must carry the `_x_tr_*` parameters
 * (source/target language and the rest), or Google answers "Can't translate this page". The server-rendered links already carry them,
 * but after hydration Next's client router navigates to the bare path and drops the query. On that host only, an ordinary same-origin
 * link click is taken over: the destination keeps every `_x_tr_*` parameter of the current address and the browser loads it normally.
 * Every other host, link and click (new tab, modifier key, download, mailto/tel, hash-only, a different origin) is left alone.
 */
export const PROXY_HOST_SUFFIX='.translate.goog'
const PARAM_PREFIX='_x_tr_'

type LocationLike={hostname:string;origin:string;search:string;pathname:string;assign:(url:string)=>void}
type WindowLike={location:LocationLike}

export const onTranslateProxy=(hostname:string):boolean=>hostname.toLowerCase().endsWith(PROXY_HOST_SUFFIX)

/** The address a proxy click should load, or null when the click is not ours to take over. */
export function proxyDestination(anchor:HTMLAnchorElement,loc:Pick<LocationLike,'origin'|'search'|'pathname'>):string|null{
  const target=anchor.getAttribute('target')
  if(target&&target!=='_self')return null
  if(anchor.hasAttribute('download'))return null
  let url:URL
  // resolved against the current address (the page has no <base>), so the proxy origin is the link's own origin
  try{url=new URL(anchor.getAttribute('href')??'',`${loc.origin}${loc.pathname}${loc.search}`)}catch{return null}
  if(url.protocol!=='http:'&&url.protocol!=='https:')return null
  if(url.origin!==loc.origin)return null
  if(url.hash&&url.pathname===loc.pathname&&(url.search===''||url.search===loc.search))return null // a same-page hash link
  for(const [key,value] of new URLSearchParams(loc.search))if(key.startsWith(PARAM_PREFIX)&&!url.searchParams.has(key))url.searchParams.set(key,value)
  return url.toString()
}

/** The capture-phase click handler (exported for the tests). */
export function handleProxyClick(event:MouseEvent,win:WindowLike):void{
  if(!onTranslateProxy(win.location.hostname))return
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
  const anchor=(event.target instanceof Element?event.target.closest('a[href]'):null) as HTMLAnchorElement|null
  if(!anchor)return
  const destination=proxyDestination(anchor,win.location)
  if(!destination)return
  event.preventDefault()
  event.stopImmediatePropagation()
  win.location.assign(destination)
}

export function TranslateProxyNav(){
  useEffect(()=>{
    if(!onTranslateProxy(window.location.hostname))return
    const listener=(event:MouseEvent)=>handleProxyClick(event,window)
    document.addEventListener('click',listener,true)
    return()=>document.removeEventListener('click',listener,true)
  },[])
  return null
}
