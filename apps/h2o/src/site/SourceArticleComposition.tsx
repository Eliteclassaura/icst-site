import { createElement, type ReactNode } from 'react'
import type { CohortPage } from './cohort'
import { sourceArticleFor, sourceSections, sourceText, type SourceNode } from './source-articles'
import { parseBody } from './markdown'
import { partitionByHeading, sectionTitled, soleList } from './sections'
import { renderInline } from './render'
import { RfqMount } from './RfqMount'
import { articleMedia, SalmonMedia } from './SalmonMedia'

const allowed = new Set(['p','h2','h3','h4','h5','h6','strong','b','em','i','u','s','a','ul','ol','li','figure','figcaption','img','table','thead','tbody','tfoot','tr','th','td','br','sup','sub','blockquote','div','span','hr'])
const safeHref = (value: string): string | undefined => {
  try {
    const url = new URL(value, 'https://h2ocooling.com')
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}

/** Allowlisted React tree: no source HTML injection, scripts, styles or event attributes. */
export const renderSourceNode = (node: SourceNode, key: string): ReactNode => {
  if (typeof node === 'string') return node
  if (!allowed.has(node.tag)) throw new Error(`Unsupported source article tag ${node.tag}`)
  const props: Record<string, unknown> = { key }
  if (node.tag === 'img') {
    if (!node.attrs.src) return <div className="source-media-unavailable" data-source-fallback key={key}>
      <SalmonMedia id={String(node.attrs.alt).startsWith('Factors') ? 'tower-setting' : 'tower-installation'} />
      <p>Supporting field photograph. The original published illustration could not be recovered.</p>
    </div>
    const src = String(node.attrs.src)
    if (!/^\/media\/r41-articles\/[A-Za-z0-9.-]+$/.test(src)) throw new Error('Unverified source image')
    return <img alt={String(node.attrs.alt ?? '')} height={Number(node.attrs.height)} key={key} loading="lazy" src={src} style={{maxWidth:Number(node.attrs.width)}} width={Number(node.attrs.width)} />
  }
  if (node.tag === 'a') props.href = safeHref(String(node.attrs.href ?? ''))
  if (node.tag === 'ol' && node.attrs.start) props.start = Number(node.attrs.start)
  for (const [source,target] of [['colspan','colSpan'],['rowspan','rowSpan']]) {
    if (node.attrs[source!]) props[target!] = Number(node.attrs[source!])
  }
  const children = node.children.map((n,i) => renderSourceNode(n, `${key}-${i}`))
  const element = createElement(node.tag, props, ...children)
  if (node.tag === 'table') return <div aria-label="Scrollable technical table" className="technical-table" key={key} role="region" tabIndex={0}>{element}</div>
  return element
}

export const SourceArticleComposition = ({page}: {page: CohortPage}) => {
  const source = sourceArticleFor(page.routeId)
  const [introduction, ...sections] = sourceSections(source.children)
  const ledeEnd = (introduction ?? []).findIndex(n => typeof n !== 'string' && n.tag === 'p') + 1
  const discovery = soleList(sectionTitled(partitionByHeading(parseBody(page.bodyMarkdown,page.routeId)), 'Related pages'))
  const links = sections.map((section,i) => {
    const heading = section.find(n => typeof n !== 'string' && n.tag === 'h2')
    return <a href={`#article-section-${i+1}`} key={i}><span aria-hidden="true">{String(i+1).padStart(2,'0')}</span>{heading ? sourceText(heading).trim() : ''}</a>
  })
  return <article className="article source-article" data-source-sha256={source.sourceSha256}>
    <header className="source-masthead">
      <p className="hero-eyebrow">ICS / Technical library</p>
      <h1>{source.title}</h1>
      <p className="byline" data-source-byline>{source.author} · {source.date}</p>
      <div className="source-lede" data-source-lede>{introduction?.slice(0,ledeEnd).map((n,i)=>renderSourceNode(n,`lede-${i}`))}</div>
      <a className="source-reading-entry" href="#article-section-1">Explore the guide ↓</a>
      <SalmonMedia className="source-opening-image" id={articleMedia[page.routeId]!} priority />
    </header>
    <div className="article-reading">
      <nav aria-label="Article sections" className="article-index article-index--desktop"><span className="source-rail-label">On this page</span>{links}</nav>
      <details className="article-index article-index--mobile"><summary>On this page</summary><nav aria-label="Article sections">{links}</nav></details>
      <div className="article-body" data-source-body>
        <div className="source-introduction">{introduction?.slice(ledeEnd).map((n,i)=>renderSourceNode(n,`intro-${i}`))}</div>
        {sections.map((section,i)=><section className="article-section source-section" id={`article-section-${i+1}`} key={i}>
          <span aria-hidden="true" className="chapter-number">{String(i+1).padStart(2,'0')}</span>
          {section.map((n,j)=>renderSourceNode(n,`section-${i}-${j}`))}
        </section>)}
      </div>
      <aside className="article-rail">
        <div className="source-origin"><span className="source-rail-label">Published article</span><p>{source.author}<br/>{source.date}</p></div>
        {source.featured ? <figure className="source-title-card" data-source-featured>{renderSourceNode(source.featured,'featured')}</figure>:null}
        {discovery ? <div className="source-related"><h2>Related resources</h2><ul>{discovery.items.map((item,i)=><li key={i}>{renderInline(item)}</li>)}</ul></div>:null}
      </aside>
    </div>
    <section className="source-close"><p className="hero-eyebrow">From technical reading to your application</p><h2>Discuss your cooling tower</h2><RfqMount page={page} mountId="editorial_inline" /><a href="/contact-us/">Contact ICS →</a></section>
  </article>
}
