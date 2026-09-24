'use client'

import {useEffect,useRef,type ReactNode} from 'react'

export function TowerDisclosure({label,children}:{label:string;children:ReactNode}){
  const ref=useRef<HTMLDetailsElement>(null)
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 768px)')
    const sync=()=>{if(ref.current)ref.current.open=!media.matches}
    sync()
    media.addEventListener('change',sync)
    return ()=>media.removeEventListener('change',sync)
  },[])
  return <details className="tower-mobile-disclosure" ref={ref} open><summary>{label}<span aria-hidden="true">+</span></summary><div className="tower-disclosure-content">{children}</div></details>
}
