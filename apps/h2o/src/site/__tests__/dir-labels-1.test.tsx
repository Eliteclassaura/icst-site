/**
 * DIR-LABELS-1 (OGCS rulings 2026-10-08, CT): the /resources/ directory shows Title Case labels for the two all-caps live pages,
 * and no longer lists the Brochures and Tools library pages (they stay, with their pathway cards at the top of /resources/).
 * No <title> changes: the Thailand title carries 53 GSC clicks.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {R2Discovery} from '../R2Discovery'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const tsv=(f:string)=>{const [h,...l]=readFileSync(path.join(APP,'ops/seo-pass/data',f),'utf8').trimEnd().split('\n');const c=h!.split('\t');return l.map(x=>Object.fromEntries(x.split('\t').map((v,i)=>[c[i],v])))}

describe('DIR-LABELS-1',()=>{
  it('the two live pages get Title Case record titles (via=title: directory label and H1), at the source',()=>{
    const rows=tsv('h1-fields.tsv')
    const dry=rows.find(r=>r.path==='/dry-soda-blast-cleaning-services-2/')!
    expect([dry.via,dry.action,dry.h1,dry.h1_now]).toEqual(['title','UPDATE','Dry Soda Blast Cleaning Services','DRY SODA BLAST CLEANING SERVICES'])
    expect(rows.some(r=>r.path==='/thailand-cooling-tower/'),'withdrawn by the OGCS country-page ruling (301 to /cooling-tower-thailand/): no H1 row').toBe(false)
  })
  it('no <title> (seo-fields) row is added or changed for either page',()=>{
    const seo=tsv('seo-fields.tsv')
    expect(seo.some(r=>r.path==='/thailand-cooling-tower/'),'withdrawn (301): no <title> row').toBe(false)
    expect(seo.find(r=>r.path==='/dry-soda-blast-cleaning-services-2/')!.title).toBe('Dry soda blast cleaning services')
    expect(seo.filter(r=>r.path==='/dry-soda-blast-cleaning-services-2/')).toHaveLength(1)
  })
  it('the directory no longer lists the Brochures and Tools pages (nor Thank you or the Dyna-Fab 10′ page); other entries stay',()=>{
    const html=renderToStaticMarkup(<R2Discovery kind="pages"/>)
    for(const gone of ['/resources/cooling-tower-brochures/','/resources/tools/','/thank-you/','/dyna-fab-10-height-fan-stack/'])expect(html,gone).not.toContain(`href="${gone}"`)
    expect(html,'the Thailand page is a 301 now (OGCS country-page ruling): not a directory entry').not.toContain('/thailand-cooling-tower/')
    expect(html).toContain('/dry-soda-blast-cleaning-services-2/')
  })
  it('/resources/ keeps both pathway cards (Brochures and Tools) at the top',async()=>{
    const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:['resources']}),searchParams:Promise.resolve({})}))
    expect(html).toContain('href="/resources/cooling-tower-brochures/" class="dr4-pathway"') // REDIRECTS-2: the ranking URLs
    expect(html).toContain('href="/resources/tools/" class="dr4-pathway"')
  },120_000)
})
