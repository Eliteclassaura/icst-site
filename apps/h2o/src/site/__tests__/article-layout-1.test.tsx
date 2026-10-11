/**
 * ARTICLE-LAYOUT-1 (DD spec 2026-10-08, OGCS copy seal 7d61001f): the technical-article layout and the Tech Articles index.
 * Pins the OGCS data, the pure model (reading time, heading ids, the inline-CTA split, related articles, the held URL scheme),
 * and the rendered pages: category, deck, meta row, contents, CTA cards, related cards, topic chips, card grid.
 */
import {afterEach,describe,expect,it} from 'vitest'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {LiveEnglishDetail,Wave4ArticleDetail,Wave4ArticleIndex} from '../Wave4Presentation'
import {salmonDocument,salmonRoutes,type SalmonNode} from '../salmon'
import {articleDirectoryDocuments,matchedWave4Article} from '../wave4'
import {
  PAGE_SIZE,articleCopy,articleCopyParts,articleIndexUrlsOn,articleLayout,ctaGroup,existingIds,inlineCtaHeading,isEnglishIndexRoute,pageHref,pagerEntries,paginate,readingMinutes,
  relatedArticles,splitAtId,topicForPath,topicHref,wantsInlineCta,withHeadingIds
} from '../article-layout'

const env0={...process.env}
afterEach(()=>{process.env={...env0}})
const doc=(target:string)=>salmonDocument(salmonRoutes().find(r=>r.targetPath===target)!)
const el=(tag:string,attrs:Record<string,string>,...children:SalmonNode[]):SalmonNode=>({tag,attrs,children})

describe('the OGCS data',()=>{
  it('has the 10 topics, one per article for all 235, and every topic slug resolves',()=>{
    expect(articleLayout.topics).toHaveLength(10)
    expect(Object.keys(articleLayout.routes)).toHaveLength(235)
    for(const slug of Object.values(articleLayout.routes))expect(articleLayout.topics.some(t=>t.slug===slug),slug).toBe(true)
    expect(topicForPath('/cooling-tower-noise-permit/')?.name).toBe('Environment & Noise')
    expect(topicForPath('/ics-begins-shipping-gulfjp-12spp-project/')?.name).toBe('ICS News & Projects')
    expect(topicForPath('/no-such-article/')).toBeUndefined()
  })
  it('keeps the accepted button labels and the footer-band wording out of the end CTA',()=>{
    expect(articleCopy('cta.buttons')).toBe('Request a Quote | Contact us')
    for(const group of ['maintenance','components','design','default','news'])expect(articleCopy(`cta.end.heading.${group}`)).not.toMatch(/Let’s Build/)
    expect(articleCopyParts('meta.by','author')).toEqual(['By ',''])
    expect(()=>articleCopy('no.such.key')).toThrow()
  })
  it('maps every topic to a CTA group, and news posts get no inline CTA',()=>{
    expect(ctaGroup('operation-maintenance')).toBe('maintenance');expect(ctaGroup('repair-rebuild')).toBe('maintenance')
    expect(ctaGroup('fans-drives-components')).toBe('components');expect(ctaGroup('design-construction-materials')).toBe('design')
    expect(ctaGroup('ics-news-projects')).toBe('news');expect(ctaGroup(undefined)).toBe('default')
    expect(wantsInlineCta(1201,'default')).toBe(true);expect(wantsInlineCta(1200,'default')).toBe(false);expect(wantsInlineCta(5000,'news')).toBe(false)
  })
  it('excludes the Thai-language route from the English index',()=>{
    expect(articleLayout.excludedFromEnglishIndex).toHaveLength(1)
    for(const route of articleLayout.excludedFromEnglishIndex)expect(isEnglishIndexRoute(route)).toBe(false)
    expect(isEnglishIndexRoute('/%e0%b9%82%e0%b8%8b/')).toBe(false)
    expect(isEnglishIndexRoute('/cooling-tower-noise-permit/')).toBe(true)
  })
})

describe('the model',()=>{
  it('reading time is words ÷ 220 rounded up, hidden under 3 minutes',()=>{
    expect(readingMinutes('word '.repeat(300))).toBeUndefined()
    expect(readingMinutes('word '.repeat(440))).toBeUndefined() // 2 minutes
    expect(readingMinutes('word '.repeat(441))).toBe(3)
    expect(readingMinutes('word '.repeat(2362))).toBe(11)
  })
  it('adds heading ids without changing text, keeps existing ids, never collides',()=>{
    const tree=[el('div',{},el('h2',{},'Water & Scale'),el('h3',{id:'keep'},'Kept'),el('h2',{},'Water & Scale'),el('h2',{id:'water-and-scale-2'},'Taken'))]
    const {nodes,headings}=withHeadingIds(tree,existingIds(tree))
    expect(headings.map(h=>h.id)).toEqual(['water-and-scale','keep','water-and-scale-3','water-and-scale-2'])
    expect(headings.map(h=>h.text)).toEqual(['Water & Scale','Kept','Water & Scale','Taken'])
    expect(JSON.stringify(tree)).not.toContain('"id":"water-and-scale"') // the input is not mutated
    expect(nodes).toHaveLength(1)
  })
  it('splits the tree at a heading while every node keeps its index',()=>{
    const tree:SalmonNode[]=[el('div',{},el('p',{},'a'),el('section',{},el('p',{},'b'),el('h2',{id:'cut'},'Cut'),el('p',{},'c')),el('p',{},'d')),el('p',{},'tail')]
    const halves=splitAtId(tree,'cut')!
    const text=(list:SalmonNode[]):string=>list.map(n=>typeof n==='string'?n:text(n.children)).join('')
    expect(text(halves.before)).toBe('ab');expect(text(halves.after)).toBe('Cutcdtail')
    expect(halves.before).toHaveLength(2);expect(halves.after).toHaveLength(2)
    const first=halves.after[0] as Exclude<SalmonNode,string>
    expect(first.children[0]).toBe('') // index 0 kept as an empty node, so 'd' is still child 2
    expect((first.children[2] as Exclude<SalmonNode,string>).children[0]).toBe('d')
    expect(splitAtId(tree,'nope')).toBeUndefined()
  })
  it('puts the inline CTA before the h2 nearest 40% of the text, never the first',()=>{
    const hs=[{level:2 as const,id:'a',text:'A',at:0},{level:2 as const,id:'b',text:'B',at:300},{level:3 as const,id:'c',text:'C',at:400},{level:2 as const,id:'d',text:'D',at:800}]
    expect(inlineCtaHeading(hs,1000)?.id).toBe('b')
    expect(inlineCtaHeading(hs.slice(0,1),1000)).toBeUndefined()
  })
  it('related: same topic first, then nearest; never the article itself, the Thai route, or fewer than three',()=>{
    const dir=articleDirectoryDocuments().map(e=>({path:e.doc.targetPath}))
    const current='/cooling-tower-noise-permit/'
    const picked=relatedArticles(current,dir)
    expect(picked).toHaveLength(3)
    expect(picked.some(p=>p.path===current)).toBe(false)
    expect(picked.every(p=>articleLayout.routes[p.path]==='environment-noise')).toBe(true)
    const noTopic=relatedArticles('/not-in-the-data/',dir)
    expect(noTopic).toHaveLength(3);expect(noTopic.every(p=>isEnglishIndexRoute(p.path))).toBe(true)
  })
  it('the held URL scheme is OFF by default and is one switch',()=>{
    expect(articleIndexUrlsOn({})).toBe(false);expect(articleIndexUrlsOn({H2O_ARTICLE_INDEX_URLS:'off'})).toBe(false);expect(articleIndexUrlsOn({H2O_ARTICLE_INDEX_URLS:' ON '})).toBe(true)
    expect(topicHref('environment-noise',false)).toBe('/tech-articles/#topic-environment-noise')
    expect(topicHref('environment-noise',true)).toBe('/tech-articles/topic/environment-noise/')
    expect(pageHref(1)).toBe('/tech-articles/');expect(pageHref(3)).toBe('/tech-articles/page/3/')
    const items=Array.from({length:30},(_,i)=>i)
    expect(paginate(items,1).items).toHaveLength(PAGE_SIZE);expect(paginate(items,3).items).toHaveLength(6);expect(paginate(items,99).page).toBe(3);expect(paginate(items,0).page).toBe(1)
    expect(pagerEntries(1,20)).toEqual([1,2,null,20]);expect(pagerEntries(10,20)).toEqual([1,null,9,10,11,null,20]);expect(pagerEntries(2,3)).toEqual([1,2,3])
  })
})

describe('the article page',()=>{
  const route='/cooling-tower-noise-permit/'
  const html=renderToStaticMarkup(<Wave4ArticleDetail doc={doc(route)}/>)
  it('keeps one H1, the breadcrumb and the structured data, and adds the category, deck and meta row',()=>{
    expect(html.match(/<h1[ >]/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toMatch(/<a class="wave4-article-eyebrow" href="\/tech-articles\/#topic-environment-noise">Environment &amp; Noise<\/a>/)
    expect(html).toContain('class="wave4-article-deck"')
    expect(html).toMatch(/By <a href="[^"]+">Tim Bozic<\/a>/)
    expect(html).toMatch(/Published <time dateTime="2026-07-03">July 3, 2026<\/time>/)
    expect(html).toMatch(/Last updated <time dateTime="2026-07-14">July 14, 2026<\/time>/)
    expect(html).toMatch(/11 min read/)
    expect(html).toContain('application/ld+json')
  })
  it('builds the contents from the rendered headings: ids on every h2, a rail and a collapsed details',()=>{
    expect(html).toContain('aria-label="On this page"')
    expect(html).toContain('class="wave4-toc-mobile"')
    expect(html).not.toMatch(/<nav[^>]*aria-label="On this page"[^>]*><h2/)
    const body=html.slice(html.indexOf('class="wave4-detail-body"'),html.indexOf('data-article-cta="end"'))
    const h2=[...body.matchAll(/<h2[^>]*>/g)]
    expect(h2.length).toBeGreaterThanOrEqual(3)
    for(const m of h2)expect(m[0],'h2 id').toMatch(/id="/)
  })
  it('has one inline CTA (long article), the end CTA with its own heading, and three related cards before the back link',()=>{
    expect(html.match(/data-article-cta="inline"/g)).toHaveLength(1)
    expect(html).toContain('Have an industrial cooling project in mind? Tell us about it and request a quote.')
    expect(html).toContain('data-article-cta="end"')
    expect(html).toContain('Questions about your system?')
    expect(html.match(/Let’s Build Efficient Industrial Cooling Systems/g)).toHaveLength(1) // the footer band's, nowhere else
    expect(html.match(/class="wave4-article-card-item"/g)).toHaveLength(3)
    expect(html).toContain('Related technical articles')
    expect(html.indexOf('data-article-cta="end"')).toBeLessThan(html.indexOf('Related technical articles'))
    expect(html.indexOf('Related technical articles')).toBeLessThan(html.indexOf('← Back to technical articles'))
    expect(html.indexOf('data-article-cta="inline"')).toBeLessThan(html.indexOf('data-article-cta="end"'))
  })
  it('puts the inline CTA inside the body between two parts of it, not at either end',()=>{
    const body=html.slice(html.indexOf('class="wave4-detail-body"'),html.indexOf('data-article-cta="end"'))
    const at=body.indexOf('data-article-cta="inline"')
    expect(at).toBeGreaterThan(body.length*0.15);expect(at).toBeLessThan(body.length*0.85)
  })
  it('related cards link to articles, with the thumbnail decorative and the link carrying the title',()=>{
    const related=html.slice(html.indexOf('wave4-related-articles'),html.indexOf('wave4-detail-return'))
    expect(related).toMatch(/<a class="wave4-article-card" href="\/[a-z0-9-]+\/"/)
    for(const img of related.match(/<img[^>]*>/g)??[])expect(img).toContain('alt=""')
  })
  it('a news article gets no inline CTA and the news end CTA',()=>{
    const newsDoc=articleDirectoryDocuments().find(e=>e.doc.targetPath==='/ics-begins-shipping-gulfjp-12spp-project/')!.doc
    const news=renderToStaticMarkup(<Wave4ArticleDetail doc={newsDoc}/>)
    expect(news).not.toContain('data-article-cta="inline"')
    expect(news).toContain('Talk to our team')
    expect(news).toContain('ICS News &amp; Projects')
  })
})

describe('the Tech Articles index',()=>{
  const directory=articleDirectoryDocuments()
  const english=directory.filter(e=>isEnglishIndexRoute(e.doc.targetPath))
  const page=doc('/tech-articles/')
  it('default: one page with every English card, the topic chips as links, no new URLs',()=>{
    const html=renderToStaticMarkup(<Wave4ArticleIndex doc={page}/>)
    expect(html.match(/data-article-card=/g)).toHaveLength(english.length-1) // the featured article is not in the grid
    expect(html).toContain(`${english.length} articles`)
    expect(html).toContain('aria-label="Browse by topic"')
    expect(html).toContain('>All topics<')
    for(const topic of articleLayout.topics)expect(html).toContain(`href="/tech-articles/#topic-${topic.slug}"`)
    expect(html).not.toMatch(/\/tech-articles\/(topic|page|all)\//)
    expect(html).not.toContain('class="wave4-pager"')
    expect(html).not.toMatch(/%e0%b/i)
  })
  it('featured shows the article image (not the placeholder) and index thumbnails are decorative',()=>{
    const html=renderToStaticMarkup(<Wave4ArticleIndex doc={page}/>)
    expect(html).toContain('class="wave4-featured-media"')
    expect(html).not.toContain('ICS / TECHNICAL READING')
    const cards=html.slice(html.indexOf('wave4-article-grid'),html.indexOf('</main>'))
    for(const img of cards.match(/<img[^>]*>/g)??[])expect(img).toContain('alt=""')
  })
  it('keeps one H1 and the index header (search, resource links)',()=>{
    const html=renderToStaticMarkup(<Wave4ArticleIndex doc={page}/>)
    expect(html.match(/<h1[ >]/g)).toHaveLength(1)
    expect(html).toContain('role="search"');expect(html).toContain('href="/resources/cooling-tower-brochures/"') // REDIRECTS-2: the ranking Brochures URL
  })
  it('switch ON: chips are topic URLs and the grid is the first numbered page with a pager',()=>{
    process.env.H2O_ARTICLE_INDEX_URLS='on'
    const html=renderToStaticMarkup(<Wave4ArticleIndex doc={page}/>)
    expect(html).toContain('href="/tech-articles/topic/environment-noise/"')
    expect(html.match(/data-article-card=/g)).toHaveLength(PAGE_SIZE)
    expect(html).toContain('class="wave4-pager"');expect(html).toContain('href="/tech-articles/page/2/"');expect(html).toContain('rel="next"')
    const topic=renderToStaticMarkup(<Wave4ArticleIndex doc={page} view={{topic:'environment-noise'}}/>)
    expect(topic.match(/data-topic="environment-noise"/g)?.length).toBeGreaterThan(0)
    expect(topic).not.toMatch(/data-topic="repair-rebuild"/)
    expect(topic).toContain('aria-current="true"')
  })
})

describe('every article in the directory gets the reading layout, with exactly one H1',()=>{
  it('renders all 234 English directory articles through it (matched Wave 4 articles and live English posts); the Thai route is not in the English index and keeps its page',()=>{
    let layout=0,wave4=0,live=0
    for(const {doc:article} of articleDirectoryDocuments().filter(e=>isEnglishIndexRoute(e.doc.targetPath))){
      const html=renderToStaticMarkup(matchedWave4Article(article)?<Wave4ArticleDetail doc={article}/>:<LiveEnglishDetail doc={article}/>)
      if(matchedWave4Article(article))wave4++;else live++
      if(html.includes('data-article-cta="end"'))layout++
      expect(html.match(/<h1[ >]/g),article.targetPath).toHaveLength(1)
      expect(html,article.targetPath).toContain('wave4-related-articles')
    }
    expect(wave4+live).toBe(233);expect(live).toBeGreaterThan(0);expect(layout).toBe(233) // REDIRECTS-2: - /cooling-tower-parts-2/ (301 to the Parts page)
  },300000)
})

describe('ARTICLE-LAYOUT-1.1 (DD notes)',()=>{
  const page1=doc('/tech-articles/')
  it('every index card image is lazy and async with explicit size; the featured image is eager',()=>{
    const html=renderToStaticMarkup(<Wave4ArticleIndex doc={page1}/>)
    const grid=html.slice(html.indexOf('wave4-article-grid'),html.indexOf('</main>'))
    const imgs=grid.match(/<img[^>]*>/g)??[]
    expect(imgs.length).toBeGreaterThan(150) // 173 of the 233 cards have an image
    for(const img of imgs){expect(img).toContain('loading="lazy"');expect(img).toContain('decoding="async"');expect(img).toMatch(/width="\d+"/);expect(img).toMatch(/height="\d+"/)}
    const featured=html.match(/<img class="wave4-featured-media"[^>]*>/)![0]
    expect(featured).toContain('loading="eager"');expect(featured).toContain('fetchPriority="high"');expect(featured).toMatch(/width="\d+"/);expect(featured).toMatch(/height="\d+"/)
  })
  it('the stylesheet: one edge for the end card, related cards and back link; chips wrap on desktop and scroll with a fade on phones; one header fill; the tighter phone gap',async()=>{
    const {readFileSync}=await import('node:fs')
    const css=readFileSync(path.join(process.cwd(),'src/app/(site)/design-articles.css'),'utf8')
    const rule=(sel:string)=>css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} \\{([^}]*)\\}`))![1]!
    for(const sel of ['.figma-wave4 .wave4-article-cta--end','.figma-wave4 .wave4-related-articles','.figma-wave4 .wave4-detail-return'])expect(rule(sel),sel).toMatch(/margin-inline: 0;/)
    expect(rule('.figma-wave4 .wave4-topic-chips ul')).toContain('flex-wrap: wrap')
    expect(rule('.figma-wave4 .wave4-topic-chips ul')).not.toContain('overflow-x')
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*\.figma-wave4 \.wave4-topic-chips ul \{[^}]*flex-wrap: nowrap;[^}]*mask-image[^}]*overflow-x: auto;/)
    expect(css).toContain('.technical-table tr:first-child > td:has(> strong:only-child)')
    expect(rule('.figma-wave4 .wave4-reading-layout')).toContain('row-gap: 16px')
  })
})
