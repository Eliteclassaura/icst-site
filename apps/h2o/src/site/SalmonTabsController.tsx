'use client'

import {useEffect} from 'react'

// Keep the approved source tab panels static and hydrate only their disclosure.
export function SalmonTabsController(){
 useEffect(()=>{
  const groups=[...document.querySelectorAll<HTMLElement>('.salmon-copy .e-n-tabs')]
  const cleanups=groups.map(group=>{
   const heading=group.querySelector<HTMLElement>(':scope > .e-n-tabs-heading')
   const content=group.querySelector<HTMLElement>(':scope > .e-n-tabs-content')
   if(!heading||!content)return ()=>{}
   const tabs=[...heading.querySelectorAll<HTMLButtonElement>(':scope > [role="tab"]')]
   const panels=[...content.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]')]
   const activate=(index:number)=>{
    tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1})
    panels.forEach((panel,i)=>{panel.hidden=i!==index;panel.classList.toggle('e-active',i===index)})
   }
   activate(Math.max(0,tabs.findIndex(tab=>tab.getAttribute('aria-selected')==='true')))
   const onClick=(event:MouseEvent)=>{
    const tab=(event.target as Element).closest<HTMLButtonElement>('[role="tab"]')
    const index=tab?tabs.indexOf(tab):-1
    if(index>=0)activate(index)
   }
   heading.addEventListener('click',onClick)
   return ()=>heading.removeEventListener('click',onClick)
  })
  return ()=>cleanups.forEach(cleanup=>cleanup())
 },[])
 return null
}
