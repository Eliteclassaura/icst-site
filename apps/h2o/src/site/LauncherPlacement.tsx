'use client'
import {useEffect} from 'react'

/**
 * Site-wide launcher placement. LAUNCHER-PLACEMENT-1 (owner, 2026-10-11, via CT): the launcher is a chat icon that stays on the
 * bottom right, so on a phone it is ALWAYS visible and tappable, except (a) while the chat panel is open (the panel covers the
 * page; the launcher is hidden by the panel's own state), and (b) while the inline quote form (#request-a-quote) is on screen,
 * so it never covers a field. The earlier holds (the first screen, scrolling down, until a scroll up or the page end) made the
 * icon invisible and untappable for most of the reading, so they are gone. Without the script the launcher simply stays (CSS).
 * The R4 pages' own hero rule (R4LauncherReveal) still applies on top.
 */
export function LauncherPlacement(){
  useEffect(()=>{
    const root=document.documentElement
    const phone=window.matchMedia('(width < 768px)')
    let formInView=false
    const update=()=>{
      const hold=phone.matches&&formInView
      if(hold)root.dataset.launcherHold=''
      else delete root.dataset.launcherHold
    }
    const form=document.getElementById('request-a-quote')
    const observer=form&&'IntersectionObserver' in window?new IntersectionObserver(([entry])=>{formInView=entry!.isIntersecting;update()}):null
    if(form)observer?.observe(form)
    root.dataset.launcherPlacement=''
    update()
    window.addEventListener('resize',update)
    phone.addEventListener('change',update)
    return ()=>{
      observer?.disconnect()
      window.removeEventListener('resize',update)
      phone.removeEventListener('change',update)
      delete root.dataset.launcherHold
      delete root.dataset.launcherPlacement
    }
  },[])
  return null
}
