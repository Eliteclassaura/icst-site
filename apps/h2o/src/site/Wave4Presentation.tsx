import type {SalmonDocument} from './salmon'
import {pageForSegments} from './cohort'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {renderSalmonNode,SalmonSeo} from './SalmonCanonical'
import {articleByline,articleCardImage,articleDirectoryDocuments,articleDisplayTitle,articleHeadingNodes,articleTocLinks,firstText,paragraphTexts,wave4LibraryItems,type Wave4Item} from './wave4'
import {R2Discovery} from './R2Discovery'
import {RfqMount} from './RfqMount'
import {cssBackground} from './salmon-source'
import {deliverySrc} from './media-delivery'
import {PUBLIC_AUTHOR} from './public-author-identity'

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
  // Salmon parity: each library route shows its own held Salmon hero background (Elementor CSS).
  const salmonHero=cssBackground(doc.routeId,'8f448f5')
  return <div className="luxury-site figma-wave4 salmon-family salmon-family--library" data-wave4-route={path} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} canonicalOverride={path==='/resources/'?'https://h2ocooling.com/resources/':undefined}/>
    <LuxuryHeader page={pageFor(doc)} routePath={path}/>
    <main id="main" className="wave4-library">
      <section className="wave4-photo-hero" aria-labelledby="wave4-title">
        {salmonHero?<img src={deliverySrc(salmonHero.src)} width={salmonHero.width} height={salmonHero.height} alt="" fetchPriority="high" data-source-sha256={salmonHero.sha256} data-source-src={salmonHero.sourceUrl}/>:<img src={exactImage} width="2338" height="1957" alt="" fetchPriority="high" data-figma-image-ref="ee9f44091102d839dbcbdb7362b15e9b394a6a17"/>}
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
    <LuxuryFooter page={pageFor(doc)} routePath={path}/>
  </div>
}

function articleDescription(doc:SalmonDocument){
  return doc.seo.meta.find(meta=>meta.name==='description')?.value||doc.text.replace(/\s+/g,' ').slice(0,180)
}
// Byline: the site author links to his canonical archive (owner decision 2026-10-02); any other name stays text.
const AuthorName=({name}:{name:string})=>name===PUBLIC_AUTHOR.name?<a href={PUBLIC_AUTHOR.path}>{name}</a>:<>{name}</>

export function Wave4ArticleIndex({doc}:{doc:SalmonDocument}){
  const directory=articleDirectoryDocuments()
  const featured=directory.find(entry=>entry.indexable)
  if(!featured)throw new Error('Technical Articles directory has no indexable featured article')
  const remaining=directory.filter(entry=>entry.doc.routeId!==featured.doc.routeId)
  const nextFour=remaining.slice(0,4)
  const allOthers=remaining.slice(4)
  const articleImage=(article:SalmonDocument)=>{const image=articleCardImage(article);return image&&!/(?:slide|presentation|text overlaid|title card)/i.test(image.alt)?image:undefined}
  const band=cssBackground(doc.routeId,'e-c1d8555')
  return <div className="luxury-site figma-wave4 salmon-family salmon-family--articles" data-wave4-route="/tech-articles/" data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc}/><LuxuryHeader page={pageFor(doc)} routePath={doc.targetPath}/>
    <main id="main" className="wave4-article-index">
      <header className={`wave4-index-header${band?' sp-articles-band':''}`} style={band?{backgroundImage:`linear-gradient(var(--sp-veil), var(--sp-veil)), url("${deliverySrc(band.src)}")`}:undefined} data-source-background-sha256={band?.sha256}><nav aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/resources/">Resources</a></nav><h1>Tech Articles</h1><p>{firstText(doc,'p')}</p><form action="/search/" role="search"><label htmlFor="wave4-article-query">Search technical articles</label><div><input id="wave4-article-query" type="search" name="q" placeholder="Search articles and technical resources" required maxLength={200}/><button type="submit">Search</button></div></form><div className="wave4-index-resource-links"><a href="/cooling-tower-brochures/">Brochures</a><a href="/cooling-tower-resources/tools/">Tools</a><a href="/resources/">Resources Library</a></div></header>
      <section className="wave4-index-content" aria-labelledby="wave4-latest"><h2 id="wave4-latest">Technical reading</h2>
        <article className="wave4-featured-article" data-article-route={featured.doc.targetPath}><div className="wave4-featured-copy"><span>Featured article</span><h3><a href={featured.doc.targetPath}>{articleDisplayTitle(featured.doc.title)}</a></h3><p>{articleDescription(featured.doc)}</p><a className="wave4-article-read" href={featured.doc.targetPath}>Read article <span aria-hidden="true">→</span></a></div>{articleImage(featured.doc)?<img src={articleImage(featured.doc)!.src} alt={articleImage(featured.doc)!.alt} width={articleImage(featured.doc)!.width} height={articleImage(featured.doc)!.height} data-source-sha256={articleImage(featured.doc)!.sha256}/>:<div className="wave4-featured-text" aria-hidden="true">ICS / TECHNICAL READING</div>}</article>
        <div className="wave4-next-articles">{nextFour.map(({doc:article})=>{const image=articleImage(article);return <article key={article.routeId} data-article-route={article.targetPath}><a href={article.targetPath}>{image?<img src={deliverySrc(image.src)} alt="" width={image.width} height={image.height} loading="lazy" data-source-sha256={image.sha256}/>:null}<span><strong>{articleDisplayTitle(article.title)}</strong><small>{articleDescription(article)}</small><em>Read article →</em></span></a></article>})}</div>
        <section className="wave4-directory" aria-label="All technical articles"><div className="wave4-directory-heading"><h2>All technical articles</h2><span>{directory.length} articles</span></div><ol>{allOthers.slice(0,24).map(({doc:article},index)=><li key={article.routeId} data-article-route={article.targetPath}><a href={article.targetPath}><span>{String(index+6).padStart(3,'0')}</span><strong>{articleDisplayTitle(article.title)}</strong><span aria-hidden="true">→</span></a></li>)}</ol>{allOthers.length>24?<details><summary>Show all {directory.length} articles</summary><ol start={30}>{allOthers.slice(24).map(({doc:article},index)=><li key={article.routeId} data-article-route={article.targetPath}><a href={article.targetPath}><span>{String(index+30).padStart(3,'0')}</span><strong>{articleDisplayTitle(article.title)}</strong><span aria-hidden="true">→</span></a></li>)}</ol></details>:null}</section>
      </section>
    </main>
    <LuxuryFooter page={pageFor(doc)} routePath={doc.targetPath}/>
  </div>
}

export function Wave4ArticleDetail({doc}:{doc:SalmonDocument}){
  const byline=articleByline(doc)
  const toc=articleTocLinks(doc)
  const specimen=doc.targetPath==='/how-does-a-cooling-tower-work/'
  const page=pageFor(doc)
  return <div className="luxury-site figma-wave4" data-wave4-article={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc}/><LuxuryHeader page={page} routePath={doc.targetPath}/>
    <main id="main" className="wave4-detail"><header className="wave4-detail-masthead"><nav aria-label="Breadcrumb" className="wave4-breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/tech-articles/">Tech Articles</a></nav><h1>{articleDisplayTitle(doc.seo.h1[0]||doc.title)}</h1>{byline?<p className="wave4-byline"><span>By <AuthorName name={byline.author}/></span><span aria-hidden="true">|</span><time dateTime={byline.dateTime}>{byline.date}</time></p>:null}</header>
      <div className="wave4-reading-layout">{toc.length?<><nav className="wave4-toc-rail" aria-label="Table of Contents" data-pagefind-ignore><h2>Table of Contents</h2>{toc.map(link=><a href={link.href} key={link.href}>{link.label}</a>)}</nav><details className="wave4-toc-mobile" data-pagefind-ignore><summary>Table of Contents</summary><nav aria-label="Table of Contents">{toc.map(link=><a href={link.href} key={link.href}>{link.label}</a>)}</nav></details></>:null}<article className="wave4-detail-body">{articleHeadingNodes(doc.children,true).map((node,index)=>renderSalmonNode(node,`body.${index}`,doc,true))}</article></div>
      {specimen?<nav className="wave4-related-pathways" aria-label="Related technical pathways"><h2>Continue your research</h2><a href="/wp-content/uploads/2021/11/How-Cooling-Towers-Work.pdf">How Cooling Towers Work PDF</a><a href="/crossflow-cooling-tower-repair-maintenance/">Crossflow towers</a><a href="/fill-media/">Fill media</a></nav>:null}
      <section className="wave4-article-rfq"><h2>Let’s Build Efficient Industrial Cooling Systems</h2>{page?<RfqMount mountId="editorial_inline" page={page}/>:<RfqMount mountId="editorial_inline" routePath={doc.targetPath}/>}<a href="/contact-us/">Contact us</a></section>
      <div className="wave4-detail-return"><a href="/tech-articles/">← Back to technical articles</a></div>
    </main>
    <LuxuryFooter page={pageFor(doc)} routePath={doc.targetPath}/>
  </div>
}

/** R2 live-English restoration: exact source content in the accepted article shell. */
export function LiveEnglishDetail({doc}:{doc:SalmonDocument}){
  const isPost=doc.type==='posts'
  const isProject=doc.routeId.startsWith('LIVE-portfolio-')
  const byline=isPost?articleByline(doc):null
  return <div className="luxury-site figma-wave4" data-live-english={doc.routeId} data-source-rest-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc}/><LuxuryHeader page={pageFor(doc)} routePath={doc.targetPath}/>
    <main id="main" className="wave4-detail">
      <nav aria-label="Breadcrumb" className="wave4-breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span>{isProject?<a href="/all-projects/">Projects</a>:isPost?<a href="/tech-articles/">Tech Articles</a>:<a href="/resources/">Resources</a>}</nav>
      <article className="wave4-detail-body"><h1>{articleDisplayTitle(doc.seo.h1[0]||doc.title)}</h1>{byline?<p className="wave4-byline"><span>By <AuthorName name={byline.author}/></span><span aria-hidden="true">|</span><time dateTime={byline.dateTime}>{byline.date}</time></p>:null}{doc.children.map((node,index)=>renderSalmonNode(node,`body.${index}`,doc,true))}</article>
      <div className="wave4-detail-return"><a href={isProject?'/all-projects/':isPost?'/tech-articles/':'/resources/'}>← Back to {isProject?'projects':isPost?'technical articles':'resources'}</a></div>
    </main>
    <LuxuryFooter page={pageFor(doc)} routePath={doc.targetPath}/>
  </div>
}
