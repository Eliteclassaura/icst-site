import type {SalmonDocument} from './salmon'
import {pageForSegments} from './cohort'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {renderSalmonNode,SalmonSeo} from './SalmonCanonical'
import {articleCardImage,articleHeadingNodes,firstText,matchedWave4Documents,paragraphTexts,wave4LibraryItems,type Wave4Item} from './wave4'
import {R2Discovery} from './R2Discovery'

const exactImage='/media/figma-wave4/figma-w4-e7d87492.png'
const resourcePath=(doc:SalmonDocument)=>doc.routeId==='SALMON-pages-1761'?'/resources/':doc.targetPath
const pageFor=(doc:SalmonDocument)=>pageForSegments(doc.targetPath.split('/').filter(Boolean))

export function Wave4Library({doc}:{doc:SalmonDocument}){
  const items=wave4LibraryItems(doc)
  const title=firstText(doc,'h1')||doc.title
  const paragraphs=paragraphTexts(doc)
  const isTools=doc.routeId==='SALMON-pages-1870'
  const lead=isTools?paragraphs[1]:paragraphs[0]
  const intro=isTools?paragraphs[1]:paragraphs[2]
  const heading=doc.routeId==='SALMON-pages-1761'?'Cooling Tower Knowledge Center':doc.routeId==='SALMON-pages-1870'?'Industrial Cooling Tower Tools & Engineering Resources':'Cooling Tower Brochures'
  const path=resourcePath(doc)
  const isResources=path==='/resources/'
  const primaryItems=isTools?items.slice(0,-1):items
  const technicalItems=isTools?items.slice(-1):[]
  const renderRow=(item:Wave4Item,index:number)=>item.description?<details className="wave4-document" key={`${item.title}-${index}`} open={index===0}>
    <summary><span>{item.title}</span><span className="wave4-document-toggle" aria-hidden="true"/></summary>
    <div className="wave4-document-body"><p>{item.description}</p>{item.href?<a href={item.href} className="wave4-document-action" type="application/pdf">View / Download <span aria-hidden="true">↗</span></a>:<span className="wave4-document-unavailable">Document currently unavailable</span>}</div>
  </details>:<article className="wave4-document wave4-document-flat" key={`${item.title}-${index}`}>
    <h3>{item.title}</h3>{item.href?<a href={item.href} className="wave4-document-action" type="application/pdf">View / Download <span aria-hidden="true">↗</span></a>:<span className="wave4-document-unavailable">Document currently unavailable</span>}
  </article>
  return <div className="luxury-site figma-wave4" data-wave4-route={path} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} canonicalOverride={path==='/resources/'?'https://h2ocooling.com/resources/':undefined}/>
    <LuxuryHeader page={pageFor(doc)}/>
    <main id="main" className="wave4-library">
      <section className="wave4-photo-hero" aria-labelledby="wave4-title">
        <img src={exactImage} width="2338" height="1957" alt="" fetchPriority="high" data-figma-image-ref="ee9f44091102d839dbcbdb7362b15e9b394a6a17"/>
        <div className="wave4-photo-scrim"/>
        <div className="wave4-hero-content"><h1 id="wave4-title">{title}</h1><p>{lead}</p><a href="/contact-us/" className="wave4-action">Contact Our Team <span aria-hidden="true">→</span></a></div>
      </section>
      <section className="wave4-library-content" aria-labelledby="wave4-library-heading">
        {isResources?<nav className="wave4-resource-pathways" aria-label="Explore technical resources">
          <a href="/cooling-tower-brochures/"><span>01 / Documents</span><strong>Brochures</strong><small>Explore the public brochure library and its own verified document identities.</small><em aria-hidden="true">↗</em></a>
          <a href="/cooling-tower-resources/tools/"><span>02 / Engineering</span><strong>Tools</strong><small>Find the separate tools and technical-chart collection.</small><em aria-hidden="true">↗</em></a>
          <a href="/tech-articles/"><span>03 / Reading</span><strong>Technical Articles</strong><small>Browse source-reconciled industrial cooling articles.</small><em aria-hidden="true">↗</em></a>
        </nav>:null}
        <div className="wave4-library-intro"><h2 id="wave4-library-heading">{heading}</h2>{intro?<p>{intro}</p>:null}</div>
        {isResources?<p className="wave4-resource-count">RESOURCE LIBRARY / {items.length} source-listed documents</p>:null}
        <div className="wave4-document-list">{primaryItems.map(renderRow)}</div>
        {technicalItems.length?<section className="wave4-tool-panel" aria-labelledby="wave4-tool-panel-heading"><h2 id="wave4-tool-panel-heading">Industrial Cooling Tower Tools &amp; Technical Charts</h2><p>{paragraphs[3]}</p><div className="wave4-document-list">{technicalItems.map((item,index)=>renderRow(item,index))}</div></section>:null}
        <div className="wave4-library-crosslinks"><a href="/resources/">Resources</a><a href="/cooling-tower-brochures/">Brochures</a><a href="/cooling-tower-resources/tools/">Tools</a><a href="/tech-articles/">Technical Articles</a></div>
        {isResources?<R2Discovery kind="pages"/>:null}
      </section>
    </main>
    <LuxuryFooter page={pageFor(doc)}/>
  </div>
}

function articleDescription(doc:SalmonDocument){
  return doc.seo.meta.find(meta=>meta.name==='description')?.value||doc.text.replace(/\s+/g,' ').slice(0,180)
}
export function Wave4ArticleIndex({doc}:{doc:SalmonDocument}){
  const articles=matchedWave4Documents()
  const renderCard=(article:SalmonDocument)=>{
    const image=articleCardImage(article)
    return <article className="wave4-article-card" key={article.routeId} data-article-route={article.targetPath}>
      <a href={article.targetPath} aria-label={`Read ${article.title}`}>
        {image?<div className="wave4-article-image"><img src={image.src} alt={image.alt} width={image.width} height={image.height} loading="lazy" data-source-sha256={image.sha256}/></div>:<div className="wave4-article-texture" aria-hidden="true"/>}
        <div className="wave4-article-card-copy"><h3>{article.title}</h3><p>{articleDescription(article)}</p><span className="wave4-article-read">Read article <span aria-hidden="true">↗</span></span></div>
      </a>
    </article>
  }
  return <div className="luxury-site figma-wave4" data-wave4-route="/tech-articles/" data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc}/><LuxuryHeader page={pageFor(doc)}/>
    <main id="main" className="wave4-article-index">
      <header className="wave4-index-header"><h1>Tech Articles</h1><p>{firstText(doc,'p')}</p><form action="/search/" role="search"><label htmlFor="wave4-article-query">Search technical articles</label><div><input id="wave4-article-query" type="search" name="q" placeholder="Search articles and technical resources" required maxLength={200}/><button type="submit">Search</button></div></form></header>
      <section className="wave4-index-content" aria-labelledby="wave4-latest"><h2 id="wave4-latest">Technical reading</h2><div className="wave4-article-grid">{articles.slice(0,12).map(renderCard)}</div>
        <details className="wave4-more-articles"><summary>Browse all {articles.length} matched articles</summary><div className="wave4-article-grid">{articles.slice(12).map(renderCard)}</div></details>
        <R2Discovery kind="articles"/>
      </section>
    </main>
    <LuxuryFooter page={pageFor(doc)}/>
  </div>
}

export function Wave4ArticleDetail({doc}:{doc:SalmonDocument}){
  return <div className="luxury-site figma-wave4" data-wave4-article={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc}/><LuxuryHeader page={pageFor(doc)}/>
    <main id="main" className="wave4-detail"><nav aria-label="Breadcrumb" className="wave4-breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/tech-articles/">Tech Articles</a></nav>
      <article className="wave4-detail-body">{articleHeadingNodes(doc.children).map((node,index)=>renderSalmonNode(node,`body.${index}`,doc))}</article>
      <div className="wave4-detail-return"><a href="/tech-articles/">← Back to technical articles</a></div>
    </main>
    <LuxuryFooter page={pageFor(doc)}/>
  </div>
}

/** R2 live-English restoration: exact source content in the accepted article shell. */
export function LiveEnglishDetail({doc}:{doc:SalmonDocument}){
  const isPost=doc.type==='posts'
  const isProject=doc.routeId.startsWith('LIVE-portfolio-')
  return <div className="luxury-site figma-wave4" data-live-english={doc.routeId} data-source-rest-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc}/><LuxuryHeader page={pageFor(doc)}/>
    <main id="main" className="wave4-detail">
      <nav aria-label="Breadcrumb" className="wave4-breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span>{isProject?<a href="/all-projects/">Projects</a>:isPost?<a href="/tech-articles/">Tech Articles</a>:<a href="/resources/">Resources</a>}</nav>
      <article className="wave4-detail-body"><h1>{doc.seo.h1[0]||doc.title}</h1>{doc.children.map((node,index)=>renderSalmonNode(node,`body.${index}`,doc))}</article>
      <div className="wave4-detail-return"><a href={isProject?'/all-projects/':isPost?'/tech-articles/':'/resources/'}>← Back to {isProject?'projects':isPost?'technical articles':'resources'}</a></div>
    </main>
    <LuxuryFooter page={pageFor(doc)}/>
  </div>
}
