import type {ReactNode} from 'react'
import type {SalmonDocument} from './salmon'
import {pageForSegments} from './cohort'
import {RfqMount} from './RfqMount'
import {deliverySrc} from './media-delivery'
import {articleCardImage,articleDisplayTitle} from './wave4'
import {
  articleCopy,articleCopyParts,articleIndexUrlsOn,ctaButtons,longDate,pagerEntries,pageHref,topicForPath,topicHref,type ArticleHeading,type CtaGroup
} from './article-layout'

/**
 * ARTICLE-LAYOUT-1 server components: the article's meta row, contents, call-to-action cards and related cards, and the shared
 * article card. Markup only; the model is in article-layout.ts and every string comes from the OGCS copy file.
 */
export type ArticleCardData={path:string;title:string;excerpt:string;image?:{src:string;width:number;height:number;sha256:string}}

const pageFor=(doc:SalmonDocument)=>pageForSegments(doc.targetPath.split('/').filter(Boolean))

/** The card data for one article. The thumbnail is decorative (alt="" below): the link already carries the title. */
export function articleCardData(doc:SalmonDocument,excerpt:string):ArticleCardData{
  const image=articleCardImage(doc)
  return {path:doc.targetPath,title:articleDisplayTitle(doc.title),excerpt,image:image?{src:image.src,width:image.width,height:image.height,sha256:image.sha256}:undefined}
}

export function ArticleCard({card,as='li'}:{card:ArticleCardData;as?:'li'|'div'}){
  const topic=topicForPath(card.path)
  const Tag=as
  return <Tag className="wave4-article-card-item" data-article-card="" data-article-route={card.path} data-topic={topic?.slug}>
    <a className="wave4-article-card" href={card.path}>
      {/* TECH-CARDS-NOIMG-1: a card without a held image draws no media box (the grid's first row is then the body). */}
      {card.image?<span className="wave4-article-card-media"><img src={deliverySrc(card.image.src)} alt="" width={card.image.width} height={card.image.height} loading="lazy" decoding="async" data-source-sha256={card.image.sha256}/></span>:null}
      <span className="wave4-article-card-body">
        {topic?<span className="wave4-article-card-eyebrow">{topic.name}</span>:null}
        <strong className="wave4-article-card-title">{card.title}</strong>
        {card.excerpt?<small className="wave4-article-card-excerpt">{card.excerpt}</small>:null}
        <em className="wave4-article-card-link">{articleCopy('related.card.link')}</em>
      </span>
    </a>
  </Tag>
}

export function RelatedArticles({cards}:{cards:ArticleCardData[]}){
  if(!cards.length)return null
  return <section className="wave4-related-articles" aria-labelledby="wave4-related-heading" data-pagefind-ignore>
    <h2 id="wave4-related-heading">{articleCopy('related.heading')}</h2>
    <ul>{cards.map(card=><ArticleCard key={card.path} card={card}/>)}</ul>
  </section>
}

/** On this page: a sticky rail from 1200 px, a closed <details> below. Plain anchors; the active state is progressive enhancement. */
export function ArticleContents({headings}:{headings:ArticleHeading[]}){
  const h2=headings.filter(heading=>heading.level===2)
  if(h2.length<3)return null
  const label=articleCopy('toc.label')
  // H3s nest under the H2 they follow; a leading H3 (before any H2) is left out of the rail rather than invented a parent.
  const groups:Array<{head:ArticleHeading;subs:ArticleHeading[]}>=[]
  for(const heading of headings){if(heading.level===2)groups.push({head:heading,subs:[]});else groups.at(-1)?.subs.push(heading)}
  return <>
    <nav className="wave4-toc-rail" aria-label={label} data-pagefind-ignore data-article-toc=""><p className="wave4-toc-label">{label}</p><ol>{groups.map(({head,subs})=><li key={head.id}><a href={`#${head.id}`}>{head.text}</a>{subs.length?<ol className="wave4-toc-subs">{subs.map(sub=><li key={sub.id}><a href={`#${sub.id}`}>{sub.text}</a></li>)}</ol>:null}</li>)}</ol></nav>
    <details className="wave4-toc-mobile" data-pagefind-ignore><summary>{label}</summary><nav aria-label={label}><ol>{h2.map(heading=><li key={heading.id}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol></nav></details>
  </>
}

export function ArticleMeta({authorNode,published,publishedIso,updated,minutes}:{authorNode:ReactNode;published:string;publishedIso:string;updated?:{text:string;iso:string};minutes?:number}){
  return <p className="wave4-byline wave4-article-meta">
    <span>{articleCopyParts('meta.by','author')[0]}{authorNode}</span>
    <span aria-hidden="true">{' · '}</span>
    <span>{articleCopyParts('meta.published','date')[0]}<time dateTime={publishedIso}>{published}</time></span>
    {updated?<><span aria-hidden="true">{' · '}</span><span>{articleCopyParts('meta.updated','date')[0]}<time dateTime={updated.iso}>{updated.text}</time></span></>:null}
    {minutes?<><span aria-hidden="true">{' · '}</span><span>{articleCopy('meta.read',{n:minutes})}</span></>:null}
  </p>
}

export function ArticleCta({kind,group,doc}:{kind:'inline'|'end';group:CtaGroup;doc:SalmonDocument}){
  if(group==='news'&&kind==='inline')return null
  const page=pageFor(doc)
  const mount=page?<RfqMount mountId="editorial_inline" page={page}/>:<RfqMount mountId="editorial_inline" routePath={doc.targetPath}/>
  if(kind==='inline')return <aside className="wave4-article-cta wave4-article-cta--inline" aria-label={ctaButtons()[0]} data-article-cta="inline"><p>{articleCopy(`cta.inline.${group}`)}</p><div className="wave4-article-cta-actions">{mount}</div></aside>
  return <section className="wave4-article-rfq wave4-article-rfq--inline wave4-article-cta wave4-article-cta--end" aria-labelledby="wave4-end-cta-heading" data-article-cta="end">
    <h2 id="wave4-end-cta-heading">{articleCopy(`cta.end.heading.${group}`)}</h2>
    <p>{articleCopy(`cta.end.body.${group}`)}</p>
    <div className="wave4-article-cta-actions">{mount}<a href="/contact-us/">{ctaButtons()[1]}</a></div>
  </section>
}

export function ArticlePager({page,pages}:{page:number;pages:number}){
  if(pages<2)return null
  return <nav className="wave4-pager" aria-label={articleCopy('index.pager.label')}><ul>
    {page>1?<li><a href={pageHref(page-1)} rel="prev">{articleCopy('index.pager.prev')}</a></li>:null}
    {pagerEntries(page,pages).map((entry,at)=>entry===null?<li key={`gap-${at}`} aria-hidden="true">…</li>:<li key={entry}><a href={pageHref(entry)} aria-current={entry===page?'page':undefined}>{entry}</a></li>)}
    {page<pages?<li><a href={pageHref(page+1)} rel="next">{articleCopy('index.pager.next')}</a></li>:null}
  </ul></nav>
}

export {articleIndexUrlsOn,longDate,topicHref,topicForPath}
