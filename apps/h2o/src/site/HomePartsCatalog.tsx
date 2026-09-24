'use client'

import {useEffect,useRef,useState} from 'react'
import type {HomePartCatalogData,HomePartCategoryKey,HomePartRecord} from './HomePartsData'

type Filter='all'|HomePartCategoryKey
const pageSize=8

function ProductCard({product}:{product:HomePartRecord}){
  return <article className="home-part-card" data-product-route={product.route} data-product-source={product.sourceId}>
    <a className="home-part-card-link" href={product.route} aria-label={`Explore ${product.title}`}>
      <span className="home-part-image">{product.image?<img src={product.image.src} alt={product.image.alt} width={product.image.width} height={product.image.height} loading="lazy"/>:<span className="home-part-image-fallback">Image pending source verification</span>}</span>
      <h3>{product.title}</h3>
      <span className="home-part-explore">Explore Part <span aria-hidden="true">↗</span></span>
    </a>
    <a className="home-part-quote" href="/contact-us/">Request a Quote</a>
  </article>
}

export function HomePartsCatalog({data}:{data:HomePartCatalogData}){
  const root=useRef<HTMLDivElement>(null)
  const [active,setActive]=useState<Filter>('all')
  const [visible,setVisible]=useState(pageSize)
  useEffect(()=>{
    const keys=new Set(data.categories.map(category=>category.key))
    const fromUrl=()=>{
      const candidate=new URL(window.location.href).searchParams.get('category')
      setActive(candidate&&keys.has(candidate as HomePartCategoryKey)?candidate as HomePartCategoryKey:'all')
      setVisible(pageSize)
    }
    fromUrl()
    window.addEventListener('popstate',fromUrl)
    return()=>window.removeEventListener('popstate',fromUrl)
  },[data.categories])
  useEffect(()=>{
    const section=root.current?.closest('.lux-section-wrap')
    if(section instanceof HTMLElement)section.dataset.homePartsFilter=active
  },[active])
  const select=(next:Filter)=>{
    if(next===active)return
    const url=new URL(window.location.href)
    if(next==='all')url.searchParams.delete('category')
    else url.searchParams.set('category',next)
    window.history.pushState(null,'',`${url.pathname}${url.search}${url.hash}`)
    setActive(next)
    setVisible(pageSize)
  }
  const selected=data.categories.find(category=>category.key===active)
  const matching=active==='all'?data.records:data.records.filter(record=>record.categories.includes(active))
  const shown=matching.slice(0,visible)
  return <div className="home-parts-catalog" ref={root} data-home-parts-active={active}>
    <div className="home-parts-filters" role="group" aria-label="Filter cooling tower spare parts">
      <button type="button" aria-pressed={active==='all'} onClick={()=>select('all')}>All</button>
      {data.categories.map(category=><button type="button" key={category.key} aria-pressed={active===category.key} onClick={()=>select(category.key)}>{category.label}</button>)}
    </div>
    <div className="home-parts-result-heading"><p aria-live="polite">Showing {shown.length} of {matching.length} {matching.length===1?'product':'products'}{selected?` in ${selected.label}`:''}</p>{selected?<a href={selected.route}>View full {selected.label} category <span aria-hidden="true">↗</span></a>:<a href="/cooling-tower-parts-online/">Browse all parts <span aria-hidden="true">↗</span></a>}</div>
    {shown.length?<div className="home-parts-grid" aria-label="Filtered cooling tower parts">{shown.map(product=><ProductCard key={product.route} product={product}/>)}</div>:<div className="home-parts-empty"><h3>No public products are currently available in this category.</h3><button type="button" onClick={()=>select('all')}>View All Parts</button></div>}
    {visible<matching.length?<button type="button" className="home-parts-more" onClick={()=>setVisible(count=>Math.min(count+pageSize,matching.length))}>Show more products</button>:null}
  </div>
}
