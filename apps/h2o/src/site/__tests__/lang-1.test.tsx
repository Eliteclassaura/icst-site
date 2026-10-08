/**
 * LANG-1 (owner decision 2026-10-08): the language selector. Counterparts come from the existing hreflang clusters (with the
 * sitemap's redirect guard); a language without a counterpart is disabled, never a dead link; Google Translate links are
 * outbound, nofollow and always name the canonical h2ocooling.com URL; nothing redirects; no Google script, no CSP change.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {repositoryAlternatesFor} from '../../content/sitemap-response'
import {AVAILABLE,CANONICAL_ORIGIN,TRANSLATE,canonicalUrl,languageMenu,languageOfPath,menuReducer,readDismissed,sitePath,suggestionFor,translateUrl,writeDismissed,LANG_STORAGE_KEY} from '../lang/lang-model'
import {languageMenuFor} from '../lang/lang-data'

const APP=process.cwd()
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})

const GUIDE='/guide-about-cooling-tower/'
const alternates={en:CANONICAL_ORIGIN+GUIDE,th:CANONICAL_ORIGIN+'/th/%e0%b8%ab%e0%b8%ad/',ja:CANONICAL_ORIGIN+'/ja/%e5%86%b7/',id:CANONICAL_ORIGIN+'/id/apa-itu-menara-pendinginan/','x-default':CANONICAL_ORIGIN+GUIDE}

describe('counterpart lookup',()=>{
  it('names the page language by its folder, English by default',()=>{
    expect(languageOfPath('/th/%e0%b8%ab/')).toBe('th')
    expect(languageOfPath('/ja/冷却塔/')).toBe('ja')
    expect(languageOfPath('/id/apa/')).toBe('id')
    expect(languageOfPath('/vi/thap/')).toBe('vi')
    expect(languageOfPath(GUIDE)).toBe('en')
    expect(languageOfPath('/thailand-cooling-tower/')).toBe('en')
  })
  it('links each available language to the page\'s real counterpart; a missing one is disabled (never a link)',()=>{
    const menu=languageMenu(GUIDE,alternates)
    expect(menu.available.map(i=>[i.code,i.href,i.current])).toEqual([['en',GUIDE,true],['th','/th/%e0%b8%ab%e0%b8%ad/',false],['ja','/ja/%e5%86%b7/',false],['id','/id/apa-itu-menara-pendinginan/',false],['vi',null,false]])
    expect(AVAILABLE.map(i=>i.code)).toEqual(['en','th','ja','id','vi'])
  })
  it('a page with no cluster disables every other language and keeps English current',()=>{
    const menu=languageMenu('/contact-us/',undefined)
    expect(menu.available.filter(i=>i.href).map(i=>i.code)).toEqual(['en'])
    expect(menu.available.filter(i=>!i.href).map(i=>i.code)).toEqual(['th','ja','id','vi'])
  })
  it('works in reverse on a locale page',()=>{
    const menu=languageMenu('/th/%e0%b8%ab%e0%b8%ad/',alternates)
    expect(menu.current).toBe('th')
    expect(menu.available.find(i=>i.code==='en')?.href).toBe(GUIDE)
    expect(menu.available.find(i=>i.code==='th')?.current).toBe(true)
  })
  it('only same-site members become links',()=>{
    expect(sitePath('https://example.com/x/')).toBeNull()
    expect(sitePath(CANONICAL_ORIGIN+'/x/')).toBe('/x/')
  })
  it('the repository cluster map yields live counterparts only (no redirecting or missing member)',()=>{
    const map=repositoryAlternatesFor(GUIDE)!
    expect(map.en).toBe(CANONICAL_ORIGIN+GUIDE)
    for(const code of ['th','ja','id','vi'])expect(map[code],code).toBeDefined()
    const menu=languageMenuFor(GUIDE)
    for(const item of menu.available)expect(item.href===null||item.href.startsWith('/')).toBe(true)
  })
  it('held articles are never offered as a counterpart (the redirect guard)',()=>{
    for(const held of ['/hvac-cooling-tower/','/hvac-cooling-tower-systems/','/commercial-cooling-towers/'])expect(repositoryAlternatesFor(held),held).toBeUndefined()
  })
})

describe('Google Translate links',()=>{
  it('builds the outbound URL on the canonical host with the page URL encoded',()=>{
    expect(translateUrl(GUIDE,'ms')).toBe('https://translate.google.com/translate?sl=en&tl=ms&u=https%3A%2F%2Fh2ocooling.com%2Fguide-about-cooling-tower%2F')
    expect(translateUrl(GUIDE,'zh-CN')).toContain('tl=zh-CN')
    expect(translateUrl('/th/%e0%b8%ab/','ko','auto')).toContain('sl=auto')
  })
  it('the canonical host is h2ocooling.com whatever host renders the page (staging, localhost)',()=>{
    expect(canonicalUrl('https://staging.h2ocooling.org/x/y/')).toBe('https://h2ocooling.com/x/y/')
    expect(canonicalUrl('x/y/')).toBe('https://h2ocooling.com/x/y/')
    expect(decodeURIComponent(translateUrl('/a%20b/','es'))).toContain('u=https://h2ocooling.com/a%20b/')
  })
  it('offers exactly the five machine-translation languages, Arabic marked rtl',()=>{
    const menu=languageMenu(GUIDE,alternates)
    expect(TRANSLATE.map(i=>i.tl)).toEqual(['ms','zh-CN','ko','es','ar'])
    expect(menu.translate.find(i=>i.code==='ar')?.dir).toBe('rtl')
    expect(menu.translate.every(i=>i.href.startsWith('https://translate.google.com/translate?'))).toBe(true)
  })
})

describe('suggestion (never a redirect)',()=>{
  const menu=languageMenu(GUIDE,alternates)
  it('suggests the page in the visitor\'s language only when the counterpart exists',()=>{
    expect(suggestionFor(menu,['th-TH','en'])).toMatchObject({kind:'page',code:'th'})
    expect(suggestionFor(menu,['vi-VN'])).toBeNull()
    expect(suggestionFor(menu,['en-US','th'])).toBeNull()
    expect(suggestionFor(menu,['fr-FR'])).toBeNull()
  })
  it('offers the Google Translate link for ms, zh, ko, es and ar',()=>{
    expect(suggestionFor(menu,['ms-MY'])).toMatchObject({kind:'translate',code:'ms'})
    expect(suggestionFor(menu,['zh-Hans-CN'])).toMatchObject({kind:'translate',code:'zh'})
    expect(suggestionFor(menu,['ar-SA'])).toMatchObject({kind:'translate',code:'ar',dir:'rtl'})
  })
  it('a visitor already on the page in their language is not asked',()=>{
    expect(suggestionFor(languageMenu('/th/%e0%b8%ab%e0%b8%ad/',alternates),['th-TH'])).toBeNull()
  })
  it('remembers the dismissal and survives blocked storage',()=>{
    const store=new Map<string,string>()
    const storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v)}
    expect(readDismissed(storage)).toBe(false)
    writeDismissed(storage)
    expect(store.get(LANG_STORAGE_KEY)).toBe('1')
    expect(readDismissed(storage)).toBe(true)
    const broken={getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')}}
    expect(readDismissed(broken)).toBe(false)
    expect(()=>writeDismissed(broken)).not.toThrow()
    expect(readDismissed(undefined)).toBe(false)
  })
  it('the client code never navigates: no location assignment, replace, meta refresh or router push',()=>{
    for(const file of ['LanguageMenu.tsx','lang-model.ts','lang-data.ts']){
      const source=readFileSync(path.join(APP,'src/site/lang',file),'utf8')
      expect(source,file).not.toMatch(/location\s*(\.|=)|\.replace\(|\.assign\(|router\.|http-equiv|window\.open/)
    }
  })
})

describe('menu keyboard behaviour (state machine)',()=>{
  const closed={open:false,focusButton:false}
  it('toggles open and closed',()=>{
    expect(menuReducer(closed,'toggle').open).toBe(true)
    expect(menuReducer({open:true,focusButton:false},'toggle').open).toBe(false)
  })
  it('Escape closes an open menu and returns focus to the button; Escape on a closed menu does nothing',()=>{
    expect(menuReducer({open:true,focusButton:false},'escape')).toEqual({open:false,focusButton:true})
    expect(menuReducer(closed,'escape')).toBe(closed)
  })
  it('a click or focus outside closes without stealing focus; selecting an item closes',()=>{
    expect(menuReducer({open:true,focusButton:false},'outside')).toEqual({open:false,focusButton:false})
    expect(menuReducer({open:true,focusButton:false},'select').open).toBe(false)
  })
})

describe('the selector in the page chrome',()=>{
  it('renders on a clustered page: globe button (desktop and mobile), real counterpart links, translate links nofollow, labels carry lang',async()=>{
    const html=await render(GUIDE)
    expect(html).toContain('class="lang-menu lang-menu--desktop"')
    expect(html).toContain('class="lang-menu lang-menu--mobile"')
    expect(html).toMatch(/<a href="\/th\/[^"]+" lang="th" hrefLang="th">ไทย<\/a>/)
    expect(html).toMatch(/<a href="https:\/\/translate\.google\.com\/translate\?sl=en&amp;tl=ar&amp;u=https%3A%2F%2Fh2ocooling\.com%2Fguide-about-cooling-tower%2F"[^>]*rel="noopener noreferrer nofollow"[^>]*lang="ar" dir="rtl"/)
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toMatch(/translate\.google\.com\/[^"]*"[^>]*(?<!nofollow)>\s*<\/a>/)
  })
  it('adds no script, no meta refresh and no Google resource to the page',async()=>{
    const html=await render(GUIDE)
    expect(html).not.toMatch(/<script[^>]+src="[^"]*(google|gstatic)/i)
    expect(html).not.toMatch(/http-equiv="refresh"/i)
  })
  it('LANG-1.2: a page with no locale twins lists no unavailable language (only English), then the Google Translate section and its note as before',async()=>{
    for(const target of ['/contact-us/','/about-ics/']){
      const html=await render(target)
      expect(html,target).not.toContain('Not available for this page')
      expect(html,target).not.toContain('lang-disabled')
      expect(html,target).not.toContain('aria-disabled')
      expect(html,target).not.toMatch(/<a href="\/th\//)
      // the Available group holds exactly the languages that have a page: English alone
      const available=html.slice(html.indexOf('>Available</p>'),html.indexOf('Translate this page (Google Translate)'))
      expect([...available.matchAll(/<li>/g)].length,target).toBe(1)
      expect(available,target).toContain('aria-current="page"')
      expect(html,target).toContain('Translate this page (Google Translate)')
      expect(html,target).toContain('Machine translation by Google opens in a new tab. ICS does not review it.')
    }
  })
  it('LANG-1.2: a page that does have locale versions still lists them, and never a disabled entry',async()=>{
    const html=await render(GUIDE)
    expect(html).toMatch(/<a href="\/th\/[^"]+" lang="th" hrefLang="th">ไทย<\/a>/)
    expect(html).not.toContain('Not available for this page')
    expect(html).not.toContain('lang-disabled')
    expect(html).toContain('Machine translation by Google opens in a new tab. ICS does not review it.')
  })
  it('does not change URLs, titles or hreflang: the stylesheet is the only other addition',()=>{
    const layout=readFileSync(path.join(APP,'src/app/(site)/layout.tsx'),'utf8')
    expect(layout).toContain("import './design-lang.css'")
    const css=readFileSync(path.join(APP,'src/app/(site)/design-lang.css'),'utf8')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\b(margin|padding)-(left|right|top|bottom)\s*:/)
  })
  it('DD review markers: the current language is marked in text and by a check; the five Google links carry an outbound marker; the mobile row is a collapsed disclosure',async()=>{
    const html=await render('/guide-about-cooling-tower/')
    expect(html).toContain('(current language)')
    expect(html.match(/class="lang-check"/g)?.length).toBe(2)
    expect(html.match(/class="lang-ext"/g)?.length).toBe(10)
    expect(html).toMatch(/class="lang-chevron"/)
    const css=readFileSync(path.join(APP,'src/app/(site)/design-lang.css'),'utf8')
    expect(css).toContain('max-block-size: calc(100dvh - 100px)')
    expect(css).toContain('label.sr-only')
  })
})
