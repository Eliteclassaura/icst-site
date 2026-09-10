/**
 * Legacy → blueprint extractor (C5). Parses the archived syed.ai HTML with a real DOM (Chromium via
 * Playwright, no network, JavaScript off) and the data constants in site.js (Node vm), and writes
 * `apps/syed-ai/content/syed-ai.blueprint.json` — the site-blueprint v1 the seed consumes and the
 * shape the WordPress/copy-deck importers will emit in Releases 3–4. Parsed, never retyped.
 *
 *   pnpm tsx tools/legacy-extract/extract.ts
 */
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import type { Inline, PageDump, ProseNode, Section } from './dom'

// dom.ts runs inside the page: strip its types once and inject the source (tsx's keepNames helper would not exist in the browser).
const domSource = transformSync(readFileSync(resolve(import.meta.dirname, 'dom.ts'), 'utf8'), {
  loader: 'ts',
  format: 'iife',
  globalName: 'LegacyDom',
}).code

const root = resolve(import.meta.dirname, '../..')
const legacy = join(root, 'legacy-reference/syed-ai-site')
const outDir = join(root, 'apps/syed-ai/content')
const mediaDir = join(outDir, 'media')
mkdirSync(mediaDir, { recursive: true })

const ROUTES = ['/', '/geo-pricing/', '/geo-vs-seo/', '/cited-not-recommended/', '/glossary/']
const ORIGIN = 'https://syed.ai'

// ── Lexical ────────────────────────────────────────────────────────────────────────────────────
const text = (t: string, format = 0) => ({
  type: 'text',
  version: 1,
  text: t,
  format,
  detail: 0,
  mode: 'normal',
  style: '',
})
const inline = (parts: Inline[]) =>
  parts.map((p) => {
    const fmt = (p.bold ? 1 : 0) | (p.italic ? 2 : 0)
    const node = text(p.text, fmt)
    if (!p.href) return node
    return {
      type: 'link',
      version: 3,
      direction: 'ltr',
      format: '',
      indent: 0,
      fields: { linkType: 'custom', url: rewriteHref(p.href), newTab: /^https?:/.test(p.href) },
      children: [node],
    }
  })
const blockNode = (type: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  type,
  version: 1,
  direction: 'ltr',
  format: '',
  indent: 0,
  children,
  ...extra,
})
function lexical(nodes: ProseNode[]) {
  const children = nodes.flatMap((n) => {
    if (n.type === 'p') return [blockNode('paragraph', inline(n.children), { textFormat: 0, textStyle: '' })]
    if (n.type === 'h2' || n.type === 'h3' || n.type === 'h4')
      return [blockNode('heading', [text(n.text)], { tag: n.type })]
    if (n.type === 'ul' || n.type === 'ol')
      return [
        blockNode(
          'list',
          n.items.map((li, i) => blockNode('listitem', inline(li), { value: i + 1 })),
          { listType: n.type === 'ul' ? 'bullet' : 'number', start: 1, tag: n.type },
        ),
      ]
    // dl → paragraphs "Term — definition" (the restricted editor has no dl; glossary blocks carry real <dl>)
    return n.items.map((it) =>
      blockNode('paragraph', [text(it.term + ' — ', 1), ...inline(it.def)], { textFormat: 0, textStyle: '' }),
    )
  })
  return { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } }
}

// ── URL policy (A4: hash views become real pages; A14: trailing slash) ─────────────────────────
const HASH_ROUTES: Record<string, string> = {
  '#work': '/work/',
  '#building': '/building/',
  '#services': '/geo-pricing/#rates',
  '#contact': '/#contact',
  '#faq': '/#faq',
  '#glossary': '/#glossary',
  '#scorecard': '/#scorecard',
  '#roi': '/#roi',
  '#overview': '/',
  '#newsletter': '/#newsletter',
  '#find': '/#find',
  '#geo-vs-seo': '/geo-vs-seo/',
  '#geo-pricing': '/geo-pricing/',
  '#method': '/#method',
  '#team': '/#team',
  '#evidence': '/#evidence',
  '#cited-not-recommended': '/cited-not-recommended/',
}
function rewriteHref(href: string): string {
  if (!href) return href
  const m = href.match(/^\/?#case\/([a-z0-9-]+)$/)
  if (m) return `/work/${m[1]}/`
  const h = href.startsWith('/#') ? href.slice(1) : href
  if (h.startsWith('#') && HASH_ROUTES[h]) return HASH_ROUTES[h]
  if (href.startsWith('assets/')) return '/' + href
  return href
}

// ── Media ──────────────────────────────────────────────────────────────────────────────────────
type MediaEntry = {
  file: string
  alt: string
  width: number
  height: number
  rights: 'owned'
  credit: string
  decorative?: boolean
}
const media = new Map<string, MediaEntry>()
function mediaRef(
  img: { src: string; alt: string; width: number; height: number } | undefined,
  decorative = false,
) {
  if (!img?.src) return undefined
  // Prefer the largest JPEG the legacy srcset offered (Payload regenerates sizes and webp).
  const base = basename(img.src).replace(/-\d+\.(jpg|webp)$/, '')
  const candidates = ['1600', '1100', '900', '760', '600'].map((w) => `${base}-${w}.jpg`)
  const file = candidates.find((f) => exists(join(legacy, 'assets/img', f))) ?? basename(img.src)
  if (!media.has(file)) {
    copyFileSync(join(legacy, 'assets/img', file), join(mediaDir, file))
    media.set(file, {
      file,
      alt: img.alt || (decorative ? 'Decorative background image (rendered with empty alt)' : ''),
      width: img.width,
      height: img.height,
      rights: 'owned',
      credit: 'syed.ai — photographs by the owner, edited by the owner’s designer (ledger 2026-09-04)',
      decorative,
    })
  }
  return file
}
function exists(p: string) {
  try {
    readFileSync(p)
    return true
  } catch {
    return false
  }
}

// ── Section → blocks ───────────────────────────────────────────────────────────────────────────
type Block = Record<string, unknown> & { blockType: string }
const headAsProse = (s: Section, level: 'h2' | 'h3' = 'h2'): ProseNode[] => {
  const out: ProseNode[] = []
  if (s.head?.title) out.push({ type: level, text: s.head.title, id: s.id ?? undefined })
  if (s.head?.lede?.length) out.push({ type: 'p', children: s.head.lede })
  return out
}
const ledeText = (s: Section) => s.head?.lede?.map((i) => i.text).join('') || undefined
const rich = (nodes: ProseNode[], measure: 'prose' | 'wide' = 'prose'): Block | null =>
  nodes.length ? { blockType: 'richText', measure, body: lexical(nodes) } : null
const cols = (labels: string[]) => labels.map((label) => ({ label }))
const rows = (rs: Array<{ label: string; cells: string[] }>) =>
  rs.map((r) => ({ label: r.label, cells: r.cells.map((t) => ({ text: t })) }))
const links = (ls: Array<{ label: string; href: string; description?: string }>) =>
  ls.map((l) => ({ ...l, href: rewriteHref(l.href) }))

function sectionBlocks(s: Section, isFirst: boolean): { blocks: Block[]; deferred?: string } {
  const out: Block[] = []
  const wide = s.prose.length > 2
  if (s.crumb) out.push({ blockType: 'breadcrumb', trail: links(s.crumb.trail), current: s.crumb.current })
  if (s.hero) {
    out.push({
      blockType: 'hero',
      variant: 'media',
      as: 'h1',
      title: s.hero.title,
      lede: s.hero.lede,
      status: s.hero.status,
      cta: {
        primary: s.hero.cta[0] && { ...s.hero.cta[0], href: rewriteHref(s.hero.cta[0].href) },
        secondary: s.hero.cta[1] && { ...s.hero.cta[1], href: rewriteHref(s.hero.cta[1].href) },
      },
      image: mediaRef(s.hero.image),
    })
    return { blocks: out }
  }
  // Sub-page opener: the band whose head carries the h1
  let headUsed = false
  if (isFirst && s.head?.titleTag === 'h1') {
    out.push({
      blockType: 'hero',
      variant: 'plain',
      as: 'h1',
      eyebrow: s.head.label,
      title: s.head.title,
      lede: ledeText(s),
    })
    headUsed = true
  }
  const headProps = () =>
    headUsed ? {} : ((headUsed = true), { eyebrow: s.head?.label, title: s.head?.title, lede: ledeText(s) })
  if (s.xlinks) out.push({ blockType: 'relatedLinks', label: 'Keep reading', links: links(s.xlinks) })

  switch (s.kind) {
    case 'takeaway': {
      const intro = rich(headUsed ? [] : headAsProse(s))
      if (intro) out.push(intro)
      headUsed = true
      const pre = rich(s.prose, wide ? 'wide' : 'prose')
      if (pre) out.push(pre)
      out.push({ blockType: 'takeawayList', ...s.takeaway })
      if (s.table)
        out.push({
          blockType: 'dataTable',
          caption: s.table.caption,
          rowHeader: s.table.rowHeader,
          variant: s.table.variant,
          columns: cols(s.table.columns),
          rows: rows(s.table.rows),
        })
      return { blocks: out }
    }
    case 'evidence':
      out.push({ blockType: 'evidenceGrid', ...headProps(), items: s.evidence })
      break
    case 'table':
      out.push({
        blockType: 'dataTable',
        ...headProps(),
        caption: s.table!.caption,
        rowHeader: s.table!.rowHeader,
        variant: s.table!.variant,
        columns: cols(s.table!.columns),
        rows: rows(s.table!.rows),
      })
      break
    case 'steps':
      out.push({
        blockType: 'steps',
        ...headProps(),
        ordered: s.stepsOrdered ?? true,
        howTo: Boolean(s.stepsOrdered),
        layout: 'split',
        items: s.steps,
      })
      break
    case 'glossary':
      out.push({
        blockType: 'glossaryList',
        ...headProps(),
        more: s.glossMore ? links([s.glossMore])[0] : undefined,
        terms: s.gloss,
      })
      break
    case 'faq':
      out.push({ blockType: 'faq', ...headProps(), items: s.faq })
      break
    case 'cta':
      out.push({
        blockType: 'cta',
        eyebrow: s.cta!.eyebrow,
        title: s.cta!.title,
        text: s.cta!.text,
        cta: {
          primary: s.cta!.actions[0] && { ...s.cta!.actions[0], href: rewriteHref(s.cta!.actions[0].href) },
          secondary: s.cta!.actions[1] && { ...s.cta!.actions[1], href: rewriteHref(s.cta!.actions[1].href) },
        },
        image: mediaRef(s.cta!.image, true),
      })
      return { blocks: out }
    case 'xlinks':
      break
    case 'offices':
      out.push({ blockType: 'offices', ...headProps() })
      break
    case 'form':
      out.push({
        blockType: 'briefForm',
        ...headProps(),
        submitLabel: 'Send the brief',
        briefPlaceholder:
          'We rank top-3 for our category but ChatGPT recommends two competitors and never us.',
        optIn: {
          enabled: true,
          label: 'Send me the automated read of my site too.',
          text: 'I check your homepage, robots.txt and llms.txt, then email a ranked fix list and a ninety-day sequence.',
        },
      })
      return { blocks: out }
  }
  const remainder = rich([...(headUsed ? [] : headAsProse(s)), ...s.prose], wide ? 'wide' : 'prose')
  if (remainder) out.push(remainder)
  if (s.offices && s.kind !== 'offices') out.push({ blockType: 'offices' })
  return { blocks: out, deferred: s.deferred }
}

// ── site.js data (CASES, VENTS) via vm — the source is an IIFE, so slice the literals ──────────
function jsLiteral<T>(src: string, name: string): T {
  const start = src.indexOf(`var ${name} = `)
  if (start < 0) throw new Error(`no ${name} in site.js`)
  const from = src.indexOf('=', start) + 1
  // find the matching end: first line that is exactly "  ];" or "  };" after start
  const endRe = /\n  [\]}];\n/g
  endRe.lastIndex = from
  const m = endRe.exec(src)
  if (!m) throw new Error(`no end for ${name}`)
  const body = src.slice(from, m.index + 4)
  return vm.runInNewContext(`(${body})`) as T
}
type Case = {
  id: string
  track: string
  client: string
  scale: string
  span: string
  title: string
  blurb: string
  bench: string
  problem: string
  ai: string
  plays: Array<{ h: string; p: string }>
  results: Array<{ l: string; f: string; t: string }>
  sources: Array<{ t: string; u: string; d: string }>
  lever: string
  stack: string[]
  diag: Array<{ l: string; v: string; n: string }>
}
type Vent = {
  name: string
  pill: [string, string]
  prog: number | null
  count?: string
  countLabel?: string
  one: string
  body: string
  detail: [string, string][]
  next: string
  team: string
  stack: string[]
}
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&times;/g, '×')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rarr;/g, '→')
    .replace(/&hellip;/g, '…')
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
const P = (t: string): ProseNode => ({ type: 'p', children: [{ text: decode(t) }] })

function casePage(c: Case) {
  const path = `/work/${c.id}/`
  return {
    path,
    slug: c.id,
    pageType: 'case-study',
    title: decode(c.title),
    parent: 'work',
    seo: {
      title: `${decode(c.title)} | Case study | syed.ai`,
      description: decode(c.blurb).slice(0, 160),
      canonical: ORIGIN + path,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1',
    },
    layout: [
      {
        blockType: 'breadcrumb',
        trail: [
          { label: 'syed.ai', href: '/' },
          { label: 'Case studies', href: '/work/' },
        ],
        current: decode(c.title),
      },
      {
        blockType: 'hero',
        variant: 'plain',
        as: 'h1',
        eyebrow: `${c.track} · ${decode(c.client)} · ${decode(c.scale)} · ${c.span}`,
        title: decode(c.title),
        lede: decode(c.blurb),
      },
      {
        blockType: 'dataTable',
        caption: `Results modelled over ${c.span} for a ${decode(c.client)}.`,
        rowHeader: 'Measure',
        variant: 'plain',
        columns: cols(['Before', 'After']),
        rows: rows(c.results.map((r) => ({ label: decode(r.l), cells: [decode(r.f), decode(r.t)] }))),
      },
      rich([
        { type: 'h2', text: 'The problem' },
        P(c.problem),
        { type: 'h2', text: 'What the model found' },
        P(c.ai),
        { type: 'h2', text: 'The plays' },
        ...c.plays.flatMap((p): ProseNode[] => [{ type: 'h3', text: decode(p.h) }, P(p.p)]),
        { type: 'h2', text: 'The lever' },
        P(c.lever),
        { type: 'h2', text: 'How the model was calibrated' },
        P(c.bench),
        { type: 'h2', text: 'Sources' },
        {
          type: 'ul',
          items: c.sources.map((s) => [{ text: decode(s.t), href: s.u }, { text: ' — ' + decode(s.d) }]),
        },
      ]),
      {
        blockType: 'cta',
        title: 'Want the same read on your category?',
        text: 'Send a brief and I will run twenty prompts before we talk.',
        cta: { primary: { label: 'Send a brief', href: '/#contact' } },
      },
    ].filter(Boolean),
    verification: {
      status: 'unverified',
      note: 'Case study is a modelled scenario per the legacy site copy; owner to confirm framing (ledger R18).',
    },
  }
}
function buildPage(v: Vent) {
  const s = slug(v.name)
  const path = `/building/${s}/`
  return {
    path,
    slug: s,
    pageType: 'build',
    title: decode(v.name),
    parent: 'building',
    seo: {
      title: `${decode(v.name)} — what the team builds | syed.ai`,
      description: decode(v.one).slice(0, 160),
      canonical: ORIGIN + path,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1',
    },
    layout: [
      {
        blockType: 'breadcrumb',
        trail: [
          { label: 'syed.ai', href: '/' },
          { label: 'Building', href: '/building/' },
        ],
        current: decode(v.name),
      },
      {
        blockType: 'hero',
        variant: 'plain',
        as: 'h1',
        eyebrow: `${v.pill[1]}${v.count ? ` · ${v.countLabel}: ${decode(v.count)}` : ''}`,
        title: decode(v.name),
        lede: decode(v.one),
      },
      rich([P(v.body)]),
      {
        blockType: 'dataTable',
        caption: `${decode(v.name)} at a glance.`,
        rowHeader: '',
        variant: 'plain',
        columns: cols(['Detail']),
        rows: rows(v.detail.map(([k, val]) => ({ label: decode(k), cells: [decode(val)] }))),
      },
      rich([
        { type: 'h2', text: 'What is next' },
        P(v.next),
        { type: 'h2', text: 'Team and stack' },
        P(`${v.team}. Built with ${v.stack.join(', ')}.`),
      ]),
    ].filter(Boolean),
    verification: { status: 'unverified', note: 'Product status/progress are owner facts (ledger).' },
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────
const { cases, vents } = loadData()
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_EXECUTABLE })
// JS stays on so we can inject the extractor, but the legacy site.js never runs: its DOM is the no-JS DOM.
const ctx = await browser.newContext()
await ctx.route('**/*.js', (r) => r.abort())
const pages: Record<string, unknown>[] = []
type LdNode = Record<string, unknown> & { '@id'?: string; '@type'?: string | string[] }
const siteEntities = new Map<
  string,
  {
    name: string
    schemaId: string
    type: string
    data: Record<string, unknown>
    emitOn: 'all' | 'home' | 'none'
  }
>()
const SITE_IDS: Record<string, 'all' | 'home'> = {
  '#website': 'all',
  '#service': 'all',
  '#person': 'all',
  '#office-celebration': 'home',
  '#office-abudhabi': 'home',
  '#office-lahore': 'home',
  '#blog': 'home',
}
const typeOf = (n: LdNode) => (Array.isArray(n['@type']) ? n['@type'].join(', ') : String(n['@type'] ?? ''))
/** Split a legacy graph: site-wide entities go to schema-entities; page-level nodes become carried extras or block schema fields. */
function absorbJsonLd(route: string, graphs: unknown[], layout: Block[]) {
  const nodes = graphs.flatMap((g) => (g as { '@graph'?: LdNode[] })['@graph'] ?? [g as LdNode])
  const extra: Record<string, unknown> = {}
  const frag = (id: string | undefined) => (id ? id.replace(ORIGIN, '').replace(/^\/[^#]*/, '') : '')
  for (const n of nodes) {
    const id = n['@id']
    const f = frag(id)
    const rest = Object.fromEntries(
      Object.entries(n).filter(([k]) => !['@id', '@type', '@context'].includes(k)),
    )
    if (id && SITE_IDS[f] && id.startsWith(ORIGIN + '/#')) {
      if (!siteEntities.has(f))
        siteEntities.set(f, {
          name: String(n.name ?? f),
          schemaId: id,
          type: typeOf(n),
          data: rest,
          emitOn: SITE_IDS[f],
        })
      continue
    }
    const t = typeOf(n)
    if (t.includes('WebPage')) extra.webpage = { ...rest, '@type': n['@type'] }
    else if (t === 'Article') extra.article = rest
    else if (t === 'HowTo') {
      const stepsBlock = layout.find((b) => b.blockType === 'steps' && (b as { ordered?: boolean }).ordered)
      const { step: _step, ...howto } = rest as { step?: unknown }
      if (stepsBlock) (stepsBlock as Record<string, unknown>).schemaExtra = howto
      else extra.howTo = rest
    } else if (t === 'OfferCatalog') {
      const tbl = layout.find(
        (b) => b.blockType === 'dataTable' && (b as { variant?: string }).variant === 'price',
      )
      if (tbl) (tbl as Record<string, unknown>).schemaExtra = rest
      else extra.offerCatalog = rest
    } else if (t === 'DefinedTermSet') {
      const g = layout.find((b) => b.blockType === 'glossaryList') as
        (Block & { schemaSetId?: string }) | undefined
      if (g) g.schemaSetId = f.replace('#', '')
    } else if (t === 'DefinedTerm') {
      const g = layout.find((b) => b.blockType === 'glossaryList') as
        (Block & { terms?: Array<{ term: string; schemaId?: string }> }) | undefined
      const term = g?.terms?.find((x) => x.term === n.name)
      if (term) term.schemaId = String(id ?? '').replace(/^.*#term-/, '')
    }
    // BreadcrumbList, FAQPage: generated from the breadcrumb/faq blocks (same data), nothing to carry.
  }
  return extra
}
const deferred: Array<{ path: string; section: string | null; reason: string; words: number }> = []
const hashes: Record<string, string> = {}
for (const route of ROUTES) {
  const file = join(legacy, route === '/' ? 'index.html' : route.slice(1) + 'index.html')
  hashes[route] = createHash('sha256').update(readFileSync(file)).digest('hex')
  const page = await ctx.newPage()
  await page.goto('file://' + file)
  await page.addScriptTag({ content: domSource })
  const dump: PageDump = await page.evaluate('LegacyDom.dumpPage()')
  await page.close()
  const raw: Block[] = []
  const layout = raw // merged below
  if (dump.subbar)
    layout.push({
      blockType: 'subNav',
      label: 'Reference pages',
      links: links(dump.subbar.filter((l) => l.href)),
    })
  dump.sections.forEach((s, i) => {
    const { blocks, deferred: d } = sectionBlocks(s, i === (dump.sections[0]?.kind === 'hero' ? 1 : 0))
    // The legacy section id becomes the block's anchor (Payload's built-in blockName), so `/#faq` still lands.
    const anchorTarget = blocks.find((b) => b.blockType !== 'breadcrumb' && b.blockType !== 'hero')
    if (s.id && anchorTarget && !/^view-/.test(s.id)) anchorTarget.blockName = s.id
    layout.push(...blocks)
    if (d) deferred.push({ path: route, section: s.id, reason: d, words: s.wordCount })
  })
  if (route === '/') {
    // A4: the hash views become real pages; the home page links to them (internal-link set may grow, never shrink).
    layout.push({
      blockType: 'relatedLinks',
      label: 'Case studies',
      links: cases.map((c) => ({
        label: decode(c.title),
        href: `/work/${c.id}/`,
        description: `${c.track} · ${decode(c.client)}`,
      })),
    })
    layout.push({
      blockType: 'relatedLinks',
      label: 'What the team builds',
      links: vents.map((v) => ({
        label: decode(v.name),
        href: `/building/${slug(v.name)}/`,
        description: decode(v.one),
      })),
    })
  }
  // Merge consecutive richText blocks of the same measure into one document.
  for (let i = layout.length - 1; i > 0; i--) {
    const a = layout[i - 1] as {
      blockType: string
      measure?: string
      body?: { root: { children: unknown[] } }
    }
    const b = layout[i] as typeof a
    if (
      a.blockType === 'richText' &&
      b.blockType === 'richText' &&
      a.measure === b.measure &&
      a.body &&
      b.body
    ) {
      a.body.root.children.push(...b.body.root.children)
      layout.splice(i, 1)
    }
  }
  const schemaExtra = absorbJsonLd(route, dump.jsonLd, layout)
  const slugOf = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '')
  pages.push({
    path: route,
    slug: slugOf,
    pageType:
      route === '/'
        ? 'home'
        : route === '/geo-pricing/'
          ? 'pricing'
          : route === '/glossary/'
            ? 'glossary'
            : 'article',
    title: dump.h1 ?? dump.title,
    seo: {
      title: dump.title,
      description: dump.meta['description'] ?? '',
      canonical: dump.meta['canonical'],
      robots: dump.meta['robots'] ?? 'index,follow',
      og: Object.fromEntries(Object.entries(dump.meta).filter(([k]) => k.startsWith('og:'))),
      twitter: Object.fromEntries(Object.entries(dump.meta).filter(([k]) => k.startsWith('twitter:'))),
      schemaExtra,
    },
    layout,
    legacyJsonLd: dump.jsonLd,
    legacyLinks: [...new Set(dump.links.filter((h) => h.startsWith('/') || h.startsWith('#')))].sort(),
    verification: {
      status: 'verified',
      note: 'copy parsed from the legacy page; business facts tracked in the ledger',
    },
    decision_ref: null,
    migration: {
      sourceUrl: ORIGIN + route,
      sourceSystem: 'static-html',
      originalTitle: dump.title,
      originalMetaDescription: dump.meta['description'] ?? '',
      originalH1: dump.h1 ?? '',
      originalWordCount: dump.wordCount,
      contentHash: hashes[route],
    },
  })
}
await browser.close()

function loadData() {
  const src = readFileSync(join(legacy, 'assets/js/site.js'), 'utf8')
  return { cases: jsLiteral<Case[]>(src, 'CASES'), vents: jsLiteral<Vent[]>(src, 'VENTS') }
}
for (const c of cases) pages.push(casePage(c))
for (const v of vents) pages.push(buildPage(v))
pages.push({
  path: '/work/',
  slug: 'work',
  pageType: 'category',
  title: 'Six engagements. Every one measured in revenue.'.replace(/^Six/, '{{count}}'),
  seo: {
    title: 'Case studies — measured in revenue | syed.ai',
    description:
      'Modelled scenarios for AI search, SEO and email engagements, each with the revenue behind it.',
    canonical: ORIGIN + '/work/',
    robots: 'index,follow,max-image-preview:large,max-snippet:-1',
  },
  layout: [
    { blockType: 'breadcrumb', trail: [{ label: 'syed.ai', href: '/' }], current: 'Case studies' },
    {
      blockType: 'hero',
      variant: 'plain',
      as: 'h1',
      eyebrow: 'Work',
      title: 'Every engagement, measured in revenue.',
      lede: 'Modelled scenarios calibrated on published findings. Each one names its sources.',
    },
    {
      blockType: 'relatedLinks',
      label: 'Case studies',
      links: cases.map((c) => ({
        label: decode(c.title),
        href: `/work/${c.id}/`,
        description: `${c.track} · ${decode(c.client)}`,
      })),
    },
  ],
  verification: { status: 'verified', note: 'index page' },
})
pages.push({
  path: '/building/',
  slug: 'building',
  pageType: 'category',
  title: 'What the team builds.',
  seo: {
    title: 'What the team builds | syed.ai',
    description: 'Products and internal systems the syed.ai team is building and shipping.',
    canonical: ORIGIN + '/building/',
    robots: 'index,follow,max-image-preview:large,max-snippet:-1',
  },
  layout: [
    { blockType: 'breadcrumb', trail: [{ label: 'syed.ai', href: '/' }], current: 'Building' },
    {
      blockType: 'hero',
      variant: 'plain',
      as: 'h1',
      eyebrow: 'Building',
      title: 'What the team builds.',
      lede: 'Ventures and internal tools, with status and progress stated plainly.',
    },
    {
      blockType: 'relatedLinks',
      label: 'Builds',
      links: vents.map((v) => ({
        label: decode(v.name),
        href: `/building/${slug(v.name)}/`,
        description: decode(v.one),
      })),
    },
  ],
  verification: { status: 'verified', note: 'index page' },
})

// Brand/static assets keep their legacy URLs (/assets/img/…): icons, logo, OG images. Photos go through Media.
const publicImg = join(root, 'apps/syed-ai/public/assets/img')
mkdirSync(publicImg, { recursive: true })
const staticAssets = readdirSync(join(legacy, 'assets/img')).filter((f) =>
  /^(og|icon|favicon|logo|apple-touch)/.test(f),
)
for (const f of staticAssets) copyFileSync(join(legacy, 'assets/img', f), join(publicImg, f))
const textFile = (f: string) =>
  readFileSync(join(legacy, f), 'utf8')
    .split('\n')
    .filter((l) => !/\.php/.test(l))
    .join('\n')

const blueprint = {
  version: 2,
  generatedAt: new Date().toISOString(),
  source: {
    archive: 'legacy-reference/syed-ai-site',
    files: hashes,
    extractor: 'tools/legacy-extract/extract.ts',
    decisions_run_id: null,
  },
  site: { name: 'syed.ai', url: ORIGIN, trailingSlash: true },
  // Parity contract (ADR-028 §8): the frozen legacy site is the baseline; accepted differences are declared here, never silently.
  parity: { baseline: 'frozen-old-site', accept: [], wordCountBlocking: [] },
  hashRoutes: { ...HASH_ROUTES, '#case/<id>': '/work/<id>/' },
  redirects: [
    { from: '/index.html', to: '/', status: 308, source: 'migration', reason: 'legacy index file' },
    ...ROUTES.filter((r) => r !== '/').map((r) => ({
      from: r + 'index.html',
      to: r,
      status: 308,
      source: 'migration',
      reason: 'legacy index file',
    })),
    { from: '/send.php', to: null, status: 410, source: 'migration', reason: 'legacy mail endpoint retired' },
  ],
  gone: [
    '/diagnose.php',
    '/subscribers.php',
    '/subs.php',
    '/confirm.php',
    '/email-check.php',
    '/roadmap.php',
  ].map((p) => ({ path: p, status: 404 })),
  media: [...media.values()],
  staticAssets: staticAssets.map((f) => `/assets/img/${f}`),
  files: {
    robotsTxt: textFile('robots.txt'),
    llmsTxt: textFile('llms.txt'),
    webmanifest: JSON.parse(readFileSync(join(legacy, 'site.webmanifest'), 'utf8')),
  },
  seoDefaults: {
    twitterSite: '@syeddigital',
    titleTemplate: '{title} | syed.ai',
    robotsDirectives: 'index,follow,max-image-preview:large,max-snippet:-1',
    defaultOgImage: '/assets/img/og.jpg',
  },
  schemaEntities: [...siteEntities.values()],
  pages,
  deferred,
}
writeFileSync(join(outDir, 'syed-ai.blueprint.json'), JSON.stringify(blueprint, null, 2) + '\n')
console.log(
  `blueprint: ${pages.length} pages, ${media.size} media files, ${deferred.length} deferred sections`,
)
for (const d of deferred)
  console.log(`  deferred ${d.path} ${d.section ?? '(no id)'} — ${d.reason} (${d.words} words)`)
