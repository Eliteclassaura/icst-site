/**
 * Archive template (Control Tower ruling 2026-10-02): /product-category/*, /product-tag/*, /category/* and /tag/*.
 *
 * Salmon's WooCommerce and WordPress archive markup rendered as raw lists. This renderer reads the same hash-verified
 * source and shows it as a styled grid: product archives use the accepted Parts product card (image, title, Request
 * a Quote with genuine product context), article archives the accepted article card. The archive name is the H1, the
 * source breadcrumb and pagination are kept. Quote-only estate: the sort control, star ratings and prices are never
 * rendered. Only verified public targets become cards or page links.
 */
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {SalmonSeo} from './SalmonCanonical'
import {ProductCard} from './SalmonComposer'
import {productRfqAction} from './SalmonFamilies'
import {activeProductRoutes} from './Wave3Products'
import {pageForSegments} from './cohort'
import {deliverySrc} from './media-delivery'
import {heldImageAlt,salmonNodeText,type SalmonDocument} from './salmon'
import {findAll,findFirst,hasClass,isElement,localHref,sourceImage,type SourceImage,type SourceRef} from './salmon-source'
import type {ProductCardInput} from './salmon-family-model'
import {releaseLedger} from '../content/runtime-read'
import {decodeEntities} from './text-repair'
import {RestoredSlot} from './RestoredSlot'
import {isEmptyArchivePage} from '../content/empty-archives'

export const ARCHIVE_PATH=/^\/(?:product-category|product-tag|category|tag)\//
export const isArchiveDocument=(doc:SalmonDocument):boolean=>ARCHIVE_PATH.test(doc.targetPath)

type Crumb={label:string;href?:string}
type PageLink={label:string;href?:string;current?:boolean;rel?:'prev'|'next'}
type ArticleCard={key:string;href:string;title:string;excerpt:string;image?:SourceImage}
export type ArchiveModel={
  kind:'products'|'articles'
  name:string
  breadcrumb:Crumb[]
  resultCount?:string
  products:ProductCardInput[]
  articles:ArticleCard[]
  pages:PageLink[]
}

export {decodeEntities}
const text=(ref:SourceRef|undefined):string=>ref?decodeEntities(salmonNodeText(ref.node)).replace(/\s+/g,' ').trim():''
const publicPaths=():Set<string>=>{
  const ledger=releaseLedger() as {routes:Array<{path:string;state:string;export:boolean}>}
  // R2.4 R2: an empty archive's page N is a 404, so no page link points at it
  return new Set(ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&!isEmptyArchivePage(row.path)).map(row=>decodeURIComponent(row.path)))
}

export function archiveModel(doc:SalmonDocument):ArchiveModel{
  const root:SourceRef={node:{tag:'div',attrs:{},children:doc.children},key:'body'}
  const pub=publicPaths()
  const isPublic=(href:string|undefined):href is string=>Boolean(href)&&pub.has(decodeURIComponent(href!.split(/[?#]/)[0]!))
  const productItems=findAll(root,ref=>ref.node.tag==='li'&&hasClass(ref.node,'product'))
  const products=productItems.flatMap((item):ProductCardInput[]=>{
    const anchor=findFirst(item,ref=>ref.node.tag==='a'&&/\/product\//.test(ref.node.attrs.href??''))
    const href=localHref(anchor?.node.attrs.href,doc)
    const route=href?activeProductRoutes().find(candidate=>candidate.targetPath===href):undefined
    if(!route)return []
    const name=text(findFirst(item,ref=>/^h[1-6]$/.test(ref.node.tag)))
    const img=findFirst(item,ref=>ref.node.tag==='img')
    const media=img?sourceImage(doc,img.node):undefined
    return [{key:item.key,name:[{text:name}],productPath:route.targetPath,productRouteId:route.routeId,...(media?{media:{src:media.src,alt:media.alt||name,width:media.width,height:media.height,sha256:media.sha256,sourceUrl:media.sourceUrl}}:{})}]
  })
  const articles=findAll(root,ref=>ref.node.tag==='article'&&hasClass(ref.node,'post')).flatMap((item):ArticleCard[]=>{
    const title=findFirst(item,ref=>/^h[1-6]$/.test(ref.node.tag))
    const href=localHref(title?findFirst(title,ref=>ref.node.tag==='a')?.node.attrs.href:undefined,doc)
    if(!isPublic(href))return []
    const img=findFirst(item,ref=>ref.node.tag==='img')
    const image=img?sourceImage(doc,img.node):undefined
    return [{key:item.key,href,title:text(title),excerpt:text(findFirst(item,ref=>ref.node.tag==='p')),...(image?{image}:{})}]
  })
  const crumbsNav=findFirst(root,ref=>ref.node.tag==='nav'&&hasClass(ref.node,'woocommerce-breadcrumb'))
  const heading=findFirst(root,ref=>ref.node.tag==='h1')
  const span=heading?findFirst(heading,ref=>ref.node.tag==='span'):undefined
  const name=text(span)||text(heading)||decodeEntities(doc.title)
  const breadcrumb:Crumb[]=crumbsNav
    ?crumbsNav.node.children.flatMap((child):Crumb[]=>{
      if(isElement(child)&&child.tag==='a'){const href=localHref(child.attrs.href,doc);return [{label:decodeEntities(salmonNodeText(child)).trim(),...(href==='/'||isPublic(href)?{href}:{})}]}
      return decodeEntities(salmonNodeText(child)).split('/').map(part=>part.replace(/\u00a0/g,' ').trim()).filter(Boolean).map(label=>({label}))
    })
    :[{label:'Home',href:'/'},{label:name}]
  const pagination=findFirst(root,ref=>ref.node.tag==='nav'&&(hasClass(ref.node,'woocommerce-pagination')||hasClass(ref.node,'pagination')))
  const pages:PageLink[]=pagination
    ?findAll(pagination,ref=>(ref.node.tag==='a'||ref.node.tag==='span')&&(hasClass(ref.node,'page-numbers')||ref.node.tag==='a')).flatMap((ref):PageLink[]=>{
      const label=text(ref)
      if(ref.node.tag==='span')return hasClass(ref.node,'current')?[{label,current:true}]:[]
      const href=localHref(ref.node.attrs.href,doc)
      if(!isPublic(href))return []
      const rel=hasClass(ref.node,'next')||/next/i.test(label)?'next':hasClass(ref.node,'prev')||/previous|older|newer/i.test(label)?'prev':undefined
      return [{label:rel==='next'?'Next':rel==='prev'?'Previous':label,href,...(rel?{rel}:{})}]
    })
    :[]
  const count=text(findFirst(root,ref=>hasClass(ref.node,'woocommerce-result-count')))
  return {kind:/^\/product-(?:category|tag)\//.test(doc.targetPath)?'products':'articles',name,breadcrumb,...(count&&products.length===productItems.length?{resultCount:count}:{}),products,articles,pages}
}

function ArticleCardView({card}:{card:ArticleCard}){
  return <article className="sp-archive-article" data-article-route={card.href}>
    <a href={card.href}>
      {card.image?<img src={deliverySrc(card.image.src)} alt={heldImageAlt(undefined,card.image.sha256)??card.title} width={card.image.width} height={card.image.height} loading="lazy" decoding="async" data-source-sha256={card.image.sha256}/>:null}
      <span><strong>{card.title}</strong>{card.excerpt?<small>{card.excerpt}</small>:null}<em>Read article →</em></span>
    </a>
  </article>
}

export function ArchivePage({doc}:{doc:SalmonDocument}){
  const model=archiveModel(doc)
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  const empty=model.kind==='products'?!model.products.length:!model.articles.length
  return <div className={`luxury-site salmon-family salmon-family--archive salmon-family--archive-${model.kind}`} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256} data-archive-template="SALMON_ARCHIVE_R1">
    <SalmonSeo doc={doc} breadcrumb={model.breadcrumb.slice(0,-1).flatMap(crumb=>crumb.href?[{name:crumb.label,path:crumb.href}]:[])} crumbName={model.name}/>
    <LuxuryHeader page={page} routePath={doc.targetPath}/>
    <main id="main" className="sp-main sp-archive" data-salmon-region="body">
      <header className="sp-section-inner sp-archive-head">
        <nav className="sp-archive-crumbs" aria-label="Breadcrumb"><ol>{model.breadcrumb.map((crumb,i)=><li key={i}>{crumb.href&&i<model.breadcrumb.length-1?<a href={crumb.href}>{crumb.label}</a>:<span aria-current={i===model.breadcrumb.length-1?'page':undefined}>{crumb.label}</span>}</li>)}</ol></nav>
        <h1 className="sp-heading sp-type-display sp-c-ink">{model.name}</h1>
        {model.resultCount?<p className="sp-archive-count">{model.resultCount}</p>:null}
      </header>
      <RestoredSlot doc={doc} slot="intro" className="sp-section-inner wave3-source-content"/>
      <section className="sp-section-inner sp-archive-body" aria-label={model.kind==='products'?'Products':'Articles'}>
        {empty?<p className="sp-archive-empty">Nothing is listed here yet. <a href="/cooling-tower-parts-online/">Browse cooling tower parts</a> or <a href="/contact-us/">contact us</a>.</p>
          :model.kind==='products'
            ?<div className="sp-archive-grid sp-products" data-product-count={model.products.length}>{model.products.map(product=><ProductCard key={product.key} product={product} ctx={{productAction:card=>productRfqAction(card,doc.targetPath),mediaFallback:'Image not available',fillMedia:true}}/>)}</div>
            :<div className="sp-archive-grid sp-archive-articles">{model.articles.map(card=><ArticleCardView key={card.key} card={card}/>)}</div>}
      </section>
      {model.pages.length?<nav className="sp-section-inner sp-archive-pages" aria-label="Pagination"><ul>{model.pages.map((link,i)=><li key={i}>{link.current?<span aria-current="page">{link.label}</span>:<a href={link.href} rel={link.rel}>{link.label}</a>}</li>)}</ul></nav>:null}
    </main>
    <LuxuryFooter page={page} routePath={doc.targetPath}/>
  </div>
}
