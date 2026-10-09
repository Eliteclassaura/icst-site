'use client'
import {useEffect} from 'react'

/**
 * ARTICLE-LAYOUT-1: progressive enhancement for the contents. Marks the link of the heading in view (aria-current) and opens
 * the sub-list of its section. Renders nothing; the contents are plain anchors without it.
 */
export function ArticleTocSpy({ids}:{ids:string[]}){
  useEffect(()=>{
    const rail=document.querySelector<HTMLElement>('[data-article-toc]')
    if(!rail||!('IntersectionObserver' in window))return
    const links=new Map<string,HTMLAnchorElement>()
    for(const link of rail.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))links.set(link.hash.slice(1),link)
    const visible=new Set<string>()
    const mark=()=>{
      const first=ids.find(id=>visible.has(id))
      for(const item of rail.querySelectorAll('li[data-open]'))item.removeAttribute('data-open')
      for(const [id,link] of links){
        if(id!==first){link.removeAttribute('aria-current');continue}
        link.setAttribute('aria-current','location')
        // open the sub-list of this section (the H2 itself, or the H2 an H3 sits under)
        let top:Element|null=link.closest('li')
        while(top?.parentElement?.closest('li'))top=top.parentElement.closest('li')
        top?.setAttribute('data-open','')
      }
    }
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){if(entry.isIntersecting)visible.add(entry.target.id);else visible.delete(entry.target.id)}
      mark()
    },{rootMargin:'-96px 0px -60% 0px'})
    for(const id of ids){const el=document.getElementById(id);if(el)observer.observe(el)}
    return ()=>observer.disconnect()
  },[ids])
  return null
}
