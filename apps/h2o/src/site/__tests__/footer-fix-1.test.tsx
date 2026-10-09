/**
 * FOOTER-FIX-1 (owner request via CT 2026-10-08): the site footer no longer carries the "Expert Industrial Cooling Solutions" link
 * (it pointed to the home page) or the "Search" link. Everything else in the footer stays; the search page itself still exists.
 */
import {existsSync} from 'node:fs'
import path from 'node:path'
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {LuxuryFooter} from '../LuxuryShell'
import {DEFAULT_SITE_CHROME} from '../site-chrome-content'

const footer=(route?:string)=>{const html=renderToStaticMarkup(<LuxuryFooter routePath={route}/>);return html.slice(html.indexOf('<footer'),html.indexOf('</footer>'))}
const links=(html:string)=>[...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs)].map(m=>({href:m[1]!,text:m[2]!.replace(/<[^>]+>/g,'').trim()}))

describe('FOOTER-FIX-1',()=>{
  it('the Useful Links column no longer lists "Expert Industrial Cooling Solutions" or "Search" (at the source)',()=>{
    const useful=DEFAULT_SITE_CHROME.footer.columns[0]!
    expect(useful.title).toBe('Useful Links')
    expect(useful.links.map(l=>l.label)).toEqual(['About ICS','All Projects','Resources Library','Technical Articles','Brochures','Tools','Contact Us'])
    for(const column of DEFAULT_SITE_CHROME.footer.columns)for(const link of column.links){
      expect(link.label).not.toBe('Expert Industrial Cooling Solutions')
      expect(link.label).not.toBe('Search')
      expect(link.href).not.toBe('/search/')
    }
  })
  it('the rendered footer has neither link, on any page',()=>{
    for(const route of [undefined,'/','/contact-us/','/about-ics-industrial-cooling-solutions/']){
      const html=footer(route)
      expect(html,String(route)).not.toContain('Expert Industrial Cooling Solutions')
      expect(links(html).filter(l=>l.text==='Search'||l.href==='/search/'),String(route)).toEqual([])
    }
  })
  it('keeps every other footer link, the legal row, the Thailand phone format and the logo link',()=>{
    const html=footer()
    const got=links(html).map(l=>l.text)
    for(const label of ['About ICS','All Projects','Resources Library','Technical Articles','Brochures','Tools','Contact Us','New Cooling Towers','Fans','Nozzles','Air Coolers'])expect(got,label).toContain(label)
    expect(html).toContain('+662-661-7723')
    expect(html).toContain('aria-label="ICS homepage"') // the logo still links home: only the text link went
    expect(html).toContain('class="sp-footer-legal"')
    expect(html).toContain('aria-label="Locations"')
  })
  it('leaves the column well-formed: a heading and a list with no empty items or stray separators',()=>{
    const column=footer().match(/<nav class="sp-footer-list" aria-label="Useful Links">.*?<\/nav>/s)![0]
    expect(column).toMatch(/^<nav class="sp-footer-list" aria-label="Useful Links"><h3>Useful Links<\/h3><ul>(<li><a href="[^"]+">[^<]+<\/a><\/li>){7}<\/ul><\/nav>$/)
  })
  it('the search page itself still exists',()=>{
    expect(existsSync(path.join(process.cwd(),'src/app/(site)/search/page.tsx'))).toBe(true)
  })
})
