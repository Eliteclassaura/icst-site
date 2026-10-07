/**
 * Pre-cutover QA sweep — pure classifiers (Control Tower brief H2O_CUTOVER_PREP_MAIN_BRIEF_R1, 2026-10-05).
 * No I/O here: parsing a served page, deciding what a URL must answer, and turning observations into findings. The CLI
 * (cutover-sweep.mjs) does the requests. Every finding has a class (grouping key), a severity and the URL.
 */
export const ORIGIN = 'https://h2ocooling.com'
export const decode = (v) => {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}
/** Comparable key of a URL or path: decoded pathname (origin-independent), query kept separately by callers. */
export const keyOf = (u) => {
  try {
    return decode(new URL(u, ORIGIN).pathname)
  } catch {
    return String(u)
  }
}
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#039': "'" }
export const entities = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITY[e.toLowerCase()] ?? m))
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? entities(m[2] ?? m[3] ?? m[4] ?? '') : null
}
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0])
const stripTags = (s) => entities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Everything the sweep reads from one served HTML page. */
/**
 * R2.3 (CT 2026-10-05): the third parties a page's head may name — the same list as src/site/public-urls.ts
 * HEAD_THIRD_PARTY_HOSTS (a test keeps them equal). Every other head URL names the swept host or the canonical host.
 */
export const HEAD_THIRD_PARTY_HOSTS = ['schema.org', 'www.facebook.com', 'facebook.com', 'www.linkedin.com', 'linkedin.com', 'form.typeform.com', 'typeform.com', 'www.instagram.com', 'instagram.com', 'www.youtube.com', 'youtube.com', 'www.tiktok.com', 'tiktok.com']
const HEAD_MEDIA = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|pdf)$/i
export function parsePage(html) {
  const head = html.slice(0, Math.max(html.indexOf('</head>'), 0) || html.length)
  const links = tags(head, 'link')
  const metas = tags(head, 'meta')
  const meta = (n) => metas.filter((t) => (attr(t, 'name') ?? attr(t, 'property'))?.toLowerCase() === n).map((t) => attr(t, 'content') ?? '')
  const jsonLd = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => {
    try {
      JSON.parse(m[1])
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e.message).slice(0, 120) }
    }
  })
  const ldBlocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&'))
  const headUrls = [...new Set([...metas.map((t) => entities(attr(t, 'content') ?? '')), ...ldBlocks].flatMap((t) => t.match(/https?:\/\/[^\s"'<>\\]+/gi) ?? []))]
  const body = html.slice(html.indexOf('<body'))
  const anchors = tags(body, 'a').map((t) => attr(t, 'href')).filter(Boolean)
  const images = [...tags(body, 'img').map((t) => attr(t, 'src')), ...tags(body, 'source').map((t) => (attr(t, 'srcset') ?? '').split(',')[0]?.trim().split(/\s+/)[0])].filter(Boolean)
  const subresources = [
    ...tags(html, 'img').map((t) => attr(t, 'src')),
    ...tags(html, 'script').map((t) => attr(t, 'src')),
    ...tags(html, 'iframe').map((t) => attr(t, 'src')),
    ...links.filter((t) => /stylesheet|preload|icon/i.test(attr(t, 'rel') ?? '')).map((t) => attr(t, 'href')),
  ].filter(Boolean)
  return {
    lang: attr(tags(html, 'html')[0] ?? '', 'lang'),
    title: stripTags((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head) ?? [])[1] ?? ''),
    titles: (head.match(/<title\b/gi) ?? []).length,
    descriptions: meta('description'),
    robotsMeta: meta('robots'),
    canonicals: links.filter((t) => (attr(t, 'rel') ?? '').toLowerCase() === 'canonical').map((t) => attr(t, 'href') ?? ''),
    alternates: links.filter((t) => (attr(t, 'rel') ?? '').toLowerCase() === 'alternate' && attr(t, 'hreflang')).map((t) => ({ hreflang: attr(t, 'hreflang'), href: attr(t, 'href') ?? '' })),
    h1: (body.match(/<h1\b/gi) ?? []).length,
    jsonLd,
    anchors,
    images,
    mixed: subresources.filter((u) => /^http:\/\//i.test(u)),
    // The verified quote fallback (a plain /contact-us/ link) renders only when the RFQ adapter configuration is unresolved.
    rfqFallbacks: (body.match(/<a class="lux-button" href="\/contact-us\/"/g) ?? []).length,
    rfqAdapters: (body.match(/data-rfq-placement="/g) ?? []).length,
    // Every absolute URL the head names (meta content, JSON-LD), and the media among them (checked like images).
    headUrls,
    headMedia: headUrls.filter((u) => { try { return HEAD_MEDIA.test(new URL(u).pathname) } catch { return false } }),
  }
}

/** Internal (same-site) URL of a link or image, or null (external, mailto, tel, fragment, data, javascript). */
export function internalTarget(raw, pageUrl, hosts) {
  if (!raw || /^(?:#|mailto:|tel:|data:|javascript:|sms:)/i.test(raw)) return null
  let u
  try {
    u = new URL(raw, pageUrl)
  } catch {
    return null
  }
  if (!/^https?:$/.test(u.protocol) || !hosts.has(u.host)) return null
  u.hash = ''
  return u.pathname + u.search
}

/** Paths the sweep never requests (private surfaces), except the admin preview route when explicitly enabled. */
export const FORBIDDEN = /^\/(?:crm|admin|api)(?:\/|$)/
export const allowedPath = (p, { preview = false } = {}) => !FORBIDDEN.test(p) || (preview && /^\/api\/sitemap-preview\/?(?:\?|$)/.test(p))

/** Permanent redirect statuses (the batch writes 301; the release snapshot's own redirects answer 308). */
export const PERMANENT = new Set([301, 308])
const finding = (cls, severity, url, detail) => ({ class: cls, severity, url, detail })

/**
 * Findings for one requested URL. `role`: 'sitemap' | 'redirect' | 'gone' | 'yoast'. `obs`: {hops:[{status,location}], page?, headers?}.
 * `expect`: {canonical?, lang?, robots? ('index'|'noindex'|'noindex,follow'), redirectTo?, status?}. `policy`: 'private' | 'production'.
 */
export function classify(url, role, obs, expect = {}, policy = 'private') {
  const out = []
  const hops = obs.hops ?? []
  const last = hops.at(-1) ?? { status: 0 }
  const redirects = hops.slice(0, -1)
  if (last.status === 0 || last.status >= 500) out.push(finding('UNREACHABLE_OR_5XX', 'fail', url, `${hops.map((h) => h.status).join('→') || 'no response'}`))
  if (role === 'sitemap') {
    if (redirects.length) out.push(finding('SITEMAP_URL_REDIRECTS', 'fail', url, hops.map((h) => h.status).join('→')))
    else if (last.status !== 200) out.push(finding('SITEMAP_URL_NOT_200', 'fail', url, String(last.status)))
  }
  if (role === 'redirect') {
    if (!redirects.length) out.push(finding('REDIRECT_NOT_REDIRECTING', 'fail', url, String(last.status)))
    else {
      if (redirects.some((h) => !PERMANENT.has(h.status))) out.push(finding('REDIRECT_NOT_PERMANENT', 'fail', url, redirects.map((h) => h.status).join('→')))
      else if (expect.status && redirects[0].status !== expect.status) out.push(finding('REDIRECT_STATUS_MISMATCH', 'warn', url, `${redirects[0].status} ≠ ${expect.status}`))
      if (redirects.length > 1) out.push(finding('REDIRECT_CHAIN', 'fail', url, `${redirects.length} hops`))
      if (last.status !== 200) out.push(finding('REDIRECT_TARGET_NOT_200', 'fail', url, String(last.status)))
      if (expect.redirectTo && keyOf(redirects[0].location ?? '') !== keyOf(expect.redirectTo)) out.push(finding('REDIRECT_WRONG_TARGET', 'fail', url, `${redirects[0].location} ≠ ${expect.redirectTo}`))
    }
  }
  if (role === 'gone' && last.status !== 410) out.push(finding('GONE_NOT_410', 'fail', url, hops.map((h) => h.status).join('→')))
  if (role === 'yoast') {
    const ok = (last.status === 200 && redirects.every((h) => PERMANENT.has(h.status)) && redirects.length <= 1) || (last.status === 410 && !redirects.length)
    if (!ok) out.push(finding('YOAST_URL_UNACCOUNTED', 'fail', url, hops.map((h) => h.status).join('→')))
  }
  const page = obs.page
  if (page && last.status === 200) {
    const final = obs.finalUrl ?? url
    if (page.canonicals.length !== 1) out.push(finding('CANONICAL_COUNT', 'fail', final, `${page.canonicals.length} canonical links`))
    else if (expect.canonical && keyOf(page.canonicals[0]) !== keyOf(expect.canonical)) out.push(finding('CANONICAL_MISMATCH', 'fail', final, `${page.canonicals[0]} ≠ ${expect.canonical}`))
    if (expect.lang && page.lang !== expect.lang) out.push(finding('LANG_MISMATCH', 'fail', final, `"${page.lang}" ≠ "${expect.lang}"`))
    if (page.h1 !== 1) out.push(finding('H1_COUNT', 'fail', final, `${page.h1} h1`))
    if (!page.title) out.push(finding('TITLE_MISSING', 'fail', final, ''))
    else if (page.title.length > 70) out.push(finding('TITLE_LONG', 'warn', final, `${page.title.length} chars`))
    if (page.titles > 1) out.push(finding('TITLE_DUPLICATE_TAG', 'fail', final, `${page.titles} <title>`))
    if (page.descriptions.length === 0) out.push(finding('META_MISSING', 'warn', final, ''))
    else if (page.descriptions.length > 1) out.push(finding('META_DUPLICATE', 'fail', final, `${page.descriptions.length} descriptions`))
    else if (page.descriptions[0].length < 70 || page.descriptions[0].length > 160) out.push(finding('META_LENGTH', 'warn', final, `${page.descriptions[0].length} chars`))
    for (const j of page.jsonLd) if (!j.ok) out.push(finding('JSONLD_INVALID', 'fail', final, j.error))
    for (const m of page.mixed) out.push(finding('MIXED_CONTENT', 'fail', final, m))
    // Cutover gate (CT R2.1): a hosted page that shows the fallback instead of the adapter means H2O_TYPEFORM_* is missing.
    const swept = (() => { try { return new URL(url).host } catch { return '' } })()
    const allowed = new Set([swept, new URL(ORIGIN).host, ...HEAD_THIRD_PARTY_HOSTS].filter(Boolean))
    const foreign = [...new Set((page.headUrls ?? []).map((u) => { try { return new URL(u).host.toLowerCase() } catch { return '' } }).filter((h) => h && !allowed.has(h)))]
    if (foreign.length) out.push(finding('HEAD_FOREIGN_HOST', 'fail', final, foreign.join(', ')))
    if (page.rfqFallbacks) out.push(finding('RFQ_ADAPTER_NOT_CONFIGURED', 'fail', final, `${page.rfqFallbacks} /contact-us/ fallback quote link(s), ${page.rfqAdapters} adapter mount(s)`))
    const robots = [obs.headers?.['x-robots-tag'] ?? '', ...page.robotsMeta].join(', ').toLowerCase()
    const noindex = /\bnoindex\b/.test(robots)
    if (policy === 'private' && !noindex) out.push(finding('PRIVATE_SURFACE_INDEXABLE', 'fail', final, robots || '(no robots)'))
    if (policy === 'production' && expect.robots === 'index' && noindex) out.push(finding('ROBOTS_NOINDEX_ON_INDEXABLE', 'fail', final, robots))
    if (policy === 'production' && expect.robots && expect.robots !== 'index' && !noindex) out.push(finding('ROBOTS_INDEXABLE_ON_NOINDEX', 'fail', final, robots || '(none)'))
  }
  return out
}

/** hreflang reciprocity over all collected sets (page key → [{hreflang, href}]): each named page serves the identical set. */
export function reciprocity(sets) {
  const out = []
  const sig = (set) => JSON.stringify(set.map((a) => `${a.hreflang} ${keyOf(a.href)}`).sort())
  for (const [page, set] of sets) {
    if (!set.length) continue
    if (!set.some((a) => keyOf(a.href) === page)) out.push(finding('HREFLANG_NO_SELF', 'fail', page, ''))
    for (const a of set) {
      const k = keyOf(a.href)
      if (k === page) continue
      const other = sets.get(k)
      if (!other) out.push(finding('HREFLANG_TARGET_UNCHECKED', 'warn', page, a.href))
      else if (sig(other) !== sig(set)) out.push(finding('HREFLANG_NOT_RECIPROCAL', 'fail', page, a.href))
    }
  }
  return out
}

/** Broken internal link/image findings from HEAD results (target → {status, from:[pages]}). */
export function brokenAssets(results) {
  const out = []
  for (const [target, r] of results) if (!r.status || r.status >= 400) out.push(finding(r.kind === 'image' ? 'BROKEN_IMAGE' : 'BROKEN_LINK', 'fail', target, `${r.status || 'no response'} (on ${r.from.length} page(s), e.g. ${r.from[0]})`))
  return out
}

/** Markdown summary: counts by class, then the first rows of each fail class. */
export function summaryMarkdown(report, perClass = 15) {
  const byClass = new Map()
  for (const f of report.findings) byClass.set(f.class, [...(byClass.get(f.class) ?? []), f])
  const classes = [...byClass.entries()].sort((a, b) => (a[1][0].severity === b[1][0].severity ? b[1].length - a[1].length : a[1][0].severity === 'fail' ? -1 : 1))
  const lines = [
    `# H2O cutover QA sweep — ${report.origin}`,
    '',
    `${report.startedAt} → ${report.finishedAt} · policy **${report.policy}** · ${report.requests} requests (≤ ${report.rps}/s) · preview ${report.preview ? 'yes' : 'no'}`,
    '',
    '| Input | URLs |',
    '|---|---:|',
    ...Object.entries(report.inputs).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    `**Fail:** ${report.findings.filter((f) => f.severity === 'fail').length} · **Warn:** ${report.findings.filter((f) => f.severity === 'warn').length}`,
    '',
    '| Class | Severity | Count |',
    '|---|---|---:|',
    ...classes.map(([c, l]) => `| ${c} | ${l[0].severity} | ${l.length} |`),
  ]
  for (const [c, l] of classes) {
    lines.push('', `## ${c} (${l.length})`, '')
    for (const f of l.slice(0, perClass)) lines.push(`- \`${decode(f.url)}\`${f.detail ? ` — ${f.detail}` : ''}`)
    if (l.length > perClass) lines.push(`- … ${l.length - perClass} more in the JSON`)
  }
  if (report.browser) lines.push('', '## Browser sample', '', `${report.browser.pages} pages × 390/1440 px · console errors ${report.browser.consoleErrors} · overflow ${report.browser.overflow}${report.browser.skipped ? ` · skipped: ${report.browser.skipped}` : ''}`)
  return lines.join('\n') + '\n'
}
