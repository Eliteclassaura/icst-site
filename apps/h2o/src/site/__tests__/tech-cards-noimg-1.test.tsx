/** TECH-CARDS-NOIMG-1: a Tech Articles card without a held image draws no empty media box; the card's image falls back to the first held body image. */
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {ArticleCard,type ArticleCardData} from '../ArticleParts'
import {articleCardImage,matchedWave4Documents} from '../wave4'
import type {SalmonDocument} from '../salmon'

const base:ArticleCardData={path:'/cooling-tower-thermography/',title:'Thermography',excerpt:'Infrared imaging.'}

describe('TECH-CARDS-NOIMG-1',()=>{
  it('a card with no image has no media box; a card with one has exactly one',()=>{
    const bare=renderToStaticMarkup(<ArticleCard card={base}/>)
    expect(bare).not.toContain('wave4-article-card-media')
    expect(bare).toContain('wave4-article-card-body')
    expect(bare).toContain('<strong class="wave4-article-card-title">Thermography</strong>')
    const withImage=renderToStaticMarkup(<ArticleCard card={{...base,image:{src:'/media/x.jpg',width:640,height:360,sha256:'a'.repeat(64)}}}/>)
    expect(withImage.match(/wave4-article-card-media"/g)).toHaveLength(1)
    expect(withImage).toContain('alt=""')
  })
  it('the fallback: an article whose image list is empty but whose body holds a held image takes that image',()=>{
    const docs=matchedWave4Documents()
    let checked=0
    for(const doc of docs){
      const own=articleCardImage(doc)
      if(!own)continue
      const stripped={...doc,images:[]} as SalmonDocument
      const viaBody=articleCardImage(stripped)
      if(viaBody)checked++
      // the fallback never invents: it is a held image of the document, or nothing
      if(viaBody)expect(viaBody.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(checked).toBeGreaterThan(10)
  })
  it('every card of the English directory: a media box exactly when the card has an image',()=>{
    for(const doc of matchedWave4Documents().slice(0,60)){
      const image=articleCardImage(doc)
      const html=renderToStaticMarkup(<ArticleCard card={{path:doc.targetPath,title:doc.title,excerpt:'',image}}/>)
      expect(html.includes('wave4-article-card-media'),doc.targetPath).toBe(Boolean(image))
    }
  })
})
