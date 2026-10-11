/**
 * ARTICLE-TOC-1 (staging audit B6, CT 2026-10-11): an article whose source carries the Elementor "Table of Contents" widget (filled in by a
 * script that is gone) showed a heading over nothing. An empty widget renders nothing in every renderer; a populated contents list stays.
 */
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {releaseRoutes,salmonDocument,salmonRoutes,type SalmonNode} from '../salmon'
import {descendants} from '../wave4'
import {dispatch} from './seo-fix-1.test'

const isEmptyTocWidget=(n:SalmonNode)=>typeof n!=='string'&&/(?:^|\s)elementor-widget-table-of-contents(?:\s|$)/.test(n.attrs.class??'')&&descendants(n,'a').length===0
const widgets=(nodes:SalmonNode[]):SalmonNode[]=>nodes.flatMap(n=>typeof n==='string'?[]:[...(/(?:^|\s)elementor-widget-table-of-contents(?:\s|$)/.test(n.attrs.class??'')?[n]:[]),...widgets(n.children)])

describe('ARTICLE-TOC-1: no empty "Table of Contents" block',()=>{
  it('the three articles the audit named render no "Table of Contents" heading and no elementor-toc markup',()=>{
    for(const p of ['/closed-loop-vs-open-loop/','/cooling-tower-algae-prevention/','/water-treatment-for-cooling-towers/']){
      const route=salmonRoutes().find(r=>r.targetPath===p)!
      const doc=salmonDocument(route)
      expect(widgets(doc.children).some(isEmptyTocWidget),`${p} source carries the empty widget`).toBe(true)
      const html=renderToStaticMarkup(dispatch(doc))
      expect(html,p).not.toContain('Table of Contents')
      expect(html,p).not.toMatch(/elementor-toc/)
    }
  },120000)
  it('every document that carries the empty widget renders without it (all 588, both renderers)',()=>{
    let checked=0
    for(const route of salmonRoutes()){
      const doc=salmonDocument(route)
      if(!widgets(doc.children).some(isEmptyTocWidget))continue
      const html=renderToStaticMarkup(dispatch(doc))
      expect(html,route.targetPath).not.toMatch(/elementor-toc__header/)
      checked++
    }
    expect(checked).toBeGreaterThan(500)
  },600000)
  it('a populated contents list is untouched: the Easy TOC block with its links still renders on the article that has one',()=>{
    const route=releaseRoutes().find(r=>r.targetPath==='/cooling-tower-cold-weather-issues/')!
    const html=renderToStaticMarkup(dispatch(salmonDocument(route)))
    expect(html).toContain('Table of Contents')
    expect(html).toContain('#Why_Cold_Weather_Creates_Unique_Challenges_for_Cooling_Towers')
  },120000)
})
