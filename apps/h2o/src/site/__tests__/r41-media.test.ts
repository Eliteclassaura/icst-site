import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {expect,it} from 'vitest'
import {articleMedia} from '../SalmonMedia'
import {cohort} from '../cohort'

type Asset={id:string;src:string;sha256:string;width:number;height:number;sourceWidth:number;sourceHeight:number;originalPreserved:boolean}
const assets=JSON.parse(readFileSync(path.join(process.cwd(),'content/r41-articles/salmon-media.json'),'utf8')) as Asset[]
it('all 18 curated delivery derivatives match their recorded identity and never enlarge originals',()=>{
  expect(assets).toHaveLength(18)
  for(const asset of assets){
    expect(createHash('sha256').update(readFileSync(path.join(process.cwd(),'public',asset.src))).digest('hex')).toBe(asset.sha256)
    expect(asset.width).toBeLessThanOrEqual(asset.sourceWidth)
    expect(asset.height).toBeLessThanOrEqual(asset.sourceHeight)
    expect(asset.originalPreserved).toBe(true)
  }
})
it('every article has a selected topic image, without using rejected generative trials',()=>{
  for(const page of cohort().filter(p=>p.routeClass==='EDITORIAL'))expect(assets.some(a=>a.id===articleMedia[page.routeId])).toBe(true)
  expect(assets.every(a=>a.src.startsWith('/media/r41/'))).toBe(true)
})
