'use client'
import {useEffect} from 'react'

/**
 * Site-wide launcher placement (CT 2026-10-07; QA pre-pass S3, Codex crawl R1 (d); the R4 F1 rule applied to every page;
 * Main owns the placement, CRM's RFQ-FIX-1 owns the launcher itself). Below 768 px the corner launcher is held back while
 * the first screen is in view (it never covers the hero's text or actions) and while the inline quote form
 * (#request-a-quote) is on screen (it never covers a field). QA R17B S2: while the visitor scrolls down it is also held back
 * (it covered text and links at about half the scroll positions on a phone) and returns on the first scroll up and at the end of
 * the page, where the footer reserves its space (design-r5.css). Without the script the launcher simply stays (CSS fallback).
 * The R4 pages' own hero rule (R4LauncherReveal) still applies on top.
 */
export function LauncherPlacement(){
  useEffect(()=>{
    const root=document.documentElement
    const phone=window.matchMedia('(width < 768px)')
    let formInView=false
    let down=false
    let lastY=window.scrollY
    const atEnd=()=>window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-24
    const update=()=>{
      const y=window.scrollY
      if(y>lastY+6)down=true
      else if(y<lastY-6)down=false
      if(Math.abs(y-lastY)>6)lastY=y
      const hold=phone.matches&&(y<window.innerHeight*0.6||formInView||(down&&!atEnd()))
      if(hold)root.dataset.launcherHold=''
      else delete root.dataset.launcherHold
    }
    const form=document.getElementById('request-a-quote')
    const observer=form&&'IntersectionObserver' in window?new IntersectionObserver(([entry])=>{formInView=entry!.isIntersecting;update()}):null
    if(form)observer?.observe(form)
    root.dataset.launcherPlacement=''
    update()
    window.addEventListener('scroll',update,{passive:true})
    window.addEventListener('resize',update)
    phone.addEventListener('change',update)
    return ()=>{
      observer?.disconnect()
      window.removeEventListener('scroll',update)
      window.removeEventListener('resize',update)
      phone.removeEventListener('change',update)
      delete root.dataset.launcherHold
      delete root.dataset.launcherPlacement
    }
  },[])
  return null
}
