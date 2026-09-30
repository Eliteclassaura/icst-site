'use client'

import {useEffect,useRef,useState,type ReactNode} from 'react'
import {usePathname} from 'next/navigation'

import {salmonNavigation,siteNavigation} from './navigation-data'
export {salmonNavigation,siteNavigation} from './navigation-data'
/** A navigation group as rendered: code-defined defaults, or the published `site-chrome` content (R1B). */
export type NavigationGroup={label:string;href?:string;items?:ReadonlyArray<readonly [string,string]>;sections?:ReadonlyArray<{label:string;items:ReadonlyArray<readonly [string,string]>}>}

export function SiteNavigation({mobileQuote,salmonParity=false,groups:contentGroups}:{mobileQuote:ReactNode;salmonParity?:boolean;groups?:ReadonlyArray<NavigationGroup>}){
  const groups:ReadonlyArray<NavigationGroup>=contentGroups??(salmonParity?salmonNavigation:siteNavigation)
  const pathname=usePathname()
  const [open,setOpen]=useState<string|null>(null)
  const [mobileOpen,setMobileOpen]=useState(false)
  const triggers=useRef<Record<string,HTMLButtonElement|null>>({})
  const desktopNav=useRef<HTMLElement|null>(null)
  const mobileToggle=useRef<HTMLButtonElement|null>(null)
  useEffect(()=>{const escape=(event:globalThis.KeyboardEvent)=>{
    if(event.key!=='Escape')return
    if(open){event.preventDefault();triggers.current[open]?.focus();setOpen(null)}
    else if(mobileOpen){event.preventDefault();setMobileOpen(false);mobileToggle.current?.focus()}
  };document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[open,mobileOpen])
  useEffect(()=>{
    const closeOnFocus=(event:FocusEvent)=>{if(open&&!desktopNav.current?.contains(event.target as Node))setOpen(null)}
    const closeOnPointer=(event:PointerEvent)=>{if(open&&!desktopNav.current?.contains(event.target as Node))setOpen(null)}
    document.addEventListener('focusin',closeOnFocus)
    document.addEventListener('pointerdown',closeOnPointer)
    return()=>{document.removeEventListener('focusin',closeOnFocus);document.removeEventListener('pointerdown',closeOnPointer)}
  },[open])
  return <>
    <nav ref={desktopNav} className="lux-desktop-nav site-nav" aria-label="Primary">
      {groups.map((group,index)=><div className={`site-nav-group${group.label==='Services'?' site-nav-group-services':''}${group.label==='Parts'?' site-nav-group-parts':''}`} key={group.label}>
        {group.href?<a className="site-nav-direct" href={group.href} aria-current={pathname===group.href?'page':undefined}>{group.label}</a>:null}
        {group.items?<><button type="button" ref={node=>{triggers.current[group.label]=node}} className="site-nav-trigger" aria-label={group.href?`Open ${group.label} menu`:group.label} aria-expanded={open===group.label} aria-controls={`site-nav-panel-${index}`} onClick={()=>setOpen(open===group.label?null:group.label)}>{group.href?null:group.label}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>
          <div id={`site-nav-panel-${index}`} className="site-nav-panel" hidden={open!==group.label}><span className="site-nav-panel-label">{group.label}</span>{group.sections?<><a className="site-nav-panel-hub" href={group.href}>All repair and maintenance</a><div className="site-nav-panel-sections">{group.sections.map(section=><div key={section.label}><span className="site-nav-section-label">{section.label}</span>{section.items.map(([label,href])=><a href={href} key={href}>{label}</a>)}</div>)}</div></>:group.items.map(([label,href])=><a href={href} key={href}>{label}</a>)}</div></>:null}
      </div>)}
      <a className="site-nav-search" href="/search/" aria-label="Search the ICS site"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 5 5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg><span className="sr-only">Search</span></a>
    </nav>
    <div className="lux-menu site-mobile-nav">
      <button ref={mobileToggle} className="site-mobile-toggle" type="button" aria-expanded={mobileOpen} aria-controls="site-mobile-panel" aria-label={mobileOpen?'Close navigation':'Open navigation'} onClick={()=>setMobileOpen(!mobileOpen)}><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={mobileOpen?'M5 5 19 19M19 5 5 19':'M3 6h18M3 12h18M3 18h18'} fill="none" stroke="currentColor" strokeWidth="2"/></svg></button>
      <nav id="site-mobile-panel" className="site-mobile-panel" aria-label="Mobile" hidden={!mobileOpen}>
        <form className="site-mobile-search-form" action="/search/" role="search"><label className="sr-only" htmlFor="mobile-navigation-search">Search the ICS site</label><input id="mobile-navigation-search" type="search" name="q" placeholder="Search the site" required maxLength={200}/><button type="submit">Search</button></form>
        {groups.map(group=><div className="site-mobile-group" key={group.label}>{group.items?<details><summary>{group.label}</summary><div className="site-mobile-group-links">{group.items.map(([label,href])=><a href={href} key={href}>{label}</a>)}</div></details>:<a href={group.href}>{group.label}</a>}</div>)}
        <div className="site-mobile-quote">{mobileQuote}</div>
        <a className="site-mobile-contact" href="/contact-us/">Contact us</a>
      </nav>
    </div>
  </>
}
