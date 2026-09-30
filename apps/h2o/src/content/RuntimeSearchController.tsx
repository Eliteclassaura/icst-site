'use client'
import {useEffect} from 'react'

/** Start the generation-pinned runtime search (public/runtime-search.js) after hydration. */
export function RuntimeSearchController(){
  useEffect(()=>{
    const script=document.createElement('script')
    script.type='module';script.src='/runtime-search.js'
    document.head.append(script)
    return()=>script.remove()
  },[])
  return null
}
