import { defineBlock, type LinkRef } from '../types'
import { fixtures } from './fixture'
import './article-body.css'

export type ArticleSection = {
  heading: string
  paragraphs: string[]
  /** Unordered points; `lead` is an optional bold run-in. */
  bullets?: Array<{ lead?: string; text: string }>
  /** Ordered steps or factors: numbered 01, 02 … by CSS, so the numbers are never typed. */
  numbered?: Array<{ title: string; text: string }>
  /** A short list of related links at the end of a section. */
  links?: LinkRef[]
}

export type ArticleBodyProps = {
  /** Date, byline and source as one line, e.g. "June 9, 2026 · By the author". */
  meta?: string
  sections: ArticleSection[]
  sourceNote?: string
  readMore?: LinkRef
}

/**
 * Article body: an <article> landmark with one level-2 heading per section, paragraphs, lists and related
 * links. The page's H1 and breadcrumb are rendered by the page (hero and breadcrumb blocks), not here.
 */
export function ArticleBodyBlock({ meta, sections, sourceNote, readMore }: ArticleBodyProps) {
  return (
    <article className="blk-article">
      {meta && <p className="blk-article__meta">{meta}</p>}
      {sections.map((s, i) => (
        <section key={i} className="blk-article__section">
          <h2 className="blk-article__h2">{s.heading}</h2>
          {s.paragraphs.map((p, j) => (
            <p key={j} className="blk-article__p">
              {p}
            </p>
          ))}
          {s.bullets && s.bullets.length > 0 && (
            <ul className="blk-article__bullets">
              {s.bullets.map((b, j) => (
                <li key={j}>
                  {b.lead && <strong>{b.lead} </strong>}
                  {b.text}
                </li>
              ))}
            </ul>
          )}
          {s.numbered && s.numbered.length > 0 && (
            <ol className="blk-article__numbered">
              {s.numbered.map((n, j) => (
                <li key={j}>
                  <strong>{n.title}:</strong> {n.text}
                </li>
              ))}
            </ol>
          )}
          {s.links && s.links.length > 0 && (
            <ul className="blk-article__links">
              {s.links.map((l, j) => (
                <li key={j}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {sourceNote && <p className="blk-article__source">{sourceNote}</p>}
      {readMore && (
        <p>
          <a className="blk-article__more" href={readMore.href}>
            {readMore.label} <span aria-hidden="true">→</span>
          </a>
        </p>
      )}
    </article>
  )
}

export const articleBody = defineBlock<ArticleBodyProps>({
  slug: 'articleBody',
  label: 'Article body',
  kind: 'layout',
  Component: ArticleBodyBlock,
  fixtures,
  a11y: [
    'The body is an <article> landmark; each section heading is a level-2 heading; the page H1 comes from the hero above it.',
    'Lists are real ul/ol elements; numbers in the numbered list come from the list order (CSS counter), not from typed text.',
    'Related links are real anchors with their own text; the read-more link names the article it continues.',
    'No JavaScript; no images in this block.',
  ],
})
