import {PDF_LINK_PROPS} from './link-attrs'
import type {SalmonDocument,SalmonNode} from './salmon'
import {pageForSegments} from './cohort'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {markLcpImage,renderSalmonNode,SalmonSeo} from './SalmonCanonical'
import {HOME_CRUMB} from './breadcrumb-schema'
import {articleByline,articleCardImage,articleDirectoryDocuments,articleDisplayTitle,articleHeadingNodes,firstText,isRecentPostsRegion,paragraphTexts,wave4LibraryItems,type Wave4Item} from './wave4'
import {R2Discovery} from './R2Discovery'
import {cssBackground} from './salmon-source'
import {deliverySrc,provenanceRef} from './media-delivery'
import {PUBLIC_AUTHOR} from './public-author-identity'
import {R4Img,Eyebrow} from './r4/R4System'
import {R4LauncherReveal} from './r4/R4LauncherReveal'
import {r4Copy} from './design-r4-media'
import {ArticleCard,ArticleContents,ArticleCta,ArticleMeta,ArticlePager,RelatedArticles,articleCardData,type ArticleCardData} from './ArticleParts'
import {isPayloadContent,releaseLedger} from '../content/runtime-read'
import {ArticleTopicChips} from './ArticleTopicChips'
import {ArticleTocSpy} from './ArticleTocSpy'
import {
  articleCopy,articleIndexUrlsOn,articleLayout,articleModified,ctaGroup,existingIds,inlineCtaHeading,isEnglishIndexRoute,longDate,paginate,readingMinutes,
  relatedArticles,splitAtId,topicForPath,topicHref,wantsInlineCta,withHeadingIds,wordCount
} from './article-layout'

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
    <div className="wave4-document-body"><p>{item.description}</p>{item.href?<a href={item.href} className="wave4-document-action" type="application/pdf" {...PDF_LINK_PROPS}>View / Download <span aria-hidden="true">↗</span></a>:<span className="wave4-document-unavailable">Document currently unavailable</span>}</div>
  </details>:<article className="wave4-document wave4-document-flat" key={`${item.title}-${index}`}>
    <h3>{item.title}</h3>{item.href?<a href={item.href} className="wave4-document-action" type="application/pdf" {...PDF_LINK_PROPS}>View / Download <span aria-hidden="true">↗</span></a>:<span className="wave4-document-unavailable">Document currently unavailable</span>}
  </article>
  // Salmon parity: each library route shows its own held Salmon hero background (Elementor CSS).
  const salmonHero=cssBackground(doc.routeId,'8f448f5')
  // Design R4 (CT GO 2026-10-07; spec H2O_DESIGN_R4_SPEC_resources.md): /resources/ takes the shared R4 hub hero, link
  // cards and the two-column library. Same strings and document rows as before; brochures and tools are unchanged.
  if(isResources)return <div className="luxury-site figma-wave4 salmon-family salmon-family--library" data-wave4-route={path} data-r4-route={path} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} canonicalOverride="https://h2ocooling.com/resources/"/>
    <LuxuryHeader page={pageFor(doc)} routePath={path}/>
    {/* DD-FIX-1 F1: the R4 content container wraps the page content only; the header and footer keep the site's full-width container */}
    <div className="dr4 dr4-resources"><main id="main" className="wave4-library dr4-library-main">
      <section className="dr4-hero dr4-hero--hub dr4-hero--resources" aria-labelledby="wave4-title">
        <R4Img slot="resources.hero" eager className="dr4-hero-img" sizes="(min-width: 1300px) 1260px, calc(100vw - 32px)"/>
        <div className="dr4-hero-body">
          <Eyebrow label={r4Copy().eyebrows['/resources/']?.hero??''} tone="dark"/>
          <h1 id="wave4-title" className="dr4-hero-title">{title}</h1>
          <p className="dr4-hero-lead">{lead}</p>
        </div>
        <div className="dr4-hero-corner"><a href="/contact-us/" className="dr4-btn dr4-btn--white">Contact Our Team <span className="dr4-btn-arrow" aria-hidden="true">→</span></a></div>
      </section>
      <R4LauncherReveal/>
      <nav className="dr4-pathways" aria-label="Explore technical resources">
        <a href="/cooling-tower-brochures/" className="dr4-pathway"><span aria-hidden="true">01 / Documents</span><strong>Brochures</strong><small>Browse the ICS brochure library.</small><em aria-hidden="true">↗</em></a>
        <a href="/cooling-tower-resources/tools/" className="dr4-pathway"><span aria-hidden="true">02 / Engineering</span><strong>Tools</strong><small>Find engineering tools and technical charts.</small><em aria-hidden="true">↗</em></a>
        <a href="/tech-articles/" className="dr4-pathway dr4-pathway--navy"><span aria-hidden="true">03 / Reading</span><strong>Technical Articles</strong><small>Browse source-reconciled industrial cooling articles.</small><em aria-hidden="true">↗</em></a>
      </nav>
      <section className="dr4-library" aria-labelledby="wave4-library-heading">
        <div className="dr4-library-aside">
          <p className="dr4-library-count">RESOURCE LIBRARY / {items.length} documents</p>
          <h2 id="wave4-library-heading" className="dr4-h2">{heading}</h2>
          {intro?<p className="dr4-prose">{intro}</p>:null}
          <div className="wave4-library-crosslinks dr4-library-chips"><a href="/resources/" aria-current="page">Resources</a><a href="/cooling-tower-brochures/">Brochures</a><a href="/cooling-tower-resources/tools/">Tools</a><a href="/tech-articles/">Technical Articles</a></div>
        </div>
        <ol className="wave4-document-list dr4-library-list">{primaryItems.map((item,index)=><li key={`${item.title}-${index}`} className="dr4-library-item"><span className="dr4-library-num" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>{renderRow(item,index)}</li>)}</ol>
      </section>
      <R2Discovery kind="pages"/>
    </main></div>
    <LuxuryFooter page={pageFor(doc)} routePath={path}/>
  </div>
  return <div className="luxury-site figma-wave4 salmon-family salmon-family--library" data-wave4-route={path} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} canonicalOverride={path==='/resources/'?'https://h2ocooling.com/resources/':undefined}/>
    <LuxuryHeader page={pageFor(doc)} routePath={path}/>
    <main id="main" className="wave4-library">
      <section className="wave4-photo-hero" aria-labelledby="wave4-title">
        {salmonHero?<img src={deliverySrc(salmonHero.src)} width={salmonHero.width} height={salmonHero.height} alt="" fetchPriority="high" data-source-sha256={salmonHero.sha256} data-source-src={provenanceRef(salmonHero.sourceUrl)}/>:<img src={exactImage} width="2338" height="1957" alt="" fetchPriority="high" data-figma-image-ref="ee9f44091102d839dbcbdb7362b15e9b394a6a17"/>}
        <div className="wave4-photo-scrim"/>
        <div className="wave4-hero-content"><h1 id="wave4-title">{title}</h1><p>{lead}</p><a href="/contact-us/" className="wave4-action">Contact Our Team <span aria-hidden="true">→</span></a></div>
      </section>
      <section className="wave4-library-content" aria-labelledby="wave4-library-heading">
        {isResources?<nav className="wave4-resource-pathways" aria-label="Explore technical resources">
          <a href="/cooling-tower-brochures/"><span>01 / Documents</span><strong>Brochures</strong><small>Browse the ICS brochure library.</small><em aria-hidden="true">↗</em></a>
          <a href="/cooling-tower-resources/tools/"><span>02 / Engineering</span><strong>Tools</strong><small>Find engineering tools and technical charts.</small><em aria-hidden="true">↗</em></a>
          <a href="/tech-articles/"><span>03 / Reading</span><strong>Technical Articles</strong><small>Browse source-reconciled industrial cooling articles.</small><em aria-hidden="true">↗</em></a>
        </nav>:null}
        <div className="wave4-library-intro"><h2 id="wave4-library-heading">{heading}</h2>{intro?<p>{intro}</p>:null}</div>
        {isResources?<p className="wave4-resource-count">RESOURCE LIBRARY / {items.length} documents</p>:null}
        <div className="wave4-document-list">{primaryItems.map(renderRow)}</div>
        {technicalItems.length?<section className="wave4-tool-panel" aria-labelledby="wave4-tool-panel-heading"><h2 id="wave4-tool-panel-heading">Industrial Cooling Tower Tools &amp; Technical Charts</h2><p>{paragraphs[3]}</p><div className="wave4-document-list">{technicalItems.map((item,index)=>renderRow(item,index))}</div></section>:null}
        <div className="wave4-library-crosslinks"><a href="/resources/">Resources</a><a href="/cooling-tower-brochures/">Brochures</a><a href="/cooling-tower-resources/tools/">Tools</a><a href="/tech-articles/">Technical Articles</a></div>
        {isResources?<R2Discovery kind="pages"/>:null}
      </section>
    </main>
    <LuxuryFooter page={pageFor(doc)} routePath={path}/>
  </div>
}

/**
 * The article's excerpt (card text and deck). Industrial-only copy rule: a sentence that mentions HVAC is left out of the excerpt
 * (the source description of /cooling-tower-maintenance-checklist/ ends "…optimize your HVAC systems today."); the stored
 * description itself is OGCS's to correct.
 */
const NOT_INDUSTRIAL=/\bHVAC\b/i
const industrialOnly=(text:string)=>NOT_INDUSTRIAL.test(text)?(text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)??[]).filter(sentence=>!NOT_INDUSTRIAL.test(sentence)).join('').trim():text
const metaDescription=(doc:SalmonDocument)=>industrialOnly(doc.seo.meta.find(meta=>meta.name==='description')?.value??'')
function articleDescription(doc:SalmonDocument){
  return metaDescription(doc)||industrialOnly(doc.text.replace(/\s+/g,' ').slice(0,180))
}
// Byline: the site author links to his canonical archive (owner decision 2026-10-02); any other name stays text.
const AuthorName=({name}:{name:string})=>name===PUBLIC_AUTHOR.name?<a href={PUBLIC_AUTHOR.path}>{name}</a>:<>{name}</>

// The English directory as card data, once per process (every article page needs its related cards). HOME-RENDER-1: in payload mode the
// directory (about 400 article documents, read, hashed, parsed and adapted) is built once per ledger object, not once per process and
// not per request, so a publish replaces it; the featured article of the index (chosen over the same directory) is kept with it.
type DirectoryCard=ArticleCardData&{indexable:boolean;routeId:string}
type DirectoryEntry={doc:SalmonDocument;indexable:boolean}
let directoryCards:DirectoryCard[]|undefined
let directoryNow:{ledger:object;cards:DirectoryCard[];featured:DirectoryEntry|undefined}|undefined
const cardsOf=(directory:DirectoryEntry[]):DirectoryCard[]=>directory.filter(entry=>isEnglishIndexRoute(entry.doc.targetPath)).map(({doc,indexable})=>({...articleCardData(doc,articleDescription(doc)),indexable,routeId:doc.routeId}))
const featuredOf=(directory:DirectoryEntry[]):DirectoryEntry|undefined=>{
  // The featured article is the newest indexable English one that has a usable image (the dark placeholder panel is only a fallback).
  const usable=(article:SalmonDocument)=>{const image=articleCardImage(article);return Boolean(image&&!/(?:slide|presentation|text overlaid|title card)/i.test(image.alt))}
  const eligible=directory.filter(entry=>entry.indexable&&isEnglishIndexRoute(entry.doc.targetPath))
  return eligible.find(entry=>usable(entry.doc))??eligible[0]
}
const directoryState=()=>{
  if(!isPayloadContent())return undefined
  const ledger=releaseLedger() as object
  if(!directoryNow||directoryNow.ledger!==ledger){
    const directory=articleDirectoryDocuments()
    directoryNow={ledger,cards:cardsOf(directory),featured:featuredOf(directory)}
  }
  return directoryNow
}
const englishCards=()=>directoryState()?.cards??(directoryCards??=cardsOf(articleDirectoryDocuments()))
/** `view` is for the held URL scheme only (H2O_ARTICLE_INDEX_URLS=on): a topic and a page of the grid. Off: every card, one page. */
export function Wave4ArticleIndex({doc,view}:{doc:SalmonDocument;view?:{topic?:string;page?:number}}){
  const state=directoryState()
  const featuredEntry=state?state.featured:featuredOf(articleDirectoryDocuments())
  if(!featuredEntry)throw new Error('Technical Articles directory has no indexable featured article')
  const featured=featuredEntry
  const cards=englishCards()
  const urls=articleIndexUrlsOn()
  const topicSlug=urls?view?.topic:undefined
  const others=cards.filter(card=>card.routeId!==featured.doc.routeId)
  const filtered=topicSlug?others.filter(card=>articleLayout.routes[card.path]===topicSlug):others
  const paged=urls?paginate(filtered,view?.page??1):{items:filtered,page:1,pages:1}
  const topics=articleLayout.topics.map(topic=>({...topic,count:cards.filter(card=>articleLayout.routes[card.path]===topic.slug).length})).filter(topic=>topic.count>0)
  const articleImage=(article:SalmonDocument)=>{const image=articleCardImage(article);return image&&!/(?:slide|presentation|text overlaid|title card)/i.test(image.alt)?image:undefined}
  const band=cssBackground(doc.routeId,'e-c1d8555')
  const featuredImage=articleImage(featured.doc)
  const shown=urls&&topicSlug?filtered.length:cards.length
  return <div className="luxury-site figma-wave4 salmon-family salmon-family--articles" data-wave4-route="/tech-articles/" data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} breadcrumb={[HOME_CRUMB,{name:'Resources',path:'/resources/'}]} crumbName="Tech Articles"/><LuxuryHeader page={pageFor(doc)} routePath={doc.targetPath}/>
    <main id="main" className="wave4-article-index">
      <header className={`wave4-index-header${band?' sp-articles-band':''}`} style={band?{backgroundImage:`linear-gradient(var(--sp-veil), var(--sp-veil)), url("${deliverySrc(band.src)}")`}:undefined} data-source-background-sha256={band?.sha256}><nav aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/resources/">Resources</a></nav><h1>Tech Articles</h1><p>{firstText(doc,'p')}</p><form action="/search/" role="search"><label htmlFor="wave4-article-query">Search technical articles</label><div><input id="wave4-article-query" type="search" name="q" placeholder="Search articles and technical resources" required maxLength={200}/><button type="submit">Search</button></div></form><div className="wave4-index-resource-links"><a href="/cooling-tower-brochures/">Brochures</a><a href="/cooling-tower-resources/tools/">Tools</a><a href="/resources/">Resources Library</a></div></header>
      <section className="wave4-index-content" aria-labelledby="wave4-latest"><h2 id="wave4-latest">Technical reading</h2>
        <article className="wave4-featured-article" data-article-route={featured.doc.targetPath}>
          {featuredImage?<img className="wave4-featured-media" src={deliverySrc(featuredImage.src)} alt="" width={featuredImage.width} height={featuredImage.height} loading="eager" decoding="async" fetchPriority="high" data-source-sha256={featuredImage.sha256}/>:<div className="wave4-featured-text" aria-hidden="true">ICS / TECHNICAL READING</div>}
          <div className="wave4-featured-copy"><span>Featured article</span><h3><a href={featured.doc.targetPath}>{articleDisplayTitle(featured.doc.title)}</a></h3><p>{articleDescription(featured.doc)}</p><a className="wave4-article-read" href={featured.doc.targetPath}>{articleCopy('index.featured.link').replace(' →','')} <span aria-hidden="true">→</span></a></div>
        </article>
        <ArticleTopicChips label={articleCopy('index.filter.label')} allLabel={articleCopy('index.filter.all')} countTemplate={articleCopy('index.count',{n:'{n}'})} topics={topics} total={cards.length} urls={urls} current={topicSlug}/>
        <section className="wave4-index-grid" aria-label="All technical articles"><div className="wave4-directory-heading"><h2>All technical articles</h2><span data-article-count="">{articleCopy('index.count',{n:shown})}</span></div>
          <ul className="wave4-article-grid">{paged.items.map(card=><ArticleCard key={card.routeId} card={card}/>)}</ul>
          {urls?<ArticlePager page={paged.page} pages={paged.pages}/>:null}
        </section>
      </section>
    </main>
    <LuxuryFooter page={pageFor(doc)} routePath={doc.targetPath}/>
  </div>
}

/**
 * The article reading layout (ARTICLE-LAYOUT-1), shared by the matched Wave 4 articles and the live English posts that sit in the
 * Tech Articles directory. `nodes` are the body nodes in their original order: a removed region is '' so every render key, the
 * LCP key and the provenance paths stay those of the unsplit article.
 */
function ArticleReading({doc,nodes:source,specimen=false}:{doc:SalmonDocument;nodes:SalmonNode[];specimen?:boolean}){
  const byline=articleByline(doc)
  const topic=topicForPath(doc.targetPath),group=ctaGroup(topic?.slug)
  const {nodes,headings,chars}=withHeadingIds(source,existingIds(source))
  const cut=wantsInlineCta(wordCount(doc.text),group)?inlineCtaHeading(headings,chars):undefined
  const halves=cut?splitAtId(nodes,cut.id):undefined
  const renderList=(list:SalmonNode[])=>list.map((node,index)=>node===''?null:renderSalmonNode(node,`body.${index}`,doc,true))
  const modified=articleModified(doc),minutes=readingMinutes(doc.text)
  const related=relatedArticles(doc.targetPath,englishCards()).map(({indexable:_i,routeId:_r,...card})=>card)
  // The deck is the article's own description; an article without one gets none (its opening paragraph is the body).
  const deck=metaDescription(doc)
  return <main id="main" className="wave4-detail"><header className="wave4-detail-masthead"><nav aria-label="Breadcrumb" className="wave4-breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/tech-articles/">Tech Articles</a></nav>{topic?<a className="wave4-article-eyebrow" href={topicHref(topic.slug)}>{topic.name}</a>:null}<h1>{articleDisplayTitle(doc.seo.h1[0]||doc.title)}</h1>{deck?<p className="wave4-article-deck">{deck}</p>:null}{byline?<ArticleMeta authorNode={<AuthorName name={byline.author}/>} published={byline.date} publishedIso={byline.dateTime} updated={modified&&modified!==byline.dateTime?{text:longDate(modified),iso:modified}:undefined} minutes={minutes}/>:null}</header>
    <div className="wave4-reading-layout"><ArticleContents headings={headings}/><ArticleTocSpy ids={headings.map(heading=>heading.id)}/><article className="wave4-detail-body">{halves?<>{renderList(halves.before)}<ArticleCta kind="inline" group={group} doc={doc}/>{renderList(halves.after)}</>:renderList(nodes)}</article></div>
    {specimen?<nav className="wave4-related-pathways" aria-label="Related technical pathways"><h2>Continue your research</h2><a href="/wp-content/uploads/2021/11/How-Cooling-Towers-Work.pdf" {...PDF_LINK_PROPS}>How Cooling Towers Work PDF</a><a href="/crossflow-cooling-tower-repair-maintenance/">Crossflow towers</a><a href="/fill-media/">Fill media</a></nav>:null}
    {/* Design Fixes R1 A5: the article's quote action is an inline row; the one "Let’s Build…" band is the site footer's. ARTICLE-LAYOUT-1: the end card carries its own OGCS heading, worded differently from that band. */}
    <ArticleCta kind="end" group={group} doc={doc}/>
    <RelatedArticles cards={related}/>
    <div className="wave4-detail-return"><a href="/tech-articles/">{articleCopy('related.back')}</a></div>
  </main>
}

export function Wave4ArticleDetail({doc}:{doc:SalmonDocument}){
  markLcpImage(doc)
  const page=pageFor(doc)
  const source=articleHeadingNodes(doc.children,true).map(node=>isRecentPostsRegion(node)?'':node)
  return <div className="luxury-site figma-wave4" data-wave4-article={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} breadcrumb={[HOME_CRUMB,{name:'Tech Articles',path:'/tech-articles/'}]}/><LuxuryHeader page={page} routePath={doc.targetPath}/>
    <ArticleReading doc={doc} nodes={source} specimen={doc.targetPath==='/how-does-a-cooling-tower-work/'}/>
    <LuxuryFooter page={pageFor(doc)} routePath={doc.targetPath}/>
  </div>
}

export const LIVE_LOCATION_PATHS:ReadonlySet<string>=new Set(['/cooling-tower-construction-repair-in-singapore/','/cooling-tower-construction-repair-in-united-states/','/thailand-cooling-tower/'])
/** R2 live-English restoration: exact source content in the accepted article shell. */
export function LiveEnglishDetail({doc}:{doc:SalmonDocument}){
  const isPost=doc.type==='posts'
  const isProject=doc.routeId.startsWith('LIVE-portfolio-')
  // SEO-FIX-1 (H2O_SEO_DEEP_R1 SF-5): a location page's parent is Home, not Resources.
  const isLocation=LIVE_LOCATION_PATHS.has(doc.targetPath)
  const parent=isProject?{name:'Projects',path:'/all-projects/'}:isPost?{name:'Tech Articles',path:'/tech-articles/'}:isLocation?undefined:{name:'Resources',path:'/resources/'}
  if(isPost)markLcpImage(doc)
  const byline=isPost?articleByline(doc):null
  // ARTICLE-LAYOUT-1: a live English post that is in the Tech Articles directory gets the same reading layout as the matched articles.
  if(isPost&&englishCards().some(card=>card.path===doc.targetPath))return <div className="luxury-site figma-wave4" data-live-english={doc.routeId} data-source-rest-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} breadcrumb={[HOME_CRUMB,{name:'Tech Articles',path:'/tech-articles/'}]}/><LuxuryHeader page={pageFor(doc)} routePath={doc.targetPath}/>
    <ArticleReading doc={doc} nodes={articleHeadingNodes(doc.children,true).map(node=>isRecentPostsRegion(node)?'':node)}/>
    <LuxuryFooter page={pageFor(doc)} routePath={doc.targetPath}/>
  </div>
  return <div className="luxury-site figma-wave4" data-live-english={doc.routeId} data-source-rest-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc} breadcrumb={parent?[HOME_CRUMB,parent]:[HOME_CRUMB]}/><LuxuryHeader page={pageFor(doc)} routePath={doc.targetPath}/>
    <main id="main" className="wave4-detail">
      <nav aria-label="Breadcrumb" className="wave4-breadcrumb"><a href="/">Home</a>{parent?<><span aria-hidden="true">/</span><a href={parent.path}>{parent.name}</a></>:null}</nav>
      <article className="wave4-detail-body"><h1>{articleDisplayTitle(doc.seo.h1[0]||doc.title)}</h1>{byline?<p className="wave4-byline"><span>By <AuthorName name={byline.author}/></span><span aria-hidden="true">|</span><time dateTime={byline.dateTime}>{byline.date}</time></p>:null}{doc.children.map((node,index)=>isRecentPostsRegion(node)?null:renderSalmonNode(node,`body.${index}`,doc,true))}</article>
      <div className="wave4-detail-return"><a href={parent?.path??'/'}>← Back to {isProject?'projects':isPost?'technical articles':isLocation?'home':'resources'}</a></div>
    </main>
    <LuxuryFooter page={pageFor(doc)} routePath={doc.targetPath}/>
  </div>
}
