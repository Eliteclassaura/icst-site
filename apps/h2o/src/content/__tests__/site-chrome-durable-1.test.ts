/**
 * SITE-CHROME-DURABLE-1 (CT 2026-10-09): the header navigation tree and the footer link columns come from the code defaults, whatever
 * the stored `site-chrome` global holds. A fresh database seeded from yesterday's defaults, or a re-publish of an old version, can no
 * longer bring back a stale footer link or a stale Fans menu. Editors keep the footer's own words.
 */
import {describe,expect,it} from 'vitest'
import {SiteChromeGlobal,chromeFromGlobal,siteChromeSeed} from '../site-chrome'
import {DEFAULT_SITE_CHROME,type NavGroup} from '../../site/site-chrome-content'

type Doc=Record<string,unknown>
const clone=<T,>(v:T):T=>structuredClone(v)

/** A global as a stale seed would have left it: the old footer links and a Parts menu without the current Fans items. */
function staleGlobal():Doc{
  const seed=siteChromeSeed() as {navigation:NavGroup[];footer:Doc&{columns:Array<{links:Array<{label:string;href:string}>}>}}
  const nav=clone(seed.navigation)
  const parts=nav.find(g=>g.label==='Parts')
  const fans=parts?.items?.filter(i=>/^\/fans\/?$/.test(i.href))
  if(parts&&fans)parts.items=fans.slice(0,1) // only "/fans/": the current Fans submenu is gone
  const footer=clone(seed.footer)
  footer.columns[0]!.links=[{label:'Expert Industrial Cooling Solutions',href:'/'},...footer.columns[0]!.links,{label:'Search',href:'/search/'}]
  return {navigation:nav,footer,_status:'published'}
}

describe('the structure is code-owned',()=>{
  it('a stale stored global gives the code defaults for the whole navigation tree and every footer column',()=>{
    const stale=staleGlobal()
    expect(JSON.stringify(stale.navigation)).not.toBe(JSON.stringify(DEFAULT_SITE_CHROME.navigation)) // the fixture really is stale (or the defaults equal the stale seed: then nothing to fix)
    const chrome=chromeFromGlobal(stale)
    expect(chrome.navigation).toEqual(DEFAULT_SITE_CHROME.navigation)
    expect(chrome.footer.columns).toEqual(DEFAULT_SITE_CHROME.footer.columns)
    const labels=chrome.footer.columns[0]!.links.map(l=>l.label)
    expect(labels).not.toContain('Expert Industrial Cooling Solutions')
    expect(labels).not.toContain('Search')
  })
  it('the Parts menu of a stale global gets the current Fans items (Hudson, TUF-LITE II/III/IV, Howden) and the footer loses the two removed links',()=>{
    const chrome=chromeFromGlobal(staleGlobal())
    const parts=chrome.navigation.find(g=>g.label==='Parts')!
    const labels=(parts.items??[]).map(i=>i.label)
    for(const label of ['Fans','Hudson fans','TUF-LITE II','TUF-LITE III','TUF-LITE IV','Howden fans'])expect(labels,label).toContain(label)
    expect(chrome.footer.columns[0]!.links.map(l=>l.label)).toEqual(['About ICS','All Projects','Resources Library','Technical Articles','Brochures','Tools','Contact Us'])
  })
  it('a fresh-database seed (the defaults of the day) round-trips to the same defaults',()=>{
    expect(chromeFromGlobal({...siteChromeSeed(),_status:'published'})).toEqual(DEFAULT_SITE_CHROME)
  })
  it('editors keep the footer words: heading, description, office labels, copyright, privacy link',()=>{
    const stale=staleGlobal()
    ;(stale.footer as Doc).heading='Edited heading'
    ;(stale.footer as Doc).copyright='Edited copyright'
    ;(stale.footer as Doc).privacyLabel='Privacy'
    ;(stale.footer as Doc).description='   ' // blank: falls back to the default
    const chrome=chromeFromGlobal(stale)
    expect(chrome.footer.heading).toBe('Edited heading')
    expect(chrome.footer.copyright).toBe('Edited copyright')
    expect(chrome.footer.privacyLabel).toBe('Privacy')
    expect(chrome.footer.description).toBe(DEFAULT_SITE_CHROME.footer.description)
    expect(chrome.footer.columns).toEqual(DEFAULT_SITE_CHROME.footer.columns)
  })
  it('never saved, empty or draft: exactly the defaults',()=>{
    expect(chromeFromGlobal(null)).toBe(DEFAULT_SITE_CHROME)
    expect(chromeFromGlobal({})).toBe(DEFAULT_SITE_CHROME)
    expect(chromeFromGlobal({...staleGlobal(),_status:'draft'})).toBe(DEFAULT_SITE_CHROME)
  })
  it('the admin shows the two structural fields as fixed (read-only), not as editable content',()=>{
    const fields=SiteChromeGlobal.fields as Array<{name:string;admin?:{readOnly?:boolean};fields?:Array<{name:string;admin?:{readOnly?:boolean}}>}>
    expect(fields.find(f=>f.name==='navigation')?.admin?.readOnly).toBe(true)
    expect(fields.find(f=>f.name==='footer')?.fields?.find(f=>f.name==='columns')?.admin?.readOnly).toBe(true)
    expect(fields.find(f=>f.name==='footer')?.fields?.find(f=>f.name==='heading')?.admin?.readOnly).toBeUndefined()
  })
})
