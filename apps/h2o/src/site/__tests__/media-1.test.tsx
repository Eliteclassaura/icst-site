/**
 * MEDIA-1 (Control Tower 2026-10-08): delivery derivatives for every image the parts hub, the product categories and the 180
 * product pages serve, and larger originals of the same picture from the owner's WordPress backup (M2). Never upscaled.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonRoutes} from '../salmon'
import {heldImageSize} from '../image-size'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const upgrades=(JSON.parse(readFileSync(path.join(APP,'content/design/media-upgrades.json'),'utf8')) as {upgrades:Record<string,{file:string;sha256:string;width:number;height:number;bytes:number;held:{width:number;height:number};samePicturePsnr:number;wpUploadsPath:string}>}).upgrades
const derivatives=(JSON.parse(readFileSync(path.join(APP,'content/media-derivatives.json'),'utf8')) as {items:Array<{src:string}>}).items
const pub=(p:string)=>path.join(APP,'public',p)

describe('M2: larger originals of the same picture',()=>{
  it('every upgrade is a real, larger, unmodified WordPress original: held bytes kept, new bytes hash-verified, header size recorded, same picture checked',()=>{
    expect(Object.keys(upgrades).length).toBeGreaterThanOrEqual(90)
    for(const [heldSha,u] of Object.entries(upgrades)){
      const file=pub(`/media/salmon/${path.basename(u.file)}`)
      expect(existsSync(file),u.file).toBe(true)
      const bytes=readFileSync(file)
      expect(createHash('sha256').update(bytes).digest('hex'),u.file).toBe(u.sha256)
      expect(bytes.length,u.file).toBe(u.bytes)
      expect(heldImageSize(`/media/salmon/${path.basename(u.file)}`),u.file).toEqual({width:u.width,height:u.height})
      expect(u.width,u.file).toBeGreaterThan(u.held.width)
      expect(u.height,u.file).toBeGreaterThan(u.held.height)
      expect(u.samePicturePsnr,u.file).toBeGreaterThanOrEqual(24)
      expect(u.wpUploadsPath,u.file).toMatch(/\.(jpe?g|png|webp)$/i)
      expect(heldSha).toMatch(/^[0-9a-f]{64}$/)
    }
  })
  it('the derivative manifest covers the served images that can be made smaller at PSNR >= 36',()=>{
    expect(derivatives.length).toBeGreaterThanOrEqual(470)
    for(const u of Object.values(upgrades).filter(x=>/\.(jpe?g|png)$/i.test(x.file)))
      expect(derivatives.some(d=>d.src===`/media/salmon/${path.basename(u.file)}`),u.file).toBe(true)
  })
})

describe('rendered product, category and parts-hub pages',()=>{
  it('every held image carries width and height equal to the file it serves (derivative or original), and none is upscaled',async()=>{
    const routes=salmonRoutes().filter(r=>/^\/product\/|^\/product-category\/|^\/cooling-tower-parts-online\/$/.test(r.targetPath))
    expect(routes.length).toBeGreaterThanOrEqual(220)
    const problems:string[]=[]
    let images=0
    for(const route of routes){
      const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:route.targetPath.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
      for(const m of html.matchAll(/<img\b[^>]*data-source-sha256="[0-9a-f]+"[^>]*>|<img\b[^>]*>/g)){
        const tag=m[0],src=/ src="([^"]+)"/.exec(tag)?.[1]
        if(!src||!src.startsWith('/media/'))continue
        images++
        const real=heldImageSize(src)
        const w=Number(/ width="(\d+)"/.exec(tag)?.[1]),h=Number(/ height="(\d+)"/.exec(tag)?.[1])
        if(!real)problems.push(`${route.targetPath} ${src} unreadable`)
        else if(!w||!h)problems.push(`${route.targetPath} ${src} has no width/height`)
        else if(w>real.width||h>real.height)problems.push(`${route.targetPath} ${src} declares ${w}x${h} but the file is ${real.width}x${real.height}`)
      }
    }
    expect(images).toBeGreaterThan(2500)
    expect(problems.slice(0,20)).toEqual([])
  },900_000)
})
