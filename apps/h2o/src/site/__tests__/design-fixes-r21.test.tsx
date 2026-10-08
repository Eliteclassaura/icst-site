/**
 * Design Fixes R2.1 (Control Tower rulings 2026-10-05): template review fixes (a)–(d), the OGCS pre-launch copy that is
 * template data (§2 contact, §4 hero actions, §5 caption), the C2/C6 crops and C1/C3 withholding, the contact photo crop,
 * the About wording (CS002), and the text-override registry with its four guardrails.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {applyTextOverrides,textOverrides,withTextOverrides} from '../../content/text-overrides'
import {extractSlots,type ContentSlot} from '../../content/content-slots'
import {storedDocument} from '../../../ops/seo-pass/scan-slots'
import {contactOffices} from '../contact'
import {heroActionFor} from '../hero-actions'
import {pageCopy} from '../page-copy'
import {salmonRoutes,liveRoutes,salmonDocument} from '../salmon'
import {AuthorityEditorial} from '../AuthorityEditorial'

const APP=process.cwd()
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1';delete process.env.H2O_TYPEFORM_FORM_ID;delete process.env.H2O_TYPEFORM_ORIGIN})
afterEach(()=>{process.env={...env};vi.restoreAllMocks()})
const css=readFileSync(path.join(APP,'src/app/(site)/design-fixes.css'),'utf8')
const r21=css.slice(css.indexOf('Design Fixes R2.1'))
const routes=[...salmonRoutes(),...liveRoutes()]
const imported=(routeId:string)=>{const r=routes.find(x=>x.routeId===routeId)!;return JSON.parse(readFileSync(path.join(APP,'content/salmon',r.file),'utf8')) as Record<string,unknown>&{routeId:string}}

describe('text-override registry (guardrails 1–4)',()=>{
  const entries=textOverrides()
  it('1. every entry matches its imported document exactly `count` times in its scope, applies, and is idempotent',()=>{
    expect(entries.map(o=>o.id)).toEqual(['TO-001','TO-002','TO-003','TO-004','TO-005','TO-006','TO-007','TO-008','TO-009','TO-010','TO-011','TO-012','TO-013','TO-014'])
    for(const routeId of new Set(entries.map(o=>o.routeId))){
      const doc=imported(routeId)
      const once=applyTextOverrides(doc)
      expect(once.problems,routeId).toEqual([])
      for(const o of entries.filter(e=>e.routeId===routeId)){
        const scope=(d:Record<string,unknown>)=>JSON.stringify(o.scope==='schema'?(d.seo as {schema?:unknown}).schema:d.children)
        const n=(hay:string,s:string)=>hay.split(JSON.stringify(s).slice(1,-1)).length-1
        expect(n(scope(doc),o.find),o.id).toBe(o.count??1)
        expect(n(scope(once.doc),o.find),o.id).toBe(0)
        expect(n(scope(once.doc),o.replace),o.id).toBeGreaterThanOrEqual(o.count??1)
      }
      const twice=applyTextOverrides(once.doc)
      expect(twice.problems,routeId).toEqual([])
      expect(JSON.stringify(twice.doc)).toBe(JSON.stringify(once.doc))
    }
  })
  it('1. a source that no longer matches exactly is not applied, never fuzzily: tests see the problem, the runtime warns with the id',()=>{
    const o=entries.find(e=>e.id==='TO-006')!
    const doc=imported(o.routeId)
    const edit=(to:string)=>({...doc,children:JSON.parse(JSON.stringify(doc.children).split(o.find).join(to)) as unknown})
    const drifted=edit(o.find.replace('minimum','min.'))
    const {doc:out,problems}=applyTextOverrides(drifted)
    expect(problems.join('\n')).toMatch(/^TO-006 \(C4\) \/all-projects\/pttcsp\/: .* found 0× in body, expected 1×$/m)
    expect(JSON.stringify(out.children)).not.toContain(o.replace)
    const doubled=edit(`${o.find} ${o.find}`)
    expect(applyTextOverrides(doubled).problems.join('\n')).toContain('found 2× in body, expected 1×')
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
    withTextOverrides(drifted)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[text-override\] TO-006 /))
  })
  it('2. a body entry holds only text no editor-editable element can hold',()=>{
    // R5b (CT ruling pending): a removal of a heading or card cannot be a claim edit (the editor validator rejects an empty heading), so
    // those entries are flagged `unsaveable`; every other body entry still holds only text no editor can hold.
    for(const o of entries.filter(e=>e.scope==='body'&&!e.unsaveable)){
      const r=routes.find(x=>x.routeId===o.routeId)!
      const slots=extractSlots(storedDocument({path:r.targetPath,routeId:o.routeId,sourceFile:r.file} as never),{productIds:new Map()}) as ContentSlot[]
      expect(JSON.stringify(slots.filter(s=>s.kind==='text'||s.kind==='heading')),o.id).not.toContain(JSON.stringify(o.find).slice(1,-1))
    }
  })
  it('3. reviewable: every entry carries row, route, before/after and reason, and the editor README lists it; 4. the backlog item is recorded',()=>{
    const readme=readFileSync(path.join(APP,'content/design/TEXT_OVERRIDES.md'),'utf8')
    for(const o of entries){
      for(const k of ['id','row','routeId','path','scope','find','replace','reason'] as const)expect(String(o[k]??'').length,`${o.id} ${k}`).toBeGreaterThan(0)
      expect(readme).toContain(`| ${o.id} | ${o.path} |`)
    }
    expect(readme).toMatch(/\*\*Backlog \(post-launch\):\*\* migrate each entry into real, editable data/)
  })
  it('the corrected strings reach the rendered page (C4 highlights)',async()=>{
    const html=await render('/all-projects/pttcsp/')
    expect(html).toContain('96-bay ACHE system upgraded against a minimum 15% airflow-improvement target')
    expect(html).toContain('Fan system re-engineered to meet the plant&#x27;s thermal and static pressure requirements')
    expect(html).not.toContain('performance guarantees were successfully achieved')
  })
})

describe('OGCS §4 hero actions (data)',()=>{
  const usa=contactOffices.find(o=>o.officeKey==='usa')!
  it('/emergency-cooling-tower-repair/: “Request a Quote”, then “Call an ICS office” to the owner-authority USA telephone',async()=>{
    expect(heroActionFor('/emergency-cooling-tower-repair/')?.secondary).toEqual({label:'Call an ICS office',office:'usa'})
    const html=await render('/emergency-cooling-tower-repair/')
    expect(html).toContain(`<a href="${usa.telephoneHref}" data-hero-action="secondary">Call an ICS office</a>`)
  })
  it('every other hero’s secondary “Explore the service” lands on an anchor the page carries',async()=>{
    for(const route of ['/crossflow-cooling-tower-repair-maintenance/','/cooling-tower-replacement/','/cooling-tower/']){
      const action=heroActionFor(route)!
      expect(action.secondary?.label,route).toBe('Explore the service')
      const html=await render(route)
      const href=(action.secondary as {href:string}).href
      expect(html,route).toContain(`href="${href}" data-hero-action="secondary">Explore the service</a>`)
      expect(html.match(new RegExp(`id="${href.slice(1)}"`,'g')),route).toHaveLength(1)
    }
  })
})

describe('OGCS §2 contact and §5 caption (data)',()=>{
  it('/contact-us/: no eyebrow, the OGCS heading and lead, office titles, the phone-only prefix',async()=>{
    const copy=pageCopy().contact
    expect(copy.eyebrow).toBeNull()
    const html=await render('/contact-us/')
    expect(html).not.toContain('Start Here')
    expect(html).toContain(copy.heading)
    expect(html).toContain(copy.lead.replace(/'/g,'&#x27;'))
    // Design R3 (OGCS Contact review bdc9a49b rows 20/24/28): USA, Japan office, Thailand
    for(const title of Object.values(copy.officeTitles))expect(html).toContain(`<h3>${title}</h3>`)
    expect(Object.values(copy.officeTitles)).toEqual(['USA','Japan','Thailand']) // CT direct ruling 2026-10-06: Japan as the others
  })
  it('the crossflow-template evidence caption is removed (null renders no element)',async()=>{
    expect(pageCopy().englishServices.evidenceCaption).toBeNull()
    const html=await render('/crossflow-cooling-tower-repair-maintenance/')
    const figure=html.slice(html.indexOf('alt="Industrial cooling equipment or inspection setting"'))
    expect(figure.slice(0,figure.indexOf('</figure>'))).not.toContain('<figcaption>')
  })
  it('CS002: About reads “with offices in Japan and Bangkok, Thailand” (code-held About correction)',()=>{
    // the About page's editorial template (rendered as in final-polish.test.tsx)
    const html=renderToStaticMarkup(<AuthorityEditorial doc={salmonDocument(salmonRoutes().find(r=>r.routeId==='SALMON-pages-1931')!)}/>)
    expect(html).toContain('main office in Lakewood, Colorado, with offices in Japan and Bangkok, Thailand.')
    expect(html).not.toContain('with confirmed presence in Japan and Bangkok')
  })
})

describe('C1–C6 claim tiles (media overrides)',()=>{
  type O={claim:string;action:'crop'|'withhold';file?:string;sha256?:string;width?:number;height?:number}
  const overrides=(JSON.parse(readFileSync(path.join(APP,'content/design/media-overrides.json'),'utf8')) as {overrides:Record<string,O>}).overrides
  const jpegSize=(b:Buffer)=>{for(let i=2;i<b.length;){const len=b.readUInt16BE(i+2);if(b[i+1]!>=0xc0&&b[i+1]!<=0xc3)return [b.readUInt16BE(i+7),b.readUInt16BE(i+5)];i+=2+len}return []}
  it('C2 and C6 are recorded crops whose served bytes match their hash and size; C1 and C3 are withheld (CT: solid-token hero)',()=>{
    expect(Object.entries(overrides).map(([k,o])=>[k.slice(0,8),o.claim,o.action])).toEqual([['4d62aa2e','C2','crop'],['854ee791','C2','crop'],['190d478e','C6','crop'],['77b1ce77','C6','crop'],['28256266','C1','withhold'],['0304231a','C1','withhold'],['d0aa296a','C3','withhold'],['e1ce496a','C3','withhold']])
    for(const o of Object.values(overrides).filter(x=>x.action==='crop')){
      const file=path.join(APP,'public/media/salmon',path.basename(o.file!))
      expect(existsSync(file),o.file).toBe(true)
      const bytes=readFileSync(file)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(o.sha256)
      expect(jpegSize(bytes)).toEqual([o.width,o.height])
    }
  })
  it('the pages, their cards, social image tags and structured data show the crop, and nothing where a tile is withheld',async()=>{
    for(const [p,stem,crop] of [['/cooling-tower-structure-repair/','image-18-1','dd73aa252e21b19ff9e85ce5ea072e6aa983b3b0beb3766a9772d90ac179dbfe'],['/cooling-tower-efficiency-calculation/','image-51-2','a8a1a4e647c20aaa5692a1ae77911a5f7582fb1ddbcdea65f5f92b0d57efdfbd']] as const){
      const html=await render(p)
      expect(html,p).toContain(crop)
      expect(html,p).toContain(`<meta property="og:image" content="https://h2ocooling.com/media/salmon/${crop}.jpeg"/>`)
      // provenance attributes (data-source-src) keep the imported URL by design; nothing served or published names it
      expect(html.replace(/ data-source-src="[^"]*"/g,''),p).not.toContain(`/2026/07/${stem}`)
    }
    for(const [p,held,stem] of [['/cooling-tower-components/','28256266','image-9-2'],['/energy-efficient-cooling-tower/','d0aa296a','image-79-1']] as const){
      const html=await render(p)
      expect(html,p).not.toContain(held)
      expect(html.replace(/ data-source-src="[^"]*"/g,''),p).not.toContain(`/2026/07/${stem}`)
      // R2.4 (item b): the page's social image is the site default (a verified ICS crew photo), never the withheld tile
      expect(html,p).not.toMatch(/primaryImageOfPage/)
      expect([...html.matchAll(/<meta (?:property|name)="(?:og|twitter):image" content="([^"]+)"/g)].map(m=>m[1]!.replace(/^https:\/\/[^/]+/,'')),p).toEqual(['/media/og/bee5a42c610b7342dd3932000552046c26391f4028cea170e9a85536d7bb2812.jpg','/media/og/bee5a42c610b7342dd3932000552046c26391f4028cea170e9a85536d7bb2812.jpg'])
      expect(html,p).not.toContain('THE $100,000 BLUEPRINT')
    }
    // the blog archive cards that carry the tiles
    for(const [p,stem] of [['/category/blog/page/13/','image-79-1'],['/category/blog/page/15/','image-9-2']] as const)expect((await render(p)).replace(/ data-source-src="[^"]*"/g,''),p).not.toContain(`/2026/07/${stem}`)
  })
})

describe('template review (a)–(d) and the contact photo',()=>{
  it('(a) the parts fallback quote button keeps the outline label at rest',()=>{
    expect(r21).toContain('.salmon-family .sp-btn-row--outline a.lux-button:not(:hover, :focus-visible) {\n  color: var(--sp-blue) !important;')
  })
  it('(b)/(c) below 768px: the home hero is one column at readable sizes; /cooling-tower/ stacks with 16px body text',()=>{
    const phone=r21.slice(r21.indexOf('@media (width < 768px)'),r21.indexOf('/* (d)'))
    expect(phone).toMatch(/elementor-element-e9c982d \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important;/)
    expect(phone).toMatch(/elementor-element-be98584 \.elementor-heading-title \{\s*font-size: 40px !important;/)
    expect(phone).toMatch(/:is\(\.elementor-element-b7b52e6, \.elementor-element-7d4ed82\) :is\(p, p span\) \{\s*font-size: 16px !important;/)
    expect(phone).toMatch(/elementor-element-4fd309cb \{\s*flex-direction: column !important;/)
    expect(phone).toMatch(/elementor-element-3589ea58 :is\(p, p span\) \{\s*font-size: 16px !important;/)
  })
  it('(d) the locale table of contents is a block “Contents” box; its dead toggle is hidden',()=>{
    expect(r21).toMatch(/#ez-toc-container \{\s*display: block;/)
    expect(r21).toContain('#ez-toc-container > div:first-child > :is(span, a) {\n  display: none;')
  })
  it('contact photo: the panel shows source rows 350–1790 (date stamp at 1825–1885 excluded) on desktop and phone',()=>{
    expect(css).toMatch(/inset-block: -24\.31% auto;\s*inset-inline: 50% 0;\s*inline-size: 50%;\s*block-size: 162\.36%;/)
    expect((2338/1440).toFixed(4)).toBe('1.6236')
    expect(((2338-1790)/1440).toFixed(4)).toBe('0.3806')
    expect(css).toContain('clip-path: inset(calc(var(--df-contact-photo) * 0.2431) 0 calc(var(--df-contact-photo) * 0.3806) 0);')
  })
})
