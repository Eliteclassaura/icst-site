/**
 * Runs inside the legacy page (Playwright `page.evaluate`). Turns the legacy DOM into a neutral
 * section AST the Node side maps onto registry blocks. No React, no Payload — plain data out.
 *
 * Everything here is keyed on the legacy site's own class vocabulary (site.css), which discovery
 * inventoried: .hero, .head, .takeaway, .ev, .tbl, .steps/.step, .gloss, .faq, .cta/.pcta, .xlinks,
 * .offices, .crumb, .subbar, form#form. Unknown sections fall back to a prose AST so no text is lost.
 */
export type Inline = { text: string; bold?: boolean; italic?: boolean; href?: string }
export type ProseNode =
  | { type: 'p'; children: Inline[] }
  | { type: 'h2' | 'h3' | 'h4'; text: string; id?: string }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'dl'; items: Array<{ term: string; def: Inline[] }> }

export type Section = {
  id: string | null
  kind: string
  head?: { label?: string; title?: string; titleTag?: string; lede?: Inline[] }
  hero?: {
    title: string
    lede?: string
    status?: string
    cta: Array<{ label: string; href: string }>
    image?: { src: string; alt: string; width: number; height: number }
  }
  takeaway?: { label: string; items: Array<{ lead: string; text: string }> }
  evidence?: Array<{
    figure: string
    claim: string
    detail?: string
    source: { publisher: string; title: string; href: string; date: string }
  }>
  table?: {
    caption: string
    rowHeader: string
    columns: string[]
    rows: Array<{ label: string; cells: string[] }>
    variant: 'plain' | 'compare' | 'price'
  }
  steps?: Array<{ title: string; text: string }>
  stepsOrdered?: boolean
  gloss?: Array<{
    anchor: string
    term: string
    definition: string
    aside?: string
    notes?: Array<{ label: string; text: string }>
  }>
  glossMore?: { label: string; href: string }
  faq?: Array<{ question: string; answer: string; anchor?: string }>
  cta?: {
    eyebrow?: string
    title: string
    text?: string
    actions: Array<{ label: string; href: string }>
    image?: { src: string; alt: string; width: number; height: number }
  }
  xlinks?: Array<{ label: string; href: string; description?: string; kicker?: string }>
  offices?: Array<{ city: string; region: string; hours: string }>
  crumb?: { trail: Array<{ label: string; href: string }>; current: string }
  form?: boolean
  prose: ProseNode[]
  wordCount: number
  deferred?: string
}

export type PageDump = {
  title: string
  h1: string | null
  sections: Section[]
  subbar?: Array<{ label: string; href: string; current: boolean }>
  jsonLd: unknown[]
  meta: Record<string, string>
  links: string[]
}

export function dumpPage(): PageDump {
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
  const inlines = (el: Element | null): Inline[] => {
    if (!el) return []
    const out: Inline[] = []
    const walk = (n: Node, ctx: { bold?: boolean; italic?: boolean; href?: string }) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = (n.textContent ?? '').replace(/\s+/g, ' ')
        if (t) out.push({ text: t, ...ctx })
        return
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return
      const e = n as Element
      const tag = e.tagName.toLowerCase()
      if (e.getAttribute('aria-hidden') === 'true') return
      if (tag === 'br') return
      const next = { ...ctx }
      if (tag === 'strong' || tag === 'b') next.bold = true
      if (tag === 'em' || tag === 'i') next.italic = true
      if (tag === 'a') next.href = e.getAttribute('href') ?? undefined
      if (tag === 'button') return // interactive triggers (chat) are not prose
      e.childNodes.forEach((c) => walk(c, next))
    }
    el.childNodes.forEach((c) => walk(c, {}))
    // merge + trim
    const merged: Inline[] = []
    for (const i of out) {
      const last = merged[merged.length - 1]
      if (last && last.bold === i.bold && last.italic === i.italic && last.href === i.href)
        last.text += i.text
      else merged.push({ ...i })
    }
    if (merged.length) {
      merged[0]!.text = merged[0]!.text.replace(/^\s+/, '')
      merged[merged.length - 1]!.text = merged[merged.length - 1]!.text.replace(/\s+$/, '')
    }
    return merged.filter((i) => i.text.length)
  }
  const words = (el: Element) => norm(el.textContent).split(' ').filter(Boolean).length

  const prose = (root: Element, skip: (el: Element) => boolean): ProseNode[] => {
    const nodes: ProseNode[] = []
    const visit = (el: Element) => {
      if (skip(el)) return
      const tag = el.tagName.toLowerCase()
      if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
        nodes.push({ type: tag, text: norm(el.textContent), id: el.id || undefined })
        return
      }
      if (tag === 'p') {
        const c = inlines(el)
        if (c.length) nodes.push({ type: 'p', children: c })
        return
      }
      if (tag === 'ul' || tag === 'ol') {
        nodes.push({ type: tag, items: [...el.querySelectorAll(':scope > li')].map((li) => inlines(li)) })
        return
      }
      if (tag === 'dl') {
        const items: Array<{ term: string; def: Inline[] }> = []
        const dts = [...el.querySelectorAll('dt')]
        for (const dt of dts) {
          const dd = dt.nextElementSibling?.tagName.toLowerCase() === 'dd' ? dt.nextElementSibling : null
          items.push({ term: norm(dt.textContent), def: inlines(dd) })
        }
        nodes.push({ type: 'dl', items })
        return
      }
      if (
        tag === 'figure' ||
        tag === 'svg' ||
        tag === 'form' ||
        tag === 'picture' ||
        tag === 'img' ||
        tag === 'button'
      )
        return
      ;[...el.children].forEach(visit)
    }
    ;[...root.children].forEach(visit)
    return nodes
  }

  const imgOf = (pic: Element | null) => {
    const img = pic?.querySelector('img')
    if (!img) return undefined
    return {
      src: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt') ?? '',
      width: Number(img.getAttribute('width') ?? 0),
      height: Number(img.getAttribute('height') ?? 0),
    }
  }
  const linksIn = (el: Element | null) =>
    [...(el?.querySelectorAll('a[href]') ?? [])].map((a) => ({
      label: norm(a.textContent),
      href: a.getAttribute('href') ?? '',
    }))

  const sections: Section[] = []
  const main = document.querySelector('main') ?? document.body

  // Hero (home)
  const heroEl = main.querySelector('.hero')
  if (heroEl) {
    sections.push({
      id: 'hero',
      kind: 'hero',
      hero: {
        title: norm(heroEl.querySelector('h1')?.textContent),
        lede: norm(heroEl.querySelector('.hero__lede')?.textContent) || undefined,
        status: norm(heroEl.querySelector('.status')?.textContent) || undefined,
        cta: linksIn(heroEl.querySelector('.hero__cta')),
        image: imgOf(heroEl.querySelector('.hero__media')),
      },
      prose: [],
      wordCount: words(heroEl),
    })
  }

  const bands = [...main.querySelectorAll('.wrap.band, .wrap.band--tight, .cta, .pcta')].filter(
    (b) => !b.closest('.hero') && !(b.classList.contains('pcta') && b.closest('.band--tight')),
  )
  for (const band of bands) {
    const sec: Section = {
      id: band.id || band.closest('section')?.id || null,
      kind: 'prose',
      prose: [],
      wordCount: words(band),
    }
    const head = band.querySelector(':scope .head, :scope > .stack-lg > .head, :scope > .split > .head')
    if (head) {
      const h = head.querySelector('h1,h2,h3')
      sec.head = {
        label: norm(head.querySelector('.t-label')?.textContent) || undefined,
        title: norm(h?.textContent) || undefined,
        titleTag: h?.tagName.toLowerCase(),
        lede: inlines(head.querySelector(':scope > p')),
      }
    }
    const crumb = band.querySelector('.crumb')
    if (crumb) {
      const as = [...crumb.querySelectorAll('a')]
      sec.crumb = {
        trail: as.map((a) => ({ label: norm(a.textContent), href: a.getAttribute('href') ?? '' })),
        current: norm([...crumb.querySelectorAll('span:not([aria-hidden])')].pop()?.textContent),
      }
    }
    const tk = band.querySelector('.takeaway')
    if (tk) {
      sec.kind = 'takeaway'
      sec.takeaway = {
        label: norm(tk.querySelector(':scope > p')?.textContent),
        items: [...tk.querySelectorAll('li')].map((li) => {
          const strong = li.querySelector('strong')
          const lead = norm(strong?.textContent)
          const text = norm(li.textContent).replace(lead, '').trim()
          return { lead, text }
        }),
      }
    }
    const evs = [...band.querySelectorAll('.ev')]
    if (evs.length) {
      sec.kind = 'evidence'
      const sharedSrc = [...band.querySelectorAll('.cite-src')].find((c) => !c.closest('.ev')) ?? null
      sec.evidence = evs.map((ev) => {
        const src = ev.querySelector('.cite-src') ?? sharedSrc
        const a = src?.querySelector('a')
        const srcText = norm(src?.textContent)
        const publisher = srcText.split(',')[0]?.trim() ?? ''
        const date = srcText.split(',').pop()?.trim() ?? ''
        return {
          figure: norm(ev.querySelector('.ev__fig')?.textContent),
          claim: norm(ev.querySelector('h3')?.textContent),
          detail: norm(ev.querySelector(':scope > p:not(.cite-src)')?.textContent) || undefined,
          source: { publisher, title: norm(a?.textContent), href: a?.getAttribute('href') ?? '', date },
        }
      })
    }
    const tbl = band.querySelector('table')
    if (tbl && !band.querySelector('.tool')) {
      sec.kind = sec.kind === 'prose' ? 'table' : sec.kind
      const ths = [...tbl.querySelectorAll('thead th')].map((th) => norm(th.textContent))
      sec.table = {
        caption: norm(tbl.querySelector('caption')?.textContent),
        rowHeader: ths[0] ?? '',
        columns: ths.slice(1),
        rows: [...tbl.querySelectorAll('tbody tr')].map((tr) => ({
          label: norm(tr.querySelector('th')?.textContent),
          cells: [...tr.querySelectorAll('td')].map((td) => norm(td.textContent)),
        })),
        variant: tbl.classList.contains('tbl--compare')
          ? 'compare'
          : tbl.classList.contains('tbl--price')
            ? 'price'
            : 'plain',
      }
    }
    const steps = [...band.querySelectorAll('.steps .step')]
    if (steps.length) {
      sec.kind = 'steps'
      sec.steps = steps.map((s) => ({
        title: norm(s.querySelector('h3')?.textContent),
        text: norm(s.querySelector('p')?.textContent),
      }))
      sec.stepsOrdered = /^\d/.test(norm(steps[0]?.querySelector('.step__n')?.textContent))
    }
    const gloss = band.querySelector('dl.gloss')
    if (gloss) {
      sec.kind = 'glossary'
      sec.gloss = [...gloss.querySelectorAll('.gloss__i')].map((g) => {
        const dd = g.querySelector('dd')
        const em = dd?.querySelector('em')
        const aside = norm(em?.textContent) || undefined
        const definition = norm(dd?.textContent)
          .replace(aside ?? ' ', '')
          .trim()
        return {
          anchor:
            g.id ||
            norm(g.querySelector('dt')?.textContent)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, ''),
          term: norm(g.querySelector('dt')?.textContent),
          definition,
          aside,
        }
      })
      const more = head?.querySelector('a.ilink')
      if (more) sec.glossMore = { label: norm(more.textContent), href: more.getAttribute('href') ?? '' }
    }
    const terms = [...band.querySelectorAll('.terms .term')]
    if (terms.length) {
      sec.kind = 'glossary'
      sec.gloss = terms.map((t) => ({
        anchor: t.id,
        term: norm(t.querySelector('h2,h3')?.textContent),
        definition: norm(t.querySelector('.term__d')?.textContent),
        notes: [...t.querySelectorAll('dl.term__m > div')].map((d) => ({
          label: norm(d.querySelector('dt')?.textContent),
          text: norm(d.querySelector('dd')?.textContent),
        })),
      }))
    }
    const faq = band.querySelector('.faq')
    if (faq) {
      sec.kind = 'faq'
      sec.faq = [...faq.querySelectorAll('.faq__item')].map((f) => ({
        question: norm(f.querySelector('h3')?.textContent),
        answer: norm(f.querySelector('p')?.textContent),
        anchor: f.id || undefined,
      }))
    }
    if (band.classList.contains('cta') || band.querySelector('.pcta')) {
      sec.kind = 'cta'
      const c = band.classList.contains('cta') ? band : band.querySelector('.pcta')!
      sec.cta = {
        eyebrow: norm(c.querySelector('.t-label')?.textContent) || undefined,
        title: norm(c.querySelector('h2')?.textContent),
        text:
          norm(c.querySelector(':scope p:not(.t-label), .cta__in > p, .pcta > p')?.textContent) || undefined,
        actions: [...c.querySelectorAll('.actions a, .actions button')].map((a) => ({
          label: norm(a.textContent),
          href: a.getAttribute('href') ?? '#contact',
        })),
        image: imgOf(c.querySelector('.cta__media')),
      }
    }
    const xl = [...band.querySelectorAll('.xlinks .xlink')]
    if (xl.length) {
      sec.xlinks = xl.map((a) => ({
        label: norm(a.querySelector('.xlink__t')?.textContent),
        href: a.getAttribute('href') ?? '',
        description: norm(a.querySelector('.xlink__d')?.textContent) || undefined,
        kicker: norm(a.querySelector('.xlink__k')?.textContent) || undefined,
      }))
      if (sec.kind === 'prose') sec.kind = 'xlinks'
    }
    const offices = [...band.querySelectorAll('.offices .office')]
    if (offices.length && !band.closest('footer')) {
      sec.kind = sec.kind === 'prose' ? 'offices' : sec.kind
      sec.offices = offices.map((o) => ({
        city: norm(o.querySelector('.office__c')?.textContent),
        region: norm(o.querySelector('.office__a')?.textContent),
        hours: norm(o.querySelector('.office__t')?.textContent),
      }))
    }
    if (band.querySelector('form#form')) {
      sec.kind = 'form'
      sec.form = true
    }
    if (band.querySelector('.tool, .quiz, .sim, #simRow, .chart-scrub, form#newsForm, .roi')) {
      sec.deferred = 'interactive (Release 2)'
    }
    // prose fallback content: everything that is not a structured element
    sec.prose = prose(band, (el) =>
      Boolean(
        el.closest(
          '.head, .takeaway, .ev, table, .steps, dl.gloss, .terms, .faq, .cta__in, .pcta, .xlinks, .offices, form, .tool, .crumb, figure',
        ),
      ),
    )
    sections.push(sec)
  }

  const subbar = document.querySelector('.subbar')
  const meta: Record<string, string> = {}
  document.querySelectorAll('meta[name], meta[property]').forEach((m) => {
    const k = m.getAttribute('name') ?? m.getAttribute('property') ?? ''
    if (k) meta[k] = m.getAttribute('content') ?? ''
  })
  meta['canonical'] = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? ''

  return {
    title: document.title,
    h1: norm(document.querySelector('h1')?.textContent) || null,
    sections,
    subbar: subbar
      ? [...subbar.querySelectorAll('a')].map((a) => ({
          label: norm(a.textContent),
          href: a.getAttribute('href') ?? '',
          current: a.getAttribute('aria-current') === 'page',
        }))
      : undefined,
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
      JSON.parse(s.textContent ?? 'null'),
    ),
    meta,
    links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? ''),
  }
}
