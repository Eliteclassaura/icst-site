import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {describe,expect,it} from 'vitest'
import {salmonDocument,salmonNodeText,salmonRoutes} from '../salmon'
import {articleCardImage,articleHeadingNodes,descendants,matchedWave4Article,matchedWave4Articles,matchedWave4Documents,wave4LibraryItems} from '../wave4'

const doc=(id:string)=>salmonDocument(salmonRoutes().find(route=>route.routeId===id)!)

describe('Wave 4 frozen identity and media gates',()=>{
  it('uses exactly the 177 deterministically matched rows, not title-based or held rows',()=>{
    const matched=matchedWave4Articles()
    expect(matched).toHaveLength(177)
    expect(new Set(matched.map(row=>row.routeId)).size).toBe(177)
    expect(matched.filter(row=>row.bodyDecision==='DIFFERS_SALMON_WINS')).toHaveLength(27)
    expect(matchedWave4Documents()).toHaveLength(177)
    for(const article of matchedWave4Documents())expect(matchedWave4Article(article)?.routeId).toBe(article.routeId)
    expect(matchedWave4Article(doc('SALMON-pages-1875'))).toBeUndefined()
  })
  it('keeps the exact raw Figma PNG and never treats a frame export as source media',()=>{
    const image=readFileSync(path.join(process.cwd(),'public/media/figma-wave4/figma-w4-e7d87492.png'))
    expect(image).toHaveLength(5347728)
    expect(createHash('sha256').update(image).digest('hex')).toBe('e7d87492955689448a7bd832a70d269a80785dafa8f4d8cbb4268469cc0a7b9b')
  })
  it('uses each matched article\'s own held source image for its index card',()=>{
    const images=matchedWave4Documents().map(article=>articleCardImage(article))
    expect(images).toHaveLength(177)
    expect(images.every(Boolean)).toBe(true)
    expect(new Set(images.map(image=>image?.sha256)).size).toBe(172)
    for(const image of images){
      const bytes=readFileSync(path.join(process.cwd(),'public',image!.src))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(image!.sha256)
    }
  })
  it('only exposes source-backed, local PDF targets',()=>{
    const expectations:[string,number][]=[['SALMON-pages-1761',13],['SALMON-pages-1797',3],['SALMON-pages-1870',5]]
    for(const [id,count] of expectations){
      const items=wave4LibraryItems(doc(id))
      expect(items).toHaveLength(count)
      for(const item of items){
        expect(item.href).toMatch(/^\/wp-content\/uploads\/\d{4}\/\d{2}\/[A-Za-z0-9._%-]+\.pdf$/)
        expect(readFileSync(path.join(process.cwd(),'public',item.href!)).subarray(0,5).toString('latin1')).toBe('%PDF-')
      }
    }
  })
  it('keeps factual article content while demoting duplicate H1s and omitting an empty source TOC widget',()=>{
    const mediaHeavy=salmonDocument(salmonRoutes().find(route=>route.targetPath==='/the-cooling-tower-components-how-do-they-work/')!)
    const adapted=articleHeadingNodes(mediaHeavy.children)
    expect(adapted.flatMap(node=>descendants(node,'h1'))).toHaveLength(1)
    expect(adapted.map(salmonNodeText).join('').replace(/\s+/g,' ').trim()).toBe(mediaHeavy.children.map(salmonNodeText).join('').replace('Table of Contents','').replace(/\s+/g,' ').trim())
    expect(adapted.flatMap(node=>descendants(node,'h4')).map(salmonNodeText)).not.toContain('Table of Contents')
    expect(mediaHeavy.children.flatMap(node=>descendants(node,'h1'))).toHaveLength(3)
  })
})
