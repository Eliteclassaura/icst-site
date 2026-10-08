/**
 * VIDEO-1 (Control Tower 2026-10-08): the owner's installation highlights clip on the About page, self-hosted:
 * controls, muted, playsinline, preload none, no autoplay or loop, poster at native size, explicit size, visible caption.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonRoutes} from '../salmon'
import {ABOUT_ROUTE_ID} from '../AboutComposition'
import {heldImageSize} from '../image-size'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const manifest=JSON.parse(readFileSync(path.join(APP,'content/design/video-1.json'),'utf8')) as {video:{src:string;sha256:string;bytes:number;width:number;height:number};poster:{src:string;sha256:string;bytes:number;width:number;height:number}}
const sha=(p:string)=>createHash('sha256').update(readFileSync(path.join(APP,'public',p))).digest('hex')

describe('VIDEO-1 About page video',()=>{
  it('the files are the recorded, raw bytes (MP4 ftyp, WebP at native size, no LFS pointers)',()=>{
    const mp4=readFileSync(path.join(APP,'public',manifest.video.src))
    expect(mp4.toString('ascii',4,8)).toBe('ftyp')
    expect(mp4.length).toBe(manifest.video.bytes)
    expect(sha(manifest.video.src)).toBe(manifest.video.sha256)
    expect(sha(manifest.poster.src)).toBe(manifest.poster.sha256)
    expect(heldImageSize(manifest.poster.src)).toEqual({width:manifest.poster.width,height:manifest.poster.height})
    expect(manifest.poster.width).toBeLessThanOrEqual(manifest.video.width)
    expect(readFileSync(path.join(APP,'public',manifest.poster.src)).toString('ascii',0,4)).toBe('RIFF')
  })
  it('renders once, with the accessible attributes and a visible caption',async()=>{
    const route=salmonRoutes().find(r=>r.routeId===ABOUT_ROUTE_ID)!
    const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:route.targetPath.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
    const tags=html.match(/<video\b[^>]*>/g)??[]
    expect(tags).toHaveLength(1)
    const tag=tags[0]!
    for(const attr of ['controls=""','muted=""','playsInline=""','preload="none"','width="640"','height="480"',`poster="${manifest.poster.src}"`,'aria-label="Installation highlights video"','title="Installation highlights video"'])expect(tag,attr).toContain(attr)
    for(const bad of ['autoPlay','autoplay','loop'])expect(tag,bad).not.toContain(bad)
    expect(html).toContain(`<source src="${manifest.video.src}" type="video/mp4"/>`)
    expect(html).toContain('<figcaption id="dr3-video-title">Installation highlights</figcaption>')
  },120_000)
  it('the content security policy allows it without widening: no media-src, default-src self',()=>{
    const proxy=readFileSync(path.join(APP,'src/proxy.ts'),'utf8')
    expect(proxy).not.toContain('media-src')
    expect(proxy).toContain(`"default-src 'self'"`)
  })
})
