/**
 * QUICK-WINS-1 (CT 2026-10-08): LaTeX that leaked into article text renders as plain HTML, and WPBakery shortcodes are
 * removed from visible text. Dollar amounts are never mistaken for math.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {releaseRoutes} from '../salmon'
import {isEmptyTextBlock} from '../SalmonCanonical'
import {inlineMath,mathNodes,shortcodeNodes,stripShortcodes} from '../math-text'
import {ClientTestimonials,initialsOf} from '../ClientReview'
import {FOOTER_LOCATIONS,LuxuryFooter,footerContactLabel,footerText} from '../LuxuryShell'

const APP=process.cwd()
const env={...process.env}
afterEach(()=>{process.env={...env}})
const html=(text:string)=>{const nodes=mathNodes(text,'t');return nodes?renderToStaticMarkup(<>{nodes}</>):null}
const plain=(h:string)=>h.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))

describe('formulas',()=>{
  it('the makeup-water forms (dollar-delimited, backslashes lost in the source)',()=>{
    expect(plain(html('then $Delta T$ rises')!)).toBe('then Δ T rises')
    expect(plain(html('to $10^circtext{F}$.')!)).toBe('to 10°F.')
    expect(plain(html('$1,200 times 10 times 0.00085 = 10.2$')!)).toBe('1,200 × 10 × 0.00085 = 10.2')
    expect(plain(html('$10.2 / (3 – 1) = 5.1$')!)).toBe('10.2 / (3 – 1) = 5.1')
    expect(plain(html('where $R$ is the rate and $F$ the factor')!)).toBe('where R is the rate and F the factor')
  })
  it('a display formula becomes a block with a stacked fraction, with no TeX left',()=>{
    const out=html('$$GPM = frac{Heat Load (BTU/hr)}{500 times Range (°F)}$$')!
    expect(out).toContain('math math--display')
    expect(out).toContain('<span class="math-num">Heat Load (BTU/hr)</span>')
    expect(out).toContain('<span class="math-den">500 × Range (°F)</span>')
    expect(out).not.toMatch(/\$|frac\{|\btimes\b/)
  })
  it('real LaTeX without delimiters (variable-frequency drive, performance curve, louvers, efficiency guide)',()=>{
    const vfd=html('The formula: P_2 = P_1 \\times \\left(\\frac{N_2}{N_1}\\right)^3 This means')!
    expect(vfd).toContain('<sub>2</sub>')
    expect(vfd).toContain('<sub>1</sub>')
    expect(vfd).toContain('<sup>3</sup>')
    expect(vfd).toContain('×')
    expect(vfd).not.toMatch(/\\|frac\{|\\left/)
    expect(plain(html('A 5^\\circ\\text{F} approach serves')!)).toBe('A 5°F approach serves')
    expect(plain(html('Airflow Velocity $\\pm 10%$ of Design')!)).toBe('Airflow Velocity ± 10% of Design')
    const eff=html('formula: \\text{Cooling tower efficiency} = \\frac{\\text{CW return temperature} – \\text{CW supply}}{\\text{CW return temperature}} \\times 100\\%')!
    expect(eff).toContain('math-frac')
    expect(eff).not.toMatch(/\\|\{|\}/)
    expect(plain(eff)).toContain('× 100%')
  })
  it('stripped-backslash forms without dollar signs (the makeup-water table cells and its blowdown formula)',()=>{
    expect(plain(html('10^circtext{F}')!)).toBe('10°F')
    expect(plain(html('a tower evaporates 1 percent for every 10^circtext{F} of cooling.')!)).toBe('a tower evaporates 1 percent for every 10°F of cooling.')
    const blowdown=html('B = frac{E}{(text{CoC} – 1)}')!
    expect(blowdown).toContain('math-frac')
    expect(plain(blowdown)).toContain('(CoC – 1)')
    expect(blowdown).not.toMatch(/frac\{|text\{/)
    // ordinary words are never read as commands in undelimited text
    expect(mathNodes('Read the left text right times and then the frac of it.','t')).toBeNull()
    expect(plain(html('text{x} and the text of left times')!)).toBe('x and the text of left times')
  })
  it('prices and ordinary dollar signs are left exactly as written',()=>{
    for(const text of ['It costs $5 and $10 per hour.','from $65,000 for a small commercial unit to more than $100,000','Save $1,200 on a $6,000 job','a $5-$10 range','Total: $ 5 and 6 $'])expect(html(text),text).toBeNull()
    expect(inlineMath('65,000 for a small commercial unit to more than ')).toBe(false)
    expect(inlineMath('5 and ')).toBe(false)
    expect(inlineMath('R')).toBe(true)
  })
  it('text without math is not touched (no allocation, no wrapper)',()=>{
    expect(mathNodes('Plain sentence with a_b and 5^2 only.','t')).toBeNull()
  })
})

describe('shortcodes',()=>{
  it('accordion, tab and toggle titles survive as level-3 headings; entities decoded; empty titles skipped; caption keeps its inner text',()=>{
    const out=renderToStaticMarkup(<>{shortcodeNodes('Intro. [vc_tta_accordion][vc_tta_section title=”ICS – Geothermal Parts &amp; Resources” tab_id=”a1”] Body one. [/vc_tta_section][vc_tab title="Specs"]Body two[/vc_tab][vc_toggle title=""]Body three[/vc_toggle][caption id="a"]Photo[/caption][/vc_tta_accordion]','s')}</>)
    expect(out).toContain('<span class="shortcode-title" role="heading" aria-level="3">ICS – Geothermal Parts &amp; Resources</span>')
    expect(out).toContain('<span class="shortcode-title" role="heading" aria-level="3">Specs</span>')
    expect(out.match(/shortcode-title/g)).toHaveLength(2)
    expect(plain(out)).toMatch(/Intro\.\s+ICS – Geothermal Parts &amp; Resources\s+Body one\./)
    expect(plain(out)).toContain('Body three')
    expect(plain(out)).toContain('Photo')
    expect(out).not.toMatch(/\[\/?[a-z_]+|tab_id/)
    expect(shortcodeNodes('A [1] reference','s')).toBeNull()
  })
  it('WPBakery and WordPress shortcodes disappear, their inner text stays',()=>{
    const out=stripShortcodes('Learn more about safety. [/vc_column_text][/vc_column][/vc_row][vc_row][vc_column][vc_tta_accordion] Next [caption id="a" align="x"]photo[/caption]')
    expect(out).not.toMatch(/\[\/?(?:vc_|caption)/)
    expect(out).toContain('Learn more about safety.')
    expect(out).toContain('Next')
    expect(out).toContain('photo')
    expect(stripShortcodes('Index [1] and [note]')).toBe('Index [1] and [note]')
  })
})

describe('published pages',()=>{
  it('the four articles that carried LaTeX and the makeup-water article render it as HTML',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const target of ['/cooling-tower-makeup-water-calculation/','/cooling-tower-variable-frequency-drive/','/cooling-tower-louvers/','/cooling-tower-performance-curve/','/guide-about-cooling-tower/','/cooling-tower-pump-sizing/']){
      const main=await render(target)
      const body=main.slice(main.indexOf('<main'),main.indexOf('</main>'))
      expect(body,target).not.toMatch(/\\(?:times|frac|text|circ|left|right|pm|cdot)\b|\\%|\$\$|frac\{|circtext|\$Delta|\$R\$|\$F\$/)
      expect(body,target).toContain('class="math')
    }
  },240000)
  it('the WPBakery pages show no shortcode brackets',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const target of ['/resources/cooling-tower-brochures/','/resources/tools/','/dyna-fab-10-height-fan-stack/','/cooling-tower-construction-repair-in-singapore/contact-us/']){
      const main=await render(target)
      expect(main.slice(main.indexOf('<main'),main.indexOf('</main>')),target).not.toMatch(/\[\/?vc_/)
    }
  },240000)
  it('the footer Locations links take the footer link blue, not the legacy pink',()=>{
    const css=readFileSync(path.join(APP,'src/app/(site)/design-r5.css'),'utf8')
    expect(css).toMatch(/\.global-chrome \.sp-footer-locations a \{[^}]*color: var\(--sp-blue\);/)
  })
  it('the math styles use tokens and logical properties only',()=>{
    const css=readFileSync(path.join(APP,'src/app/(site)/design-r5.css'),'utf8')
    expect(css).toMatch(/\.math-frac \{[^}]*display: inline-flex;/)
    expect(css).toMatch(/\.math-num \{\s*border-block-end: 1px solid currentcolor;/)
  })
})

describe('owner team sheet (CT 2026-10-08)',()=>{
  it('1: the testimonials are real (owner, CT 2026-10-08) and stay; the reviewers show initials, never stock headshots',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const block=renderToStaticMarkup(<ClientTestimonials/>)
    for(const name of ['Sarah Mitchell','Daniel White','Sophia Martinez'])expect(block).toContain(name)
    expect(block).toContain('AutoParts Ltd')
    expect(block).not.toMatch(/figma-testimonials\/[0-9a-f]{16}-/)
    expect(block).not.toMatch(/<img[^>]*alt="(?:Sarah Mitchell|Daniel White|Sophia Martinez)"/)
    expect([...block.matchAll(/class="client-testimonial-avatar"[^>]*>([A-Z]{2})</g)].map(m=>m[1])).toEqual(['SM','DW','SM'])
    expect(initialsOf('Daniel White')).toBe('DW')
    expect(initialsOf('Prince')).toBe('P')
    // the home itself still carries the section
    const home=await render('/')
    expect(home.slice(home.indexOf('<main'),home.indexOf('</main>'))).toContain('Sarah Mitchell')
  },240000)
  it('2: the home project cards carry no WordPress post date',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const home=await render('/')
    const main=home.slice(home.indexOf('<main'),home.indexOf('</main>'))
    expect(main).not.toMatch(/(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d/)
    expect(main).toContain('View more')
  },240000)
  it('3: footer text, title-case Contact Us, the five country pages and the Thailand phone exactly as the owner rule',()=>{
    expect(footerText('ICS specializes in\nindustrial   cooling\r\n solutions.')).toBe('ICS specializes in industrial cooling solutions.')
    expect(footerContactLabel('Contact us')).toBe('Contact Us')
    expect(footerContactLabel('Get in touch')).toBe('Get in touch')
    expect(FOOTER_LOCATIONS.map(l=>l.href)).toEqual(['/cooling-tower-construction-repair-in-united-states/','/cooling-tower-thailand/','/cooling-tower-japan/','/cooling-tower-malaysia/','/cooling-tower-construction-repair-in-singapore/'])
    // each target is a real public route of the release (the footer's public-route filter would otherwise drop it silently)
    const routes=new Set(releaseRoutes().map(r=>r.targetPath))
    for(const l of FOOTER_LOCATIONS)expect(routes.has(l.href),l.href).toBe(true)
    const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;state:string}>}
    for(const l of FOOTER_LOCATIONS)expect(ledger.routes.find(r=>r.path===l.href)?.state,l.href).toBe('PUBLIC')
    const footer=renderToStaticMarkup(<LuxuryFooter/>)
    expect(footer).toContain('aria-label="Locations"')
    for(const l of FOOTER_LOCATIONS)expect(footer).toContain(`<a href="${l.href}">${l.label}</a>`)
    expect(footer).toContain('>Contact Us</a>')
    expect(footer).not.toContain('>Contact us</a>')
    expect(footer).toContain('+662-661-7723')
    expect(footer).not.toMatch(/260-6598|\+66-2-/)
    expect(footer).not.toMatch(/<br\b/)
  })
})

describe('empty source blocks',()=>{
  const node=(tag:string,children:Array<string|{tag:string;attrs:Record<string,string>;children:never[]}>)=>({tag,attrs:{},children})
  it('an empty paragraph or heading is dropped; text, links and media keep theirs',()=>{
    expect(isEmptyTextBlock(node('p',[' ']))).toBe(true)
    expect(isEmptyTextBlock(node('p',['\u00a0','\n']))).toBe(true)
    expect(isEmptyTextBlock(node('h2',[]))).toBe(true)
    expect(isEmptyTextBlock(node('p',['Text']))).toBe(false)
    expect(isEmptyTextBlock(node('p',[{tag:'img',attrs:{src:'/x.png'},children:[]}]))).toBe(false)
    expect(isEmptyTextBlock(node('h3',[{tag:'a',attrs:{href:'/x/'},children:[]}]))).toBe(false)
    expect(isEmptyTextBlock(node('div',[' ']))).toBe(false)
  })
  it('two product pages that carried an empty paragraph and an empty heading no longer render them',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const target of ['/product/amarillo-a-series-fan-drives-a32/','/product/amarillo-right-angle-gear-drives-double-reduction-1814/']){
      const main=await render(target)
      const body=main.slice(main.indexOf('<main'),main.indexOf('</main>'))
      expect(body,target).not.toMatch(/<p[^>]*>\s*(?:&nbsp;|\u00a0)?\s*<\/p>|<h[1-6][^>]*>\s*<\/h[1-6]>/)
    }
  },240000)
})
