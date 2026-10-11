'use client'
import {useEffect} from 'react'

/**
 * B8 (staging audit, DD targets 2026-10-11): the mobile action bar covered the "Request a Quote" heading on /contact-us/. While the section
 * with the given id is on screen the bar is hidden (data-hidden, display:none below 768 px in design-r3.css); it returns when the section leaves.
 */
export function StickyBarVisibility({targetId}:{targetId:string}){
  useEffect(()=>{
    const target=document.getElementById(targetId),bar=document.querySelector<HTMLElement>('.dr3-sticky')
    if(!target||!bar||typeof IntersectionObserver==='undefined')return
    const observer=new IntersectionObserver(entries=>{for(const entry of entries)bar.dataset.hidden=entry.isIntersecting?'true':'false'},{threshold:0.05})
    observer.observe(target)
    return ()=>{observer.disconnect();delete bar.dataset.hidden}
  },[targetId])
  return null
}
