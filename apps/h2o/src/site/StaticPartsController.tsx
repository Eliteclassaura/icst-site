'use client'
import {useEffect} from 'react'

/** Query filtering runs against the same static, source-backed product cards. */
export function StaticPartsController(){
  useEffect(()=>{
    const update=()=>{
      const params=new URLSearchParams(location.search),query=(params.get('q')??'').trim().slice(0,100)
      const cards=Array.from(document.querySelectorAll<HTMLElement>('.wave3-catalog [data-static-product]'))
      const matches=cards.filter(card=>(card.dataset.staticSearch??'').includes(query.toLowerCase()))
      const pages=Math.max(1,Math.ceil(matches.length/12)),page=Math.min(pages,Math.max(1,Number.parseInt(params.get('page')??'1',10)||1))
      cards.forEach(card=>{card.style.display='none'})
      matches.slice((page-1)*12,page*12).forEach(card=>{card.style.display=''})
      const count=document.querySelector('.wave3-catalog-heading p');if(count)count.textContent=`${matches.length} products`
      const input=document.querySelector<HTMLInputElement>('#wave3-query');if(input)input.value=query
      const nav=document.querySelector('.wave3-pagination')
      if(nav){
        nav.replaceChildren()
        const link=(number:number,label:string)=>{const a=document.createElement('a');a.href=`/cooling-tower-parts-online/?${new URLSearchParams({...query?{q:query}:{},page:String(number)})}`;a.textContent=label;return a}
        if(page>1)nav.append(link(page-1,'Previous'))
        const label=document.createElement('span');label.textContent=`Page ${page} of ${pages}`;nav.append(label)
        if(page<pages)nav.append(link(page+1,'Next'))
      }
      const empty=document.querySelector<HTMLElement>('[data-static-parts-empty]');if(empty)empty.hidden=matches.length>0
    }
    update();window.addEventListener('popstate',update)
    return()=>window.removeEventListener('popstate',update)
  },[])
  return null
}
