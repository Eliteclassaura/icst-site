'use client'
import {createElement,useRef,useState,type KeyboardEvent,type ReactNode} from 'react'

/**
 * Design R4 TabbedList (Repair "Cooling Tower Repairs and Upgrades"): disclosure buttons (the spec's accessible alternative
 * to a tablist). One DOM serves both layouts: at ≥ 1024 a list of items on the left and the open item's detail card on the
 * right (CSS grid), below that an accordion. Exactly one item is open; every body stays in the DOM (indexable). Keyboard:
 * Tab / Enter / Space, plus ArrowUp/ArrowDown/Home/End between the item buttons; the card's previous/next buttons move the
 * open item.
 */
export type R4TabItem={key:string;title:ReactNode;body:ReactNode;cta?:ReactNode}
export function R4Tabs({items,headingTag='h3',label}:{items:R4TabItem[];headingTag?:string;label:string}){
  const [open,setOpen]=useState(0)
  const buttons=useRef<(HTMLButtonElement|null)[]>([])
  const total=String(items.length).padStart(2,'0')
  const focus=(i:number)=>buttons.current[(i+items.length)%items.length]?.focus()
  const onKey=(e:KeyboardEvent<HTMLButtonElement>,i:number)=>{
    const to={ArrowDown:i+1,ArrowUp:i-1,Home:0,End:items.length-1}[e.key]
    if(to===undefined)return
    e.preventDefault();focus(to)
  }
  return <div className="dr4-tabs" role="group" aria-label={label}>
    {items.map((item,i)=>{
      const id=`dr4-tab-${item.key}`
      const isOpen=i===open
      return <div className="dr4-tab" key={item.key} data-open={isOpen?'true':'false'}>
        {createElement(headingTag,{className:'dr4-tab-heading'},<button ref={el=>{buttons.current[i]=el}} type="button" className="dr4-tab-button" aria-expanded={isOpen} aria-controls={id+'-panel'} id={id} onClick={()=>setOpen(i)} onKeyDown={e=>onKey(e,i)}>
          <span className="dr4-tab-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><span className="dr4-tab-title">{item.title}</span>
        </button>)}
        <div className="dr4-tab-panel" id={id+'-panel'} role="region" aria-labelledby={id} hidden={!isOpen}>
          <p className="dr4-tab-count" aria-hidden="true">{String(i+1).padStart(2,'0')} / {total}</p>
          <p className="dr4-tab-panel-title" aria-hidden="true">{item.title}</p>
          <div className="dr4-tab-body">{item.body}</div>
          <div className="dr4-tab-footer">
            {item.cta}
            <span className="dr4-tab-nav">
              <button type="button" className="dr4-tab-step" aria-label="Previous item" onClick={()=>{const to=(i-1+items.length)%items.length;setOpen(to);focus(to)}}><span aria-hidden="true">←</span></button>
              <button type="button" className="dr4-tab-step" aria-label="Next item" onClick={()=>{const to=(i+1)%items.length;setOpen(to);focus(to)}}><span aria-hidden="true">→</span></button>
            </span>
          </div>
        </div>
      </div>
    })}
  </div>
}
