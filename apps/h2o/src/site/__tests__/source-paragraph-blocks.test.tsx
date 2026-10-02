/**
 * Hosted Tier 3 regression (React #418 on /rt-portfolios/ptt-gsp6-96-fan-ache-performance-upgrade/).
 *
 * The frozen WordPress source of LIVE-portfolio-2174 holds <figure> blocks inside <p>. HTML cannot represent
 * that: the browser's parser closes the paragraph before the figure, so the hydrated tree differs from the
 * server render and React throws #418. The source renderer must split such a paragraph the way the parser
 * does: inline runs stay paragraphs, block children become siblings. No content is dropped or reordered.
 */
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {LiveEnglishDetail} from '../Wave4Presentation'
import {releaseRoutes,salmonDocument} from '../salmon'

const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'])
// Start tags that implicitly close an open <p> (HTML parsing algorithm).
const CLOSES_P=new Set(['address','article','aside','blockquote','details','div','dl','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','hgroup','hr','main','menu','nav','ol','p','pre','section','table','ul'])
function blocksInsideParagraph(html:string):string[]{
  const stack:string[]=[],found:string[]=[]
  for(const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)){
    const [,close,raw,,selfClosing]=match,tag=raw!.toLowerCase()
    if(close){const at=stack.lastIndexOf(tag);if(at>=0)stack.length=at;continue}
    if(CLOSES_P.has(tag)&&stack.includes('p'))found.push(`${tag} in ${stack.slice(-3).join('>')}`)
    if(!VOID.has(tag)&&!selfClosing)stack.push(tag)
  }
  return found
}
const text=(html:string)=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()
const render=()=>{
  const route=releaseRoutes().find(row=>row.routeId==='LIVE-portfolio-2174')!
  return renderToStaticMarkup(<LiveEnglishDetail doc={salmonDocument(route)}/>)
}

describe('source paragraphs never contain block elements',()=>{
  it('the detector recognises the parser-incompatible shape',()=>{
    expect(blocksInsideParagraph('<p>a<figure><img src="x"/></figure>b</p>')).toHaveLength(1)
    expect(blocksInsideParagraph('<p>a</p><figure><img src="x"/></figure><p>b</p>')).toEqual([])
  })
  it('LIVE-portfolio-2174 renders without blocks inside paragraphs, keeping every figure and word',()=>{
    const html=render()
    const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'))
    expect(blocksInsideParagraph(main)).toEqual([])
    expect((main.match(/<figure\b/g)??[]).length).toBeGreaterThanOrEqual(6)
    expect(text(main)).toContain('PTT')
  })
})
