/**
 * 1.2f-FIX-A (CT 2026-10-11), item C: "Last updated" (AEO-1) was only drawn by the Wave 4 article layout. The English posts outside the frozen Wave 4 set
 * (closed-loop-vs-open-loop and others) render in SalmonCanonical, and the AEO-1 sample silently skipped them (`if(!html.includes('wave4-detail'))continue`).
 */
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {salmonDocument,releaseRoutes} from '../salmon'
import {articleModified} from '../article-layout'
import {languageFor} from '../../content/locale-language'
import {matchedWave4Article} from '../wave4'
import {SalmonCanonical} from '../SalmonCanonical'
import {Wave4ArticleDetail} from '../Wave4Presentation'
import {salmonFamilyFor} from '../SalmonFamilies'
import {isArchiveDocument} from '../ArchivePresentation'
import type {SalmonDocument} from '../salmon'

/** The post branch of the site's dispatch (app/(site)/[[...slug]]/page.tsx): families and archives first, then the Wave 4 layout for the frozen set, else SalmonCanonical. */
const dispatch=(doc:SalmonDocument)=>matchedWave4Article(doc)?<Wave4ArticleDetail doc={doc}/>:<SalmonCanonical doc={doc}/>
const otherLayout=(doc:SalmonDocument)=>Boolean(salmonFamilyFor(doc))||isArchiveDocument(doc)

describe('C: "Last updated" on every English post, in the layout the page really uses',()=>{
  it('every fourth English SALMON post with a dateModified (both layouts, none skipped) shows "Last updated <that day>" (no sample, no skipped layouts)',()=>{
    const posts=releaseRoutes().filter(r=>/^SALMON-posts-/.test(r.routeId)&&languageFor(r.targetPath)==='en'&&!/%e0%b/i.test(r.targetPath))
    let shown=0,viaSalmonCanonical=0
    const day=(html:string)=>/Last updated[^<]*<time dateTime="(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1]
    // the unmatched posts (SalmonCanonical) are all rendered; the Wave 4 layout is sampled (AEO-1 covers it in depth): the whole set made the suite slow
    const wave4=new Set(posts.filter(r=>matchedWave4Article(salmonDocument(r))).filter((_,i)=>i%6===0).map(r=>r.routeId))
    for(const route of posts){
      if(matchedWave4Article(salmonDocument(route))&&!wave4.has(route.routeId))continue
      const doc=salmonDocument(route)
      if(otherLayout(doc))continue
      const modified=articleModified(doc)
      if(!modified)continue
      const html=renderToStaticMarkup(dispatch(doc))
      if(!/wave4-byline/.test(html))continue // a post whose source carries no byline widget draws none (same rule as before)
      expect(day(html),route.targetPath).toBe(modified)
      shown++
      if(!html.includes('wave4-detail'))viaSalmonCanonical++
    }
    expect(shown).toBeGreaterThan(80)
    expect(viaSalmonCanonical).toBeGreaterThan(50)
  },600000)
  it('/closed-loop-vs-open-loop/ shows "Last updated July 18, 2026"',()=>{
    const doc=salmonDocument(releaseRoutes().find(r=>r.targetPath==='/closed-loop-vs-open-loop/')!)
    expect(renderToStaticMarkup(dispatch(doc))).toMatch(/Last updated <time dateTime="2026-07-18">July 18, 2026<\/time>/)
  })
})
