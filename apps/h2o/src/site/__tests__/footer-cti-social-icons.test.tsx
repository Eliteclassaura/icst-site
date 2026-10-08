/**
 * Global footer (owner decisions 2026-10-02, Control Tower ruling): the ICS logo keeps the brand slot, the Cooling
 * Technology Institute badge sits below the About ICS text, and the social links are five round inline-SVG icon
 * buttons with accessible names. Columns, links, phone facts and the RFQ band are unchanged.
 */
import {describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {LuxuryFooter} from '../LuxuryShell'
import {clientReviewAuthority} from '../ClientReview'

const CTI='/media/salmon/c0060d855e27dfa01cb59100bba1dd217e2e6796d995aaa0e4ef4fa73d9b006c.png'
const html=renderToStaticMarkup(<LuxuryFooter routePath="/"/>)
const about=html.slice(html.indexOf('<section class="sp-footer-about"'),html.indexOf('</section>',html.indexOf('<section class="sp-footer-about"')))
const socials=about.slice(about.indexOf('<nav class="client-socials"'))

describe('footer CTI badge',()=>{
  it('renders the held CTI logo below the About ICS text, after the unchanged ICS brand logo',()=>{
    const file=readFileSync(path.join(process.cwd(),'public',CTI))
    expect(createHash('sha256').update(file).digest('hex')).toBe(path.basename(CTI,'.png'))
    expect([file.readUInt32BE(16),file.readUInt32BE(20)]).toEqual([952,272])
    expect(about).toContain(`<img src="${CTI}" width="952" height="272" alt="Cooling Technology Institute (CTI)"`)
    const order=['class="sp-footer-logo"','alt="ICS — Industrial Cooling Solutions"','<h3>About ICS</h3>','<p>','class="sp-footer-cti"','class="client-socials"'].map(marker=>about.indexOf(marker))
    expect(order.every(index=>index>=0)).toBe(true)
    expect(order).toEqual([...order].sort((a,b)=>a-b))
  })
})

describe('footer social icon buttons',()=>{
  it('renders LinkedIn, Facebook, Instagram, YouTube and TikTok in order with unchanged URLs and accessible names',()=>{
    const links=[...socials.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([,attrs,inner])=>({label:/aria-label="([^"]+)"/.exec(attrs!)?.[1],href:/href="([^"]+)"/.exec(attrs!)?.[1],attrs:attrs!,inner:inner!}))
    expect(links.map(link=>link.label)).toEqual(['ICS on LinkedIn','ICS on Facebook','ICS on Instagram','ICS on YouTube','ICS on TikTok'])
    const url=(network:string)=>clientReviewAuthority.socials.find(s=>s.network===network)!.url
    expect(links.map(link=>link.href)).toEqual(['LinkedIn','Facebook','Instagram','YouTube','TikTok'].map(url))
    for(const link of links){
      expect(link.attrs).toContain('rel="noopener noreferrer"')
      expect(link.inner).toMatch(/^<span class="client-social-disc" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 \d+ 512" aria-hidden="true" focusable="false"><path d="M[^"]{40,}" fill="currentColor"><\/path><\/svg><\/span>$/)
    }
    expect(socials).not.toMatch(/<img\b|https?:\/\/[^"]*\.(svg|png|woff2?)/)
  })
  it('styles them as 32px Salmon circles inside a 44px tap area with a visible focus ring (Control Tower amendment)',()=>{
    const css=readFileSync(path.join(process.cwd(),'src/app/(site)/salmon-families.css'),'utf8')
    expect(css).toMatch(/\.global-chrome \.sp-footer \.client-socials a \{[^}]*inline-size: 44px;[^}]*block-size: 44px;[^}]*min-inline-size: 44px;[^}]*min-block-size: 44px;/)
    expect(css).toMatch(/\.global-chrome \.sp-footer \.client-social-disc \{[^}]*inline-size: 32px;[^}]*block-size: 32px;[^}]*border: 1px solid var\(--sp-social-ring\);[^}]*border-radius: 50%;/)
    expect(css).toMatch(/\.global-chrome \.sp-footer \.client-socials a:focus-visible \{\n {2}outline: 2px solid var\(--sp-blue\);/)
    expect(css).toMatch(/\.global-chrome \.sp-footer-cti img \{[^}]*block-size: 36px;/)
  })
})

describe('footer facts unchanged',()=>{
  it('keeps the owner phone facts, the four columns and the RFQ band',()=>{
    for(const fact of ['+1-303-462-2000','+81-90-4204-6742','+662-661-7723'])expect(html).toContain(fact)
    expect(html).not.toContain('+66-2-260-6598')
    const main=html.slice(html.indexOf('<div class="sp-footer-main">'),html.indexOf('<div class="sp-footer-legal">'))
    expect([...main.matchAll(/<(?:section|nav) class="(sp-footer-[a-z -]+)"/g)].map(([,cls])=>cls)).toEqual(['sp-footer-about','sp-footer-list','sp-footer-list sp-footer-category','sp-footer-phone','sp-footer-locations'])
    expect(html).toContain('class="sp-footer-top"')
    expect(html).toContain('href="/contact-us/"')
  })
})

describe('Thailand phone display (Design R3, CT ruling 5; supersedes Design Fixes R1 A7)',()=>{
  it('shows the owner authority display +662-661-7723 everywhere, with the tel: link unchanged',async()=>{
    const {contactOffices,TELEPHONE_DISPLAY}=await import('../contact')
    const thailand=contactOffices.find(office=>office.officeKey==='thailand')!
    expect(thailand).toMatchObject({telephoneDisplay:'+662-661-7723',telephoneHref:'tel:+6626617723'})
    expect(TELEPHONE_DISPLAY).toEqual({})
    expect(readFileSync('content/2d-launch-cohort/OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21.json','utf8')).toContain('"telephoneDisplay": "+662-661-7723"')
    const {ownerText}=await import('../salmon')
    expect(ownerText('Call +662-661-7723 or +66-2-260-6598')).toBe('Call +662-661-7723 or +662-661-7723')
  })
})
