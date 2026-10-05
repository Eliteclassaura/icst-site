import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {LuxuryFooter,LuxuryHeader} from '../LuxuryShell'
import {renderSalmonNode} from '../SalmonCanonical'
import {Wave4ArticleDetail,Wave4ArticleIndex} from '../Wave4Presentation'
import {articleDirectoryDocuments,articleDisplayTitle,articleTocLinks} from '../wave4'
import {articleMetadataTitle} from '../article-metadata'
import {releaseRoutes,salmonDocument} from '../salmon'

const doc=(routeId:string)=>salmonDocument(releaseRoutes().find(route=>route.routeId===routeId)!)

describe('accepted public chrome and Technical Articles implementation',()=>{
  it('keeps the article directory unified, complete and source-ordered without publishing held content',()=>{
    const directory=articleDirectoryDocuments()
    // Master SEO Pass R1: 15 articles consolidated by redirect leave the directory; the three published held articles join it.
    // SEO parity Part 2 R2: the un-consolidated /cooling-tower-vs-chiller/ (OGCS R1.2) is a public article again (237 + 1).
    expect(directory).toHaveLength(238)
    for(const target of ['/closed-loop-vs-open-loop/','/understanding-cooling-tower-parts/','/choosing-cooling-tower-fill-media/'])expect(directory.some(row=>row.doc.targetPath===target),target).toBe(true)
    expect(directory.some(row=>row.doc.targetPath==='/power-plant-cooling-tower/')).toBe(false)
    // The four articles that were noindex only for a cross canonical are self-canonical and indexable (Master SEO Pass R1).
    expect(directory.filter(row=>!row.indexable)).toHaveLength(0)
    expect(directory.some(row=>row.doc.targetPath==='/cooling-tower-retrofit-guide-upgrading-old-towers/')).toBe(true)
    expect(directory.some(row=>row.doc.targetPath==='/hello-world-2/')).toBe(false)
    const html=renderToStaticMarkup(<Wave4ArticleIndex doc={doc('SALMON-pages-1875')}/>),featured=directory.find(row=>row.indexable)!
    expect(html).toContain(`data-article-route="${featured.doc.targetPath}"`)
    expect(html).toContain('data-article-route="/cooling-tower-retrofit-guide-upgrading-old-towers/"')
    expect((html.match(/data-article-route=/g)??[])).toHaveLength(directory.length)
    expect(html).not.toMatch(/matched articles|71 pages|matchedArticles|hello-world-2/)
  })
  it('preserves the existing article anchors while replacing the duplicated visible source TOC',()=>{
    const article=doc('SALMON-posts-3221'),toc=articleTocLinks(article)
    expect(toc.length).toBeGreaterThan(5)
    const html=renderToStaticMarkup(<Wave4ArticleDetail doc={article}/>)
    expect((html.match(/<h1\b/g)??[])).toHaveLength(1)
    expect(html).toContain('class="wave4-toc-rail"')
    expect(html).toContain('class="wave4-toc-mobile"')
    expect(html).not.toContain('Table of Contents (How Does a Cooling Tower Work?)')
    for(const link of toc)expect(html).toContain(`href="${link.href}"`)
    expect(html).toContain('dateTime="2026-07-03"')
    expect(html).toContain('data-pagefind-ignore')
    expect(html).not.toContain('— source document unavailable')
  })
  it('keeps the three specimen pathways limited to verified existing destinations',()=>{
    const html=renderToStaticMarkup(<Wave4ArticleDetail doc={doc('SALMON-posts-3221')}/>)
    for(const href of ['/wp-content/uploads/2021/11/How-Cooling-Towers-Work.pdf','/crossflow-cooling-tower-repair-maintenance/','/fill-media/'])expect(html).toContain(`href="${href}"`)
  })
  it('decodes literal source title entities without changing the hash-verified source files',()=>{
    const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Array<{routeClass:string;export:boolean;sourceFile:string;path:string}>}
    const affected=ledger.routes.filter(row=>row.routeClass==='posts'&&row.export).filter(row=>{
      const source=JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon',row.sourceFile),'utf8')) as {title:string}
      return /&amp;|&#0*38;|&#x0*26;/i.test(source.title)
    })
    expect(affected).toHaveLength(29)
    for(const row of affected){const source=JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon',row.sourceFile),'utf8')) as {title:string};expect(articleDisplayTitle(source.title)).not.toMatch(/&amp;|&#0*38;|&#x0*26;/i)}
    expect(renderSalmonNode('H2OCooling', 'test', doc('SALMON-posts-3221'))).toBe('H2OCooling')
  })
  it('differentiates only the source-identified Part 2 metadata and keeps original source SEO intact',()=>{
    const article=salmonDocument(releaseRoutes().find(route=>route.targetPath==='/inspect-cooling-tower-part-2/')!)
    expect(articleMetadataTitle(article)).toBe('How to Inspect a Cooling Tower — Part 2 | ICS')
    expect(article.seo.title).toBe('Cooling Tower Services: How To Inspect A Cooling Tower')
  })
  it('uses ICS, not CTI, as the global footer identity while retaining verified contacts',()=>{
    const header=renderToStaticMarkup(<LuxuryHeader/>),footer=renderToStaticMarkup(<LuxuryFooter/>)
    expect(header).not.toContain('salmon-header-language')
    expect(header).toContain('site-mobile-search-form')
    expect(footer).toContain('a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png')
    // Owner decision 2026-10-02 (Control Tower ruling): CTI appears only as the membership badge below About ICS; ICS stays the footer identity.
    expect(footer.replace(/<div class="sp-footer-cti"><img [^>]*><\/div>/,'')).not.toContain('Cooling Technology Institute')
    for(const href of ['tel:+13034622000','tel:+819042046742','tel:+6626617723'])expect(footer).toContain(href)
  })
})
