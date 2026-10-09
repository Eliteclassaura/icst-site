'use client'
import type {ReactNode} from 'react'
import {useEffect,useRef,useState} from 'react'

export type GalleryImage={src:string;width:number;height:number;alt:string;sha256:string;sourceUrl?:string}

/** Product gallery (spec product-detail §2): one 4:3 frame, image `contain` at ≤ native size; thumbnails only for ≥ 2 images. */
export function R5Gallery({images,name}:{images:GalleryImage[];name:string}){
  const [current,setCurrent]=useState(0)
  const image=images[current]??images[0]
  if(!image)return null
  return <div className={image.width<400?"r5-gallery r5-gallery--small":"r5-gallery"}>
    <div className="r5-gallery-frame">
      <img src={image.src} width={image.width} height={image.height} alt={images.length>1?`${image.alt||name} – view ${current+1}`:image.alt||name} style={{inlineSize:`min(100%, ${image.width}px)`}} loading="eager" fetchPriority="high" data-source-sha256={image.sha256} data-source-url={image.sourceUrl}/>
    </div>
    {images.length>1?<ul className="r5-gallery-thumbs" aria-label="Product images">{images.map((thumb,i)=><li key={thumb.sha256}>
      <button type="button" aria-pressed={i===current} aria-label={`Show image ${i+1} of ${images.length}`} onClick={()=>setCurrent(i)}>
        {/* decorative: the button's own aria-label names it (QA R17B M3) */}
        <img src={thumb.src} width={thumb.width} height={thumb.height} alt="" loading="lazy"/>
      </button>
    </li>)}</ul>:null}
  </div>
}

/** Sticky mini-bar (≥ 1024 only, CSS): shown once the product header has scrolled out of view; hidden and inert otherwise. */
export function R5MiniBar({children}:{children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null)
  const [shown,setShown]=useState(false)
  useEffect(()=>{
    const head=document.querySelector('.r5-product-head')
    if(!head||!('IntersectionObserver' in window))return
    const observer=new IntersectionObserver(([entry])=>setShown(!entry!.isIntersecting))
    observer.observe(head)
    return ()=>observer.disconnect()
  },[])
  useEffect(()=>{if(ref.current)ref.current.inert=!shown},[shown])
  return <div ref={ref} className="r5-minibar" data-shown={shown?'':undefined} aria-hidden={!shown}>{children}</div>
}
