'use client'
import {useEffect} from 'react'

/** Start Pagefind after React hydration so it cannot race the server-rendered status text. */
export function StaticSearchController(){
  useEffect(()=>{
    const script=document.createElement('script')
    script.type='module';script.src='/release-search.js'
    document.head.append(script)
    return()=>script.remove()
  },[])
  return null
}
