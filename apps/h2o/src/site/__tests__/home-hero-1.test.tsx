/**
 * HOME-HERO-1 (post-launch, owner request): the home hero's right-hand image (the b1edced CSS background; the Figma node 51 layout is not what renders) is the live site's main slider photo
 * (a cooling tower with three round fan stacks), from the true corpus original, never upscaled. Alt wording comes from OGCS.
 */
import {describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {imageUrlPath,physicalImagePath} from '../../content/image-slugs'
import {composePublicDocument} from '../../content/compose'
import {extractSlots} from '../../content/content-slots'
import {LuxuryCanonical} from '../LuxuryCanonical'
import {salmonDocument,salmonRoutes} from '../salmon'
import type {SalmonDocument} from '../salmon'

const APP=process.cwd()
const ledger=JSON.parse(readFileSync(path.join(APP,'content/design/home-hero-1.json'),'utf8')) as {original:{width:number;height:number;sha256:string};delivered:{src:string;sha256:string;width:number;height:number;derivative:string};alt:string;slot:{previous:{src:string;sha256:string}};replacement:{src:string;src2x:string;fallback:string;sha256:string;sourceSha256:string;alt:string;width:number;height:number}}

describe('HOME-HERO-1',()=>{
  it('the delivered file is the recorded downscale of the true original (never upscaled, 4:3 kept)',()=>{
    const bytes=readFileSync(path.join(APP,'public',ledger.delivered.src))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ledger.delivered.sha256)
    expect(ledger.delivered.width).toBeLessThanOrEqual(ledger.original.width)
    expect(ledger.delivered.height).toBeLessThanOrEqual(ledger.original.height)
    expect(ledger.delivered.width/ledger.delivered.height).toBeCloseTo(ledger.original.width/ledger.original.height,3)
    const webp=readFileSync(path.join(APP,'public',ledger.delivered.derivative))
    expect(createHash('sha256').update(webp).digest('hex')).toBe(ledger.delivered.derivative.match(/([0-9a-f]{64})\.webp$/)![1])
  })
  it('the selected files preserve their recorded bytes and a compact mobile variant',()=>{
    for(const [file,sha] of [[ledger.replacement.src,ledger.replacement.sha256],[ledger.replacement.src2x,'59b5ae6e7afb6a7d9a1b48577898bcd5f234ef052bbb395169721d55701c7542'],[ledger.replacement.fallback,'67c743fbf8dfae1254e3340a1da468748e7c41c2df2cfda4ee9b10af1ff5ec41']]){
      expect(createHash('sha256').update(readFileSync(path.join(APP,'public',file))).digest('hex')).toBe(sha)
      expect(physicalImagePath(imageUrlPath(file))).toBe(file)
    }
    expect(readFileSync(path.join(APP,'public',ledger.replacement.src)).byteLength).toBeLessThan(300_000)
    expect(ledger.replacement.alt).toBe('Aerial view of a five-cell industrial cooling tower at a plant construction site')
    expect(ledger.replacement.sourceSha256).toBe('acaa6328581c5033cdc0528d232918bfc21dee5691aa24c682f5a9637ca1b904')
  })
  it('renders the selected responsive tile from a composed Payload home record',()=>{
    const routes=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<Record<string,unknown>>}
    const route=routes.routes.find(r=>r.path==='/')!
    const document=salmonDocument(salmonRoutes().find(r=>r.routeId===route.routeId)!)
    const record={id:'home-fixture',pathKey:'/',path:'/',routeId:route.routeId,family:'salmon',title:document.title,_status:'published',updatedAt:'t1',seo:{canonical:route.canonical},document,slots:extractSlots(document,{productIds:new Map()}),source:{aliasOf:null},disposition:{state:'PUBLIC',export:true,indexable:true,sitemap:true,searchable:true,redirect:null}}
    const composed=composePublicDocument(record as never) as unknown as SalmonDocument
    const html=renderToStaticMarkup(<LuxuryCanonical doc={composed}/>)
    const tile=html.match(/<[^>]+data-id="b1edced"[^>]*>[\s\S]*?<\/picture>/)?.[0]
    expect(tile).toBeDefined()
    expect(tile).toContain(`srcSet="${imageUrlPath(ledger.replacement.src)} 880w, ${imageUrlPath(ledger.replacement.src2x)} 1760w"`)
    expect(tile).toContain(`src="${imageUrlPath(ledger.replacement.fallback)}"`)
    expect(tile).toContain(`alt="${ledger.replacement.alt}"`)
    expect(tile).toContain('loading="eager"')
    expect(tile).toContain('fetchPriority="high"')
  })
})
