import type { ReactNode } from 'react'
import { LuxuryFooter, LuxuryHeader } from '../site/LuxuryShell'
import { RfqMount } from '../site/RfqMount'
import { publicMountGate, RFQ_FALLBACK_PATH } from '../site/gate'

/**
 * A page created in Payload (family `editorial`, R1B). Typed sections only — heading, rich-text paragraph,
 * image (Payload media), button, FAQ — rendered inside the accepted site chrome with the existing article
 * reading styles (Main keeps layout authority; no new CSS). A quote button uses the approved adapter through
 * the same public gate as every other page, with the `/contact-us/` fallback when the gate does not mount.
 */
type N = string | { tag: string; attrs: Record<string, string>; children: N[] }
type Section =
  | { blockType: 'heading'; text: string; level: 2 | 3 }
  | { blockType: 'paragraph'; nodes: N[] }
  | { blockType: 'image'; src: string | null; width: number | null; height: number | null; alt: string; caption: string | null }
  | { blockType: 'button'; label: string; href: string; intent: 'none' | 'quote' }
  | { blockType: 'faq'; items: Array<{ question: string; answer: string }> }
export type EditorialDoc = { routeId: string; targetPath: string; title: string; lead: string; sections: Section[] }

const SAFE = /^(?:\/(?!\/)|#|https:\/\/)/
function inline(n: N, key: string): ReactNode {
  if (typeof n === 'string') return n
  const kids = n.children.map((c, i) => inline(c, `${key}.${i}`))
  if (n.tag === 'strong') return <strong key={key}>{kids}</strong>
  if (n.tag === 'em') return <em key={key}>{kids}</em>
  if (n.tag === 'br') return <br key={key} />
  if (n.tag === 'a') return SAFE.test(n.attrs.href ?? '') ? <a key={key} href={n.attrs.href}>{kids}</a> : <span key={key}>{kids}</span>
  return <span key={key}>{kids}</span>
}

function Button({ doc, s, k }: { doc: EditorialDoc; s: Extract<Section, { blockType: 'button' }>; k: string }) {
  if (s.intent === 'quote') {
    const gate = publicMountGate(doc.targetPath, 'editorial_inline')
    if (gate.mounted) return <p key={k} className="editorial-action"><RfqMount mountId="editorial_inline" routePath={doc.targetPath} label={s.label} /></p>
    return <p key={k} className="editorial-action"><a className="lux-button" href={RFQ_FALLBACK_PATH}>{s.label}</a></p>
  }
  return <p key={k} className="editorial-action"><a className="lux-button" href={SAFE.test(s.href) ? s.href : RFQ_FALLBACK_PATH}>{s.label}</a></p>
}

export function EditorialPage({ doc }: { doc: EditorialDoc }) {
  return (
    <div className="luxury-site figma-wave4" data-editorial-page={doc.routeId}>
      <LuxuryHeader routePath={doc.targetPath} />
      <main id="main" className="wave4-detail">
        <nav aria-label="Breadcrumb" className="wave4-breadcrumb"><a href="/">Home</a></nav>
        <article className="wave4-detail-body">
          <h1>{doc.title}</h1>
          {doc.lead ? <p className="wave4-lead">{doc.lead}</p> : null}
          {doc.sections.map((s, i) => {
            const k = `section.${i}`
            if (s.blockType === 'heading') return s.level === 3 ? <h3 key={k}>{s.text}</h3> : <h2 key={k}>{s.text}</h2>
            if (s.blockType === 'paragraph') return <p key={k}>{s.nodes.map((n, j) => inline(n, `${k}.${j}`))}</p>
            if (s.blockType === 'image')
              return s.src ? (
                <figure key={k}>
                  <img src={s.src} alt={s.alt} {...(s.width ? { width: s.width } : {})} {...(s.height ? { height: s.height } : {})} loading="lazy" decoding="async" />
                  {s.caption ? <figcaption>{s.caption}</figcaption> : null}
                </figure>
              ) : null
            if (s.blockType === 'button') return <Button key={k} doc={doc} s={s} k={k} />
            return (
              <section key={k} className="editorial-faq">
                {s.items.map((q, j) => (
                  <details key={j}>
                    <summary>{q.question}</summary>
                    <p>{q.answer}</p>
                  </details>
                ))}
              </section>
            )
          })}
        </article>
      </main>
      <LuxuryFooter routePath={doc.targetPath} />
    </div>
  )
}
