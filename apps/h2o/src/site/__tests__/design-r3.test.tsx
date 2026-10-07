/**
 * Design R3 (CT approval 2026-10-06): the owner's About and Contact designs. Copy from the OGCS reviews (About 1625df21,
 * Contact bdc9a49b); photos are verified ICS originals (A1: no AI-retouched Figma photo; D1 office cards show a project from
 * the office's country with an honest caption); the native inline RFQ form sits in "How to request a quote" (R-a); the mobile
 * action bar is on both pages (R-b); /about-us/ is one recorded batch redirect.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {designR3Ledger} from '../design-r3-media'
import {pageCopy} from '../page-copy'
import {aboutCopy} from '../AboutComposition'

const APP=process.cwd()
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1';process.env.H2O_NATIVE_INTAKE='on'})
afterEach(()=>{process.env={...env}})
const text=(html:string)=>html.replace(/<[^>]+>/g,' ').replace(/&#x27;/g,'\'').replace(/&amp;/g,'&').replace(/\s+/g,' ')
const headings=(html:string,level:number)=>[...html.matchAll(new RegExp(`<h${level}[^>]*>([^]*?)</h${level}>`,'g'))].map(m=>text(m[1]!).trim())
const main=(html:string)=>html.slice(html.indexOf('<main'),html.indexOf('</main>'))
const ABOUT='/about-ics/' // repository mode serves record SALMON-pages-1931 at its source path; Payload serves it at /about-ics-industrial-cooling-solutions/

describe('About: the owner design with the OGCS copy',()=>{
  it('one H1, a H2 per section, a H3 per office card, in the design order',async()=>{
    const html=main(await render(ABOUT))
    expect(headings(html,1)).toEqual(['About ICS'])
    expect(headings(html,2)).toEqual(['Global Presence','Expert Engineering Team','What We Do','Commitment To Quality and Performance'])
    expect(headings(html,3)).toEqual(['Lakewood, Colorado','Bangkok, Thailand','Japan'])
  })
  it('carries the OGCS KEEP/REWORD values and keeps the accepted claims (CS002, CS091)',async()=>{
    const body=text(main(await render(ABOUT)))
    for(const s of ['main office in Lakewood, Colorado, with offices in Japan and Bangkok, Thailand.','ICS has an office in Bangkok, Thailand.','ICS has an office in Japan.',
      'spare parts supply for cooling towers from many manufacturers, supporting reliable performance','spare parts matched to OEM specifications','cooling tower islands',
      'designed to support continuous industrial operation','to support long-term system stability',
      'Shell, Star Energy, Shintech, Shin-Etsu, TTCL, PTT Group, Pertamina, Mitsubishi, and Marubeni'])expect(body,s).toContain(s)
    for(const stale of ['confirmed presence','Confirmed presence','uninterrupted','OEM-compatible','all major cooling tower makes','ensure long-term'])expect(body,stale).not.toContain(stale)
  })
  it('the client strip lists the nine names as text wordmarks until the owner\'s logo files are registered (D5)',async()=>{
    const html=await render(ABOUT)
    const strip=html.slice(html.indexOf('class="dr3-clients"'),html.indexOf('id="global-presence"'))
    expect(strip).toContain('role="region" aria-label="Clients" tabindex="0"')
    expect([...strip.matchAll(/<span class="dr3-wordmark">([^<]+)<\/span>/g)].map(m=>m[1])).toEqual(aboutCopy().clients.items.map(c=>c.name))
    expect(designR3Ledger().clientLogos.status).toBe('PENDING_OWNER_FILES')
  })
  it('the hero quote button and the action bar open the native RFQ; ✆ goes to the Contact offices',async()=>{
    const html=await render(ABOUT)
    expect(html).toMatch(/<span class="dr3-quote-circle"><span class="rfq rfq-signal"[^>]*><a href="\/contact-us\/#request-a-quote"[^>]*data-rfq-native=""[^>]*>Request a Quote<\/a>/)
    expect(html).toMatch(/<div class="dr3-sticky" data-design-r3-sticky=""><a class="dr3-sticky-call" href="\/contact-us\/#offices" aria-label="Call an ICS office">/)
  })
})

describe('Photos: verified ICS originals only (A1, D1–D4)',()=>{
  const ledger=designR3Ledger()
  const slots=Object.entries(ledger.slots)
  it('every slot hash-verifies, is never wider than its original, and records its Figma node and the rejected Figma image',()=>{
    for(const [slot,{media,figma}] of slots){
      const files=[media,...((media as unknown as {srcset?:Array<{src:string;sha256:string;width:number}>}).srcset??[])]
      for(const f of files)expect(createHash('sha256').update(readFileSync(path.join(APP,'public',f.src))).digest('hex'),`${slot} ${f.src}`).toBe(f.sha256)
      for(const f of files)expect(f.width,slot).toBeLessThanOrEqual(media.original.width)
      expect(figma.node,slot).toMatch(/^\d+:\d+$/)
      expect(figma.figmaSha256.length,slot).toBeGreaterThan(0)
      for(const sha of figma.figmaSha256)expect(sha,slot).not.toBe(media.sha256)
    }
  })
  it('the office cards show a project from the office\'s own country, captioned as a project; never the Singapore photo',()=>{
    const mitsui='Mitsui-Jurong-Island-Singapore-2015'
    for(const [slot,{media}] of slots){
      expect(media.original.path,slot).not.toContain(mitsui)
      if(slot.includes('.office.')){expect(media.caption,slot).toMatch(/^ICS project/);expect(media.caption,slot).not.toMatch(/office/i)}
    }
    expect(ledger.slots['about.office.usa']!.media.caption).toBe('ICS project: PVC plant, Freeport, Texas')
    expect(ledger.slots['about.office.thailand']!.media.caption).toBe('ICS project: PTT Cracker, Thailand')
    expect(ledger.slots['about.office.japan']!.media.caption).toBe('ICS project in Japan')
  })
  it('no photo repeats within a page, and each page renders exactly its slots\' files',async()=>{
    for(const [page,prefix] of [[ABOUT,'about.'],['/contact-us/','contact.']] as const){
      const own=slots.filter(([slot])=>slot.startsWith(prefix)).map(([,s])=>s.media.sha256)
      expect(new Set(own).size,page).toBe(own.length)
      const html=main(await render(page))
      for(const sha of own)expect(html,`${page} ${sha}`).toContain(`data-media-sha256="${sha}"`)
    }
  })
})

describe('Contact: the owner design with the native inline form',()=>{
  it('headings, the OGCS copy, no eyebrow and no "Start Here"',async()=>{
    const html=main(await render('/contact-us/'))
    const copy=pageCopy().contact
    expect(headings(html,1)).toEqual(['Contact Us'])
    expect(headings(html,2)).toEqual([copy.heading,copy.requestTitle,copy.officesHeading])
    const body=text(html)
    for(const s of [copy.lead,copy.requestBody,copy.heroLead,copy.requestChip,...copy.send.map(i=>i.text)])expect(body,s).toContain(s)
    expect(body).not.toContain('Start Here')
    expect(body).not.toContain('ICS / Contact')
  })
  it('the native form sits in "How to request a quote" and replaces that column\'s button (R-a)',async()=>{
    const html=await render('/contact-us/')
    const start=html.slice(html.indexOf('id="how-to-request"'),html.indexOf('id="offices"'))
    expect(start).toContain('<section id="request-a-quote"')
    expect(start).not.toContain('data-rfq-native')
    // every other Request a Quote opens the native RFQ: the hero strip, the footer band and the action bar
    expect(html.match(/data-rfq-native=""/g)!.length).toBeGreaterThanOrEqual(3)
    expect(html).toMatch(/<span class="dr3-phone-strip-quote"><span class="rfq rfq-signal"[^>]*><a href="\/contact-us\/#request-a-quote"[^>]*data-rfq-native=""/)
  })
  it('the CTA band does not link to this page; ✆ goes to #offices',async()=>{
    const html=await render('/contact-us/')
    const footer=html.slice(html.indexOf('class="sp-footer-top"'),html.indexOf('class="sp-footer-main"'))
    expect(footer).not.toContain('href="/contact-us/"')
    expect(footer).toContain(`<a class="sp-footer-contact" href="#how-to-request">${pageCopy().contact.formLink}</a>`)
    expect(html).toContain('<a class="dr3-sticky-call" href="#offices" aria-label="Call an ICS office">')
  })
  it('three office cards: published addresses, one Thailand display and tel value, Japan phone only',async()=>{
    const html=main(await render('/contact-us/'))
    expect(html.match(/<address data-office=/g)).toHaveLength(3)
    // exactly as published (OGCS Contact review rows 22 and 30)
    expect(html).toContain('<address data-office="usa"><span>Industrial Cooling Solutions Inc / ICS</span><span>1457 Ammons Street, Suite 206</span><span>Lakewood, CO 80214</span><span>USA</span>')
    expect(html).toContain('<address data-office="thailand"><span>159 Serm-Mit Tower, 9th Floor</span><span>Sukhumvit 21, Asoke Road</span><span>North Klongtoey, Wattana</span><span>Bangkok 10110</span><span>Thailand</span>')
    // CT direct ruling 2026-10-06: title "Japan", bare number, tel:+819042046742 (the national 090 drops its leading 0)
    expect(html).toMatch(/<address data-office="japan"><a class="dr3-phone-pill" href="tel:\+819042046742">\+81-90-4204-6742<span/)
    expect(headings(html.slice(html.indexOf('id="offices"')),3)).toEqual(['USA','Japan','Thailand'])
    expect(text(html)).not.toContain('Contact by phone')
    const full=await render('/contact-us/')
    expect([...new Set(full.match(/\+66[0-9-]*7723/g))].sort()).toEqual(['+662-661-7723','+6626617723'])
    expect(full).not.toContain('260-6598')
  })
})

describe('Redirect, font and stylesheet',()=>{
  it('/about-us/ is one recorded batch redirect to the existing About URL (create 1)',()=>{
    const rows=readFileSync(path.join(APP,'ops/seo-pass/data/redirects.tsv'),'utf8').split('\n').filter(l=>l.startsWith('/about-us/\t'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.split('\t').slice(0,4)).toEqual(['/about-us/','/about-ics-industrial-cooling-solutions/','301','CREATE'])
    const exp=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/expectations.json'),'utf8')) as {expect:{redirects:{create:number}}}
    expect(exp.expect.redirects.create).toBe(1)
    const fresh=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/expectations.fresh-db.json'),'utf8')) as {expect:{redirects:{create:number}}}
    expect(fresh.expect.redirects.create).toBe(390)
  })
  it('Bebas Neue (held, OFL) only for the Commitment display heading; colours are tokens; imported last',()=>{
    const css=readFileSync(path.join(APP,'src/app/(site)/design-r3.css'),'utf8')
    expect(css.match(/font-family: 'Bebas Neue'/g)).toHaveLength(1)
    expect(css).toMatch(/\.dr3-about \.dr3-section h2\.dr3-display \{[^}]*font-family: 'Bebas Neue'/)
    for(const line of css.split('\n').filter(l=>/^\s*(color|background(-color)?|border(-color)?|outline|box-shadow)\s*:/.test(l)))expect(line,line).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
    const imports=[...readFileSync(path.join(APP,'src/app/(site)/layout.tsx'),'utf8').matchAll(/^import '\.\/([^']+\.css)'/gm)].map(m=>m[1])
    expect(imports.slice(-2)).toEqual(['design-r3.css','a11y-fixes.css']) // LEGAL-FIX-1's contrast overrides load after it
  })
})
