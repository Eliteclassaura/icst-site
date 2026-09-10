// Milestone 0 baseline capture for the legacy Syed AI site and the Search Evidence Console.
// Usage: node tools/baseline/capture-baseline.mjs
// Serves the legacy folders with PHP's built-in server (static + PHP), renders each
// route in Chromium at five viewports, and writes an SEO baseline JSON + screenshots.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'docs/baselines')
const VIEWPORTS = [360, 390, 768, 1024, 1440]

const SITES = [
  {
    name: 'syed-ai-site',
    dir: resolve(ROOT, 'legacy-reference/syed-ai-site'),
    port: 8081,
    routes: ['/', '/geo-pricing/', '/geo-vs-seo/', '/cited-not-recommended/', '/glossary/', '/404.html'],
  },
  {
    name: 'search-evidence-console',
    dir: resolve(ROOT, 'legacy-reference/search-evidence-suite/search-evidence-console'),
    port: 8082,
    routes: ['/'],
  },
]

function serve(dir, port) {
  const p = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', dir], { stdio: 'ignore' })
  return p
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function extractSeo(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const attr = (s, a) => q(s)?.getAttribute(a) ?? null
    const metas = {}
    document.querySelectorAll('meta[name],meta[property]').forEach((m) => {
      metas[m.getAttribute('name') || m.getAttribute('property')] = m.getAttribute('content')
    })
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
      try {
        return JSON.parse(s.textContent)
      } catch {
        return { parseError: true }
      }
    })
    const types = new Set()
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') {
        if (n['@type']) [].concat(n['@type']).forEach((t) => types.add(t))
        Object.values(n).forEach(walk)
      }
    }
    walk(ld)
    const headings = [...document.querySelectorAll('h1,h2,h3')].map(
      (h) => `${h.tagName}: ${h.textContent.trim().slice(0, 120)}`,
    )
    const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
    const internal = links.filter(
      (h) => h && (h.startsWith('/') || h.startsWith('https://syed.ai')) && !h.startsWith('//'),
    )
    const imgs = [...document.querySelectorAll('img')].map((i) => ({
      src: i.getAttribute('src'),
      alt: i.getAttribute('alt'),
      w: i.getAttribute('width'),
      h: i.getAttribute('height'),
    }))
    const text = document.body.innerText || ''
    return {
      title: document.title,
      lang: document.documentElement.lang,
      canonical: attr('link[rel="canonical"]', 'href'),
      robots: metas['robots'] ?? null,
      description: metas['description'] ?? null,
      og: Object.fromEntries(Object.entries(metas).filter(([k]) => k.startsWith('og:'))),
      twitter: Object.fromEntries(Object.entries(metas).filter(([k]) => k.startsWith('twitter:'))),
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      h1Count: document.querySelectorAll('h1').length,
      headingOutline: headings,
      jsonLdBlocks: ld.length,
      jsonLdTypes: [...types].sort(),
      internalLinks: [...new Set(internal)].sort(),
      internalLinkCount: internal.length,
      images: imgs,
      imagesMissingAlt: imgs.filter((i) => i.alt === null || i.alt === undefined).length,
      imagesMissingDims: imgs.filter((i) => !i.w || !i.h).length,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')),
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) =>
        l.getAttribute('href'),
      ),
      externalHosts: [
        ...new Set(
          [...document.querySelectorAll('[src],[href]')]
            .map((e) => e.getAttribute('src') || e.getAttribute('href'))
            .filter((u) => /^https?:\/\//.test(u))
            .map((u) => new URL(u).host),
        ),
      ].sort(),
    }
  })
}

const servers = SITES.map((s) => serve(s.dir, s.port))
await sleep(1200)
const browser = await chromium.launch()
const baseline = { capturedAt: new Date().toISOString(), viewports: VIEWPORTS, sites: {} }

try {
  for (const site of SITES) {
    baseline.sites[site.name] = {}
    for (const route of site.routes) {
      const url = `http://127.0.0.1:${site.port}${route}`
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        javaScriptEnabled: false,
      })
      const page = await ctx.newPage()
      const resp = await page.goto(url, { waitUntil: 'load' })
      const noJs = await extractSeo(page)
      await ctx.close()

      const slug = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-')
      const shots = []
      for (const w of VIEWPORTS) {
        const c2 = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 })
        const p2 = await c2.newPage()
        const consoleErrors = []
        p2.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(m.text())
        })
        p2.on('pageerror', (e) => consoleErrors.push(String(e)))
        await p2.goto(url, { waitUntil: 'networkidle' }).catch(() => {})
        await sleep(600)
        const dir = resolve(OUT, 'screenshots', site.name)
        mkdirSync(dir, { recursive: true })
        const file = `${slug}-${w}.png`
        await p2.screenshot({ path: resolve(dir, file), fullPage: w >= 1024 })
        shots.push({ width: w, file: `screenshots/${site.name}/${file}`, consoleErrors })
        await c2.close()
      }
      baseline.sites[site.name][route] = { status: resp?.status() ?? null, noJs, screenshots: shots }
      console.log(`${site.name} ${route} -> ${resp?.status()} title="${noJs.title}"`)
    }
  }
} finally {
  await browser.close()
  servers.forEach((p) => p.kill())
}
mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'seo-baseline.json'), JSON.stringify(baseline, null, 2))
console.log('written docs/baselines/seo-baseline.json')
