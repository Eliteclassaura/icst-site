'use client'
import {useEffect,useState,type MouseEvent} from 'react'

export type ChipTopic={slug:string;name:string;count:number}

/**
 * ARTICLE-LAYOUT-1: the index topic chips. Each chip is a real link. With the held URL scheme OFF (default) a click filters the
 * cards already on the page by their `data-topic` and updates the count; nothing is fetched and no URL is added (the topic is kept
 * in the fragment, `#topic-<slug>`). With the scheme ON the links are plain navigation and the filter does nothing.
 */
export function ArticleTopicChips({label,allLabel,countTemplate,topics,total,urls,current=''}:{label:string;allLabel:string;countTemplate:string;topics:ChipTopic[];total:number;urls:boolean;current?:string}){
  const [active,setActive]=useState<string>(current)
  const apply=(slug:string)=>{
    setActive(slug)
    let shown=0
    for(const card of document.querySelectorAll<HTMLElement>('[data-article-card]')){
      const match=!slug||card.dataset.topic===slug
      card.hidden=!match
      if(match)shown++
    }
    const count=document.querySelector<HTMLElement>('[data-article-count]')
    if(count)count.textContent=countTemplate.replace('{n}',String(slug?shown:total))
  }
  useEffect(()=>{
    if(urls)return
    const fromHash=()=>{const slug=/^#topic-([a-z0-9-]+)$/.exec(window.location.hash)?.[1]??'';apply(topics.some(topic=>topic.slug===slug)?slug:'')}
    fromHash()
    window.addEventListener('hashchange',fromHash)
    return ()=>window.removeEventListener('hashchange',fromHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply only reads the stable props below
  },[urls])
  const choose=(slug:string)=>(event:MouseEvent<HTMLAnchorElement>)=>{
    if(urls||event.metaKey||event.ctrlKey||event.shiftKey||event.button!==0)return
    event.preventDefault()
    window.history.replaceState(null,'',slug?`#topic-${slug}`:window.location.pathname+window.location.search)
    apply(slug)
  }
  const href=(slug:string)=>urls?(slug?`/tech-articles/topic/${slug}/`:'/tech-articles/'):(slug?`/tech-articles/#topic-${slug}`:'/tech-articles/')
  return <nav className="wave4-topic-chips" aria-label={label}><ul>
    <li><a href={href('')} className="wave4-topic-chip" aria-current={active===''?'true':undefined} onClick={choose('')}>{allLabel}</a></li>
    {topics.map(topic=><li key={topic.slug}><a href={href(topic.slug)} className="wave4-topic-chip" aria-current={active===topic.slug?'true':undefined} onClick={choose(topic.slug)}>{topic.name}</a></li>)}
  </ul></nav>
}
