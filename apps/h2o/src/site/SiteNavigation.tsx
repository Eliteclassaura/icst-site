'use client'

import {useEffect,useRef,useState,type ReactNode} from 'react'

export const siteNavigation=[
  {label:'Cooling Towers',href:'/cooling-tower/',items:[['New Cooling Towers','/cooling-tower/'],['Cooling Tower Replacement','/cooling-tower-replacement/'],['Thermal Upgrade','/thermal-upgrade/']]},
  {label:'Services',items:[['Repair & Maintenance','/cooling-tower-maintenance-repair-upgrade/'],['Disaster Recovery','/disaster-recovery/'],['Dry Soda Blasting','/dry-soda-blasting/'],['Air Coolers','/air-coolers/']]},
  {label:'Parts',href:'/cooling-tower-parts-online/'},
  {label:'Projects',href:'/all-projects/'},
  {label:'Resources',items:[['Resources','/resources/'],['Technical Articles','/tech-articles/'],['Brochures','/cooling-tower-brochures/'],['Search','/search/']]},
  {label:'Company',items:[['About ICS','/about-ics-industrial-cooling-solutions/'],['Contact Us','/contact-us/']]},
] as const
export const salmonNavigation=[
  {label:'New Towers',href:'/cooling-tower/',items:[['New Cooling Towers','/cooling-tower/'],['Cooling Tower Replacement','/cooling-tower-replacement/'],['Thermal Upgrade','/thermal-upgrade/']]},
  {label:'Repair Upgrades And Maintenance',href:'/cooling-tower-maintenance-repair-upgrade/',items:[['All repair and maintenance','/cooling-tower-maintenance-repair-upgrade/'],['Crossflow towers','/crossflow-cooling-tower-repair-maintenance/'],['Counterflow towers','/counterflow-cooling-tower-repair-maintenance/'],['Wet, hybrid and dry towers','/wet-hybrid-dry-cooling-tower-repair/'],['Low drift solutions','/low-drift-cooling-tower-solutions/'],['Emergency repair','/emergency-cooling-tower-repair/'],['Rebuilds and new towers','/cooling-tower-rebuilds-new-towers/'],['Disaster Recovery','/disaster-recovery/'],['Dry Soda Blasting','/dry-soda-blasting/']]},
  {label:'Air Coolers',href:'/air-coolers/'},
  {label:'Parts',href:'/cooling-tower-parts-online/'},
  {label:'Projects',href:'/all-projects/'},
  {label:'About ICS',href:'/about-ics-industrial-cooling-solutions/',items:[['About ICS','/about-ics-industrial-cooling-solutions/'],['Contact Us','/contact-us/']]},
  {label:'Cooling Towers Resources',href:'/resources/',items:[['Resources','/resources/'],['Brochures','/cooling-tower-brochures/'],['Tools','/cooling-tower-resources/tools/'],['Technical articles','/tech-articles/'],['Search','/search/']]},
] as const

export function SiteNavigation({mobileQuote,salmonParity=false}:{mobileQuote:ReactNode;salmonParity?:boolean}){
  const groups=salmonParity?salmonNavigation:siteNavigation
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
      {groups.map((group,index)=><div className="site-nav-group" key={group.label}>
        {'href' in group?<a className="site-nav-direct" href={group.href}>{group.label}</a>:null}
        {'items' in group?<><button type="button" ref={node=>{triggers.current[group.label]=node}} className="site-nav-trigger" aria-label={'href' in group?`Open ${group.label} menu`:group.label} aria-expanded={open===group.label} aria-controls={`site-nav-panel-${index}`} onClick={()=>setOpen(open===group.label?null:group.label)}>{'href' in group?null:group.label}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>
          <div id={`site-nav-panel-${index}`} className="site-nav-panel" hidden={open!==group.label}><span className="site-nav-panel-label">{group.label}</span>{group.items.map(([label,href])=><a href={href} key={href}>{label}<span aria-hidden="true">↗</span></a>)}</div></>:null}
      </div>)}
      {!salmonParity?<a className="site-nav-search" href="/search/" aria-label="Search the ICS site"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 5 5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg><span>Search</span></a>:null}
    </nav>
    <div className="lux-menu site-mobile-nav">
      <button ref={mobileToggle} className="site-mobile-toggle" type="button" aria-expanded={mobileOpen} aria-controls="site-mobile-panel" aria-label={mobileOpen?'Close navigation':'Open navigation'} onClick={()=>setMobileOpen(!mobileOpen)}><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={mobileOpen?'M5 5 19 19M19 5 5 19':'M3 6h18M3 12h18M3 18h18'} fill="none" stroke="currentColor" strokeWidth="2"/></svg></button>
      <nav id="site-mobile-panel" className="site-mobile-panel" aria-label="Mobile" hidden={!mobileOpen}>
        <a className="site-mobile-search" href="/search/">Search the site <span aria-hidden="true">↗</span></a>
        {groups.map(group=><div className="site-mobile-group" key={group.label}>{'items' in group?<details><summary>{group.label}</summary><div className="site-mobile-group-links">{group.items.map(([label,href])=><a href={href} key={href}>{label}</a>)}</div></details>:<a href={group.href}>{group.label}</a>}</div>)}
        <div className="site-mobile-quote">{mobileQuote}</div>
      </nav>
    </div>
  </>
}
