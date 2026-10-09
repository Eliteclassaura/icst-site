/**
 * PROJECT-IMAGES-1 R2 (CT 2026-10-09; OGCS ruling on the PTT duplicates): /all-projects/ptt-csp3/ and /all-projects/pttcsp/ are kept;
 * the two historical /rt-portfolios/ pages become one-hop 301s to them (ledger REDIRECT, not exported, not in the sitemap).
 * The GSP3 keeper shows its verified native-size photo; the GSP6 keeper carries the historical page's photo gallery with its captions
 * (its first photo is the keeper's clean hero crop, not repeated: design-r4 "no photo repeats within a page").
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {projectMediaRegistry} from '../project-media'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean;redirect?:string}>}
const tsv=(f:string)=>readFileSync(path.join(APP,'ops/seo-pass/data',f),'utf8').split('\n').map(l=>l.split('\t'))
const PAIRS:Array<[string,string]>=[['/rt-portfolios/ptt-gsp3-fan-upgrade/','/all-projects/ptt-csp3/'],['/rt-portfolios/ptt-gsp6-96-fan-ache-performance-upgrade/','/all-projects/pttcsp/']]
const imgsOf=(html:string)=>[...html.matchAll(/<img\b[^>]*>/g)].map(m=>m[0])
const srcOf=(img:string)=>/\ssrc="([^"]*)"/.exec(img)?.[1]??''

describe('PROJECT-IMAGES-1 R2: the historical portfolio pages redirect to the curated project pages',()=>{
  it('the ledger holds both as REDIRECT routes (not exported, not indexable, not in the sitemap) with the keeper as target',()=>{
    for(const [from,to] of PAIRS){
      const r=ledger.routes.find(x=>x.path===from)!
      expect([r.state,r.export,r.indexable,r.sitemap,r.redirect],from).toEqual(['REDIRECT',false,false,false,to])
      expect(ledger.routes.find(x=>x.path===to)?.state,to).toBe('PUBLIC')
    }
  })
  it('the batch data carries the withdrawal and the one-hop 301 for each (release authority, dispositions, redirects, conformance)',()=>{
    const auth=JSON.parse(readFileSync(path.join(APP,'content/release/seo-pass-r1.json'),'utf8')) as {redirectSources:Record<string,string>}
    for(const [from,to] of PAIRS){
      expect(auth.redirectSources[from],from).toBe(to)
      expect(tsv('route-dispositions.tsv').find(c=>c[0]===from)?.slice(2,4),from).toEqual(['WITHDRAW_TO_REDIRECT',to])
      expect(tsv('redirects.tsv').find(c=>c[0]===from)?.slice(1,4),from).toEqual([to,'301','CREATE'])
      expect(tsv('conformance.tsv').find(c=>c[0]===from)?.slice(1,3),from).toEqual(['301',to])
      expect(tsv('seo-fields.tsv').some(c=>c[0]===from),`${from}: no meta row for a redirected route`).toBe(false)
    }
  })
  it('the project directory no longer lists them as "Additional historical project records"',async()=>{
    const html=await render('/all-projects/')
    expect(html).not.toContain('ptt-gsp3-fan-upgrade')
    expect(html).not.toContain('ptt-gsp6-96-fan-ache')
  })
})

describe('PROJECT-IMAGES-1 R2: the keepers',()=>{
  it('/all-projects/ptt-csp3/ shows the verified GSP3 photo once, at its native 343x257 with the factual alt',async()=>{
    const reg=projectMediaRegistry().projects['/all-projects/ptt-csp3/']!.media
    expect([reg.width,reg.height]).toEqual([343,257])
    const html=await render('/all-projects/ptt-csp3/')
    const mine=imgsOf(html).filter(i=>srcOf(i)===reg.src)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toContain(`width="${reg.width}"`)
    expect(mine[0]).toContain(`height="${reg.height}"`)
    expect(mine[0]).toContain(`alt="${reg.alt}"`)
    expect(reg.alt).toMatch(/PTT Gas Separation Plant, Thailand/)
  })
  it('/all-projects/pttcsp/ keeps its clean hero crop and carries four of the remaining five gallery photos with their captions (the one with a third-party name on a uniform is withheld); no photo repeats',async()=>{
    const reg=projectMediaRegistry().projects['/all-projects/pttcsp/']!.media
    const html=await render('/all-projects/pttcsp/')
    const imgs=imgsOf(html)
    expect(imgs.filter(i=>srcOf(i)===reg.src)).toHaveLength(1)
    const gallery=/<section class="sp-section-inner project-gallery"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1]??''
    const figs=[...gallery.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map(m=>m[0])
    expect(figs).toHaveLength(4)
    const captions=figs.map(f=>/<figcaption[^>]*>([^<]*)<\/figcaption>/.exec(f)?.[1])
    expect(captions).toEqual(['Sunrise over the plant &amp; ICS ICST are ready','A view from the top','Standing by with materials at the ready','Final installation steps'])
    const gsrc=figs.map(f=>srcOf(imgsOf(f)[0]!))
    expect(new Set(gsrc).size).toBe(4)
    expect(html).not.toContain('Inspection time')
    expect(gsrc).not.toContain(reg.src)
    const all=imgs.map(srcOf).filter(s=>/\/media\/(derivatives|salmon|projects)\//.test(s)&&!/\.png$/.test(s))
    expect(new Set(all).size,'no photo repeats within the page').toBe(all.length)
    expect(html).not.toContain('GSP-6-Fan-Upgrade-scaled') // the date-stamped original is not shown
    expect(html).toContain('Project Description:')
  })
  it('other project pages have no gallery section',async()=>{
    expect(await render('/all-projects/ptt-csp3/')).not.toContain('project-gallery')
  })
})
