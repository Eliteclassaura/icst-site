import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { cohort } from '../cohort'
import { sourceArticleFor, sourceSections, sourceText, type SourceNode } from '../source-articles'
import { renderSourceNode } from '../SourceArticleComposition'
import { ArticleComposition } from '../ArticleComposition'
import { parseBody } from '../markdown'

describe('R4.1 complete published article overlay', () => {
  for (const page of cohort().filter(p=>p.routeClass==='EDITORIAL')) {
    it(`${page.routeId}: preserves every source node, heading and complete text`, () => {
      const source=sourceArticleFor(page.routeId)
      expect(source.route).toBe(page.canonicalPath)
      const sections=sourceSections(source.children)
      expect(sections.flat()).toEqual(source.children)
      expect(sections[0]?.length).toBeGreaterThan(0)
      expect(source.children.map(sourceText).join('').replace(/\s+/g,' ').trim()).toBe(source.text)
      const counts: Record<string,number>={}
      const headings:string[]=[]
      const walk=(n:SourceNode)=>{if(typeof n==='string')return;counts[n.tag]=(counts[n.tag]??0)+1;if(n.tag==='h2')headings.push(sourceText(n).trim());n.children.forEach(walk)}
      source.children.forEach(walk)
      expect(headings).toEqual(source.headings)
      for(const [tag,key] of [['h2','h2'],['h3','h3'],['p','paragraph'],['table','table']])expect(counts[tag!]??0).toBe(source.stats[key!])
      expect((counts.ul??0)+(counts.ol??0)).toBe(source.stats.list)
      expect(()=>source.children.map((n,i)=>renderToStaticMarkup(renderSourceNode(n,String(i))))).not.toThrow()
    })
  }
  it('performance testing preserves five step headings, conclusion and FAQ in order',()=>{
    const source=sourceArticleFor('RT-0358')
    expect(source.headings.slice(0,5).map(h=>h.match(/^Step (\d):/)?.[1])).toEqual(['1','2','3','4','5'])
    expect(source.headings.slice(5)).toEqual(['Final Thoughts','Frequently Asked Questions'])
    expect(source.stats.h3).toBe(12)
    expect(source.stats.table).toBe(0)
  })
  it('does not admit executable tags or source event handlers',()=>{
    expect(()=>renderSourceNode({tag:'script',attrs:{},children:['alert(1)']},'x')).toThrow()
    const html=renderToStaticMarkup(renderSourceNode({tag:'a',attrs:{href:'javascript:alert(1)',onclick:'alert(1)'},children:['label']},'x'))
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onclick')
  })
  it('legacy composition never discards paragraphs or steps before its first H2',()=>{
    const page=cohort().find(p=>p.routeId==='RT-0358')!
    const blocks=parseBody('# Title\n\nOpening paragraph must survive.\n\n- Step one must survive.\n\n## Ending\n\nConclusion.',page.routeId)
    const html=renderToStaticMarkup(<ArticleComposition blocks={blocks} byline={null} date={null} documents={[]} hero={null} inline={[]} page={page} />)
    expect(html).toContain('Opening paragraph must survive.')
    expect(html).toContain('Step one must survive.')
    expect(html.indexOf('Opening paragraph must survive.')).toBeLessThan(html.indexOf('Conclusion.'))
  })
})
