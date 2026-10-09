/**
 * Delivery derivatives (Tier 3 page weight, 2026-10-02): heavy held originals are delivered as same-size WebP.
 * Originals stay unchanged and remain the provenance identity; every derivative is verified, smaller and present.
 */
import {describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup as renderMarkup} from 'react-dom/server'
import {physicalHtml} from './physical-html'
import {deliverySrc} from '../media-delivery'
import {SalmonFamilyPage,salmonFamilyFor} from '../SalmonFamilies'
import {salmonDocument,salmonRoutes} from '../salmon'
import {physicalSrc} from './physical-html'
const renderToStaticMarkup=(...args:Parameters<typeof renderMarkup>)=>physicalHtml(renderMarkup(...args))

type Item={src:string;origSha256:string;origBytes:number;width:number;height:number;derivative:string;derivativeSha256:string;derivativeBytes:number;psnr:number}
const manifest=JSON.parse(readFileSync(path.join(process.cwd(),'content/media-derivatives.json'),'utf8')) as {items:Item[]}
const pub=(p:string)=>path.join(process.cwd(),'public',p)
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex')
// WebP VP8X/VP8/VP8L canvas size from the RIFF header (no image library needed).
function webpSize(file:string):[number,number]{
  const b=readFileSync(file),kind=b.toString('ascii',12,16)
  if(kind==='VP8X')return [1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)]
  if(kind==='VP8L'){const bits=b.readUInt32LE(21);return [(bits&0x3fff)+1,((bits>>14)&0x3fff)+1]}
  return [b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff]
}

describe('media delivery derivatives',()=>{
  it('every derivative is verified, same-size, smaller and maps from an unchanged original',()=>{
    expect(manifest.items.length).toBeGreaterThan(100)
    for(const item of manifest.items){
      expect(existsSync(pub(item.src)),item.src).toBe(true)
      expect(sha(pub(item.src)),item.src).toBe(item.origSha256)
      expect(item.derivative,item.src).toBe(`/media/derivatives/${item.derivativeSha256}.webp`)
      expect(sha(pub(item.derivative)),item.derivative).toBe(item.derivativeSha256)
      expect(webpSize(pub(item.derivative)),item.src).toEqual([item.width,item.height])
      expect(item.derivativeBytes,item.src).toBeLessThan(item.origBytes)
      expect(item.psnr,item.src).toBeGreaterThanOrEqual(36)
    }
  })
  it('maps known originals and passes everything else through unchanged',()=>{
    const first=manifest.items[0]!
    expect(physicalSrc(deliverySrc(first.src))).toBe(first.derivative)
    expect(deliverySrc('/media/salmon/not-a-derivative.png')).toBe('/media/salmon/not-a-derivative.png')
    expect(deliverySrc(undefined)).toBeUndefined()
  })
  it('a rendered family page delivers derivatives while provenance still names the original',()=>{
    const doc=salmonDocument(salmonRoutes().find(row=>row.targetPath==='/dry-soda-blasting/')!)
    const html=renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={salmonFamilyFor(doc)!}/>)
    const hero=manifest.items.find(item=>item.origSha256==='3b4cd65dd5b87c0245c1314fe4ebf90c4e87dc40b05dc98e85cd5e0df5d4c214')
    if(hero){
      expect(html).toContain(`src="${hero.derivative}"`)
      expect(html).toMatch(new RegExp(`src="${hero.derivative}"[^>]*data-source-sha256="${hero.origSha256}"`))
    }
    for(const item of manifest.items)expect(html,item.src).not.toContain(`src="${item.src}"`)
  })
})
