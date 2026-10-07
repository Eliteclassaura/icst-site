'use client'
import {useEffect} from 'react'

/**
 * DD R4 final review F1 (2026-10-07): below 768 the corner launcher appears only once the R4 hero has scrolled out of view,
 * so it never covers a hero CTA or the hero text (the hero carries the primary Request a Quote). This marks the root:
 * `data-r4-reveal` (the script runs) and `data-r4-hero-out` (the hero is out of view); design-r4.css does the rest. Without
 * the script the launcher stays visible and the hero lead and actions keep 64 px clear at the inline end (the no-JS fallback).
 */
export function R4LauncherReveal(){
  useEffect(()=>{
    const root=document.documentElement
    root.dataset.r4Reveal=''
    const hero=document.querySelector('[data-r4-route] :is(.dr4-hero, .r5-hero, .r5-series-head, .r5-product-head)')
    if(!hero||!('IntersectionObserver' in window)){root.dataset.r4HeroOut='';return ()=>{delete root.dataset.r4Reveal;delete root.dataset.r4HeroOut}}
    const observer=new IntersectionObserver(([entry])=>{
      if(entry?.isIntersecting)delete root.dataset.r4HeroOut
      else root.dataset.r4HeroOut=''
    })
    observer.observe(hero)
    return ()=>{observer.disconnect();delete root.dataset.r4Reveal;delete root.dataset.r4HeroOut}
  },[])
  return null
}
