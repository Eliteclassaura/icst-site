/**
 * Design Fixes R1 (Control Tower brief 2026-10-04): project photos (A1), the article end (A5), the stylesheet (A2–A6).
 * The phone display (A7) is pinned in footer-cti-social-icons.test.tsx.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonDocument,salmonNodeText,salmonRoutes,type SalmonNode} from '../salmon'
import {Wave4ArticleDetail} from '../Wave4Presentation'
import {articleHeadingNodes,isRecentPostsRegion} from '../wave4'
import {projectMediaRegistry} from '../project-media'

const APP=process.cwd()
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})

describe('A1 project photos: each project its own verified photo, never another project’s',()=>{
  const registry=projectMediaRegistry().projects
  it('the registry holds one distinct, hash-verified photo per project, never upscaled',()=>{
    const entries=Object.entries(registry)
    expect(entries).toHaveLength(22)
    expect(new Set(entries.map(([,e])=>e.media.sha256)).size).toBe(entries.length)
    for(const [p,e] of entries){
      const bytes=readFileSync(path.join(APP,'public',e.media.src))
      expect(createHash('sha256').update(bytes).digest('hex'),p).toBe(e.media.sha256)
      const original=(e as unknown as {original:{width:number}}).original
      expect(e.media.width,p).toBeLessThanOrEqual(original.width)
      const card=(e as unknown as {card?:{src:string;sha256:string;width:number}}).card
      if(card)expect(createHash('sha256').update(readFileSync(path.join(APP,'public',card.src))).digest('hex'),p+' card').toBe(card.sha256)
    }
  })
  it('no two project cards on /all-projects/ share an image, and each card shows its own project’s photo',async()=>{
    const html=await render('/all-projects/')
    // Design R4: each card is one <li data-project-href> holding its own <img data-source-sha256> (no CSS background).
    const cards=[...html.matchAll(/<li class="dr4-proj" data-project-href="(\/all-projects\/[^"/]+\/)">(?:(?!<\/li>)[^])*?data-source-sha256="([0-9a-f]{64})"/g)].map(m=>({sha:m[2]!,href:m[1]!}))
    const projectCards=cards.filter(card=>registry[card.href])
    expect(projectCards.length).toBe(22)
    expect(new Set(projectCards.map(card=>card.sha)).size).toBe(projectCards.length)
    for(const card of projectCards){const e=registry[card.href] as unknown as {media:{sha256:string};card?:{sha256:string}};expect(card.sha,card.href).toBe((e.card??e.media).sha256)}
    // Every card that still shows a photo shows a distinct one.
    expect(new Set(cards.map(card=>card.sha)).size).toBe(cards.length)
  })
  it('PROJ-IMG-1: the two projects once withheld now show their own WordPress featured photos; every old unsafe Salmon photo stays out',async()=>{
    const withheld=projectMediaRegistry().withheld!
    expect(Object.keys(withheld)).toEqual(['/all-projects/pttcsp/','/all-projects/ptt-csp3/'])
    const listing=await render('/all-projects/')
    for(const [p,w] of Object.entries(withheld)){
      const own=registry[p]!
      expect(own,p).toBeTruthy()
      expect(listing,p).toMatch(new RegExp(`<li class="dr4-proj" data-project-href="${p}">`))
      const detail=await render(p)
      expect(detail,p).toContain(own.media.sha256)
      for(const sha of w.withheldSha256){expect(detail,`${p} ${sha}`).not.toContain(sha);if(sha!=='aa6edfe6c9fb42e5b87a59345a747d735c3eb6f1c5a6e2fee50713d9e7f294d9')expect(listing,`${p} ${sha}`).not.toContain(sha)}
    }
  })
  it('EDC: the card year follows its own record (2018) and its detail hero is its own photo',async()=>{
    const html=await render('/all-projects/')
    expect(html).toMatch(/data-project-href="\/all-projects\/edc\/">(?:(?!<\/li>)[^])*?<span class="dr4-proj-year">2018<\/span>/)
    const detail=await render('/all-projects/edc/')
    expect(detail).toContain(registry['/all-projects/edc/']!.media.src)
    for(const [p,e] of Object.entries(registry))if(p!=='/all-projects/edc/')expect(detail,p).not.toContain(e.media.src)
  })
})

describe('A5 article end: one call-to-action band, no legacy Recent Posts list',()=>{
  const route=salmonRoutes().find(row=>row.targetPath==='/cooling-tower-efficiency-calculation/')!
  it('keeps the contracted editorial_inline quote action as an inline row; the only “Let’s Build…” band is the footer’s',()=>{
    const html=renderToStaticMarkup(<Wave4ArticleDetail doc={salmonDocument(route)}/>)
    expect(html.match(/Let’s Build Efficient Industrial Cooling Systems/g)).toHaveLength(1)
    // The mount itself (data-rfq-placement="editorial_inline") renders only with the Typeform origin configured; that
    // contract is pinned in public-rfq-gate.test.tsx. Here: the inline row and its contact fallback.
    // ARTICLE-LAYOUT-1: the end card keeps these classes and its contact fallback, and now carries its own OGCS heading and line.
    expect(html).toMatch(/<section class="wave4-article-rfq wave4-article-rfq--inline wave4-article-cta wave4-article-cta--end" aria-labelledby="wave4-end-cta-heading"[^>]*>.*<a href="\/contact-us\/">Contact us<\/a><\/div><\/section>/)
    expect(html).not.toMatch(/<h2[^>]*>Recent Posts<\/h2>/)
  })
  it('the Recent Posts region is skipped in every published article that carries one, and nothing else is',()=>{
    const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{state:string;routeClass:string;sourceFile?:string;path:string}>}
    const docs=salmonRoutes().filter(row=>ledger.routes.some(r=>r.path===row.targetPath&&r.state==='PUBLIC'&&r.routeClass==='posts'))
    let regions=0
    const h2s=(node:SalmonNode):string[]=>typeof node==='string'?[]:[...(node.tag==='h2'?[salmonNodeText(node).trim()]:[]),...node.children.flatMap(h2s)]
    for(const row of docs){
      const nodes=articleHeadingNodes(salmonDocument(row).children,true)
      const kept=nodes.filter(node=>!isRecentPostsRegion(node))
      regions+=nodes.length-kept.length
      expect(kept.flatMap(h2s),row.targetPath).not.toContain('Recent Posts')
      // A skipped region holds no other heading: no article content goes with it.
      for(const node of nodes.filter(isRecentPostsRegion))expect(h2s(node)).toEqual(['Recent Posts'])
    }
    expect(regions).toBeGreaterThan(0)
  },120000)
})

describe('A2–A6 stylesheet',()=>{
  const css=readFileSync(path.join(APP,'src/app/(site)/design-fixes.css'),'utf8')
  it('is imported last and uses colour tokens only',()=>{
    const imports=[...readFileSync(path.join(APP,'src/app/(site)/layout.tsx'),'utf8').matchAll(/^import '\.\/([^']+\.css)'/gm)].map(m=>m[1])
    // Design R3 (CT 2026-10-06) adds its page stylesheet after this one; design-fixes.css stays last before it.
    expect(imports.slice(-8)).toEqual(['design-fixes.css','design-r3.css','a11y-fixes.css','design-r4.css','design-r5.css','design-r5b.css','design-lang.css','design-articles.css']) // + LEGAL-FIX-1 contrast overrides, then Design R4, R5, R5b and LANG-1, then ARTICLE-LAYOUT-1, last
    for(const line of css.split('\n').filter(l=>/^\s*(color|background(-color)?|border(-color)?)\s*:/.test(l)))expect(line,line).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
  })
  it('carries each audit fix',()=>{
    expect(css).toMatch(/\.salmon-copy\.salmon-page-newtowers \.elementor-element\.elementor-element-708f65e3 :is\(\.elementor-button, \.lux-button, \.rfq a\) \{[^}]*background: var\(--df-blue\)/)
    expect(css).toMatch(/elementor-element-708f65e3 \{[^}]*--h2o-cta-bg: var\(--df-blue\)/)
    expect(css).toMatch(/\.lux-index-row \.lux-reading-type\.lux-grid \{[^}]*display: block !important;[^}]*max-inline-size: 65ch/)
    expect(css).toMatch(/elementor-element-6f026f80:not\(\.elementor-motion-effects-element-type-background\) \{[^}]*background-color: var\(--df-blue\)/)
    expect(css).toMatch(/\.luxury-1555 \.lux-index-row > \.lux-reading-type a \{[^}]*color: var\(--df-white\)/)
    expect(css).toMatch(/\.technical-table table:not\(:has\(:is\(td, th\):nth-child\(3\)\)\) \{[^}]*min-inline-size: 0/)
  })
})

describe('R1.1 (CT 2026-10-05)',()=>{
  it('the /all-projects/ hero is a verified original, never the AI-enhanced Palinpinon copy, and repeats no project card photo',async()=>{
    // Design R4 final review F2 (DD 07ef220a): the hero is LIVE Japan-Project.jpg (general imagery), not a card's own photo.
    const hero=projectMediaRegistry().portfolioHero!
    const html=await render('/all-projects/')
    expect(html).not.toContain(hero.replaces)
    expect(html).toMatch(/<img class="dr4-hero-img"[^>]*data-r4-media="projects\.hero" data-source-sha256="969aa66a977b121960cbd88b4114857920e7afb729b211d32a574c8196e44b80"/)
    for(const [p,e] of Object.entries(projectMediaRegistry().projects))expect((e as unknown as {original?:{sha256:string}}).original?.sha256,p).not.toBe('969aa66a977b121960cbd88b4114857920e7afb729b211d32a574c8196e44b80')
  })
  it('English service pages number their sections once each, in order',()=>{
    const src=readFileSync(path.join(APP,'src/site/EnglishServices.tsx'),'utf8')
    const numbers=[...src.matchAll(/english-service-index">(\d\d) \//g)].map(m=>Number(m[1]))
    expect(numbers).toEqual(numbers.map((_,i)=>i+1))
  })
  it('the long hero headlines get a wider measure and a clamped size (wording unchanged)',()=>{
    const css=readFileSync(path.join(APP,'src/app/(site)/design-fixes.css'),'utf8')
    expect(css).toMatch(/\.luxury-site:is\(\.luxury-1534, \.luxury-1668\) h1\.lux-display-1\[style\] \{[^}]*font-size: clamp\(36px, 4\.4vw, 64px\) !important;[^}]*text-wrap: balance/)
  })
})
