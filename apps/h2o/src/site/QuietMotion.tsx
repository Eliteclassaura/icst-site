'use client'

import {useEffect} from 'react'

/** Progressive enhancement only: source DOM, indexing and readable defaults stay intact. */
export function QuietMotion(){
  useEffect(()=>{
    if(!('IntersectionObserver' in window)||!Element.prototype.animate)return
    const preference=matchMedia('(prefers-reduced-motion: reduce)')
    const animations=new Set<Animation>()
    const tokens=getComputedStyle(document.documentElement)
    const duration=Number.parseFloat(tokens.getPropertyValue('--ics-motion-reveal'))||440
    const easing=tokens.getPropertyValue('--ics-motion-ease').trim()||'ease-out'
    const targets=document.querySelectorAll<HTMLElement>('.figma-home [data-layout-node="26"], .figma-home [data-layout-node="31"] > div, .figma-home [data-layout-node="54"], .figma-home [data-layout-node="156"], .figma-home [data-precision-media], .authority-section:not(.authority-opening) .authority-heading, .figma-contact-offices h2')
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue
        observer.unobserve(entry.target)
        if(preference.matches)continue
        const element=entry.target as HTMLElement
        const image=element.hasAttribute('data-precision-media')
        const grouped=element.parentElement?.dataset.layoutNode==='31'
        const delay=grouped?Math.min(Array.from(element.parentElement!.children).indexOf(element),2)*45:0
        element.dataset.icsMotion=image?'image':grouped?'stagger':'reveal'
        const animation=element.animate([
          {opacity:image ? .92 : .82,transform:image?'scale(1.01)':'translateY(12px)'},
          {opacity:1,transform:image?'scale(1)':'translateY(0)'},
        ],{duration:image?duration+100:duration,delay,easing,iterations:1})
        animations.add(animation)
        animation.finished.then(()=>animations.delete(animation)).catch(()=>animations.delete(animation))
      }
    },{threshold:.12})
    const cancel=()=>{if(preference.matches){observer.disconnect();for(const animation of animations)animation.cancel();animations.clear()}}
    if(!preference.matches)targets.forEach(element=>observer.observe(element))
    preference.addEventListener('change',cancel)
    return ()=>{observer.disconnect();preference.removeEventListener('change',cancel);for(const animation of animations)animation.cancel()}
  },[])
  return null
}
