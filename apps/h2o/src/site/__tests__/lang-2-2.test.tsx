// @vitest-environment happy-dom
/**
 * LANG-2.2: the launch safety switch, the staff link-only mode (N1), the validated googtrans pair (N2), the immediate fallback where
 * the page policy cannot run the widget (N3), body-only translation with protected names (T1, T2), the active-language control (T3),
 * the on-device help line, and the owner-approved legal wording.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {createElement} from 'react'
import {DISCLOSURE,LanguageMenu,TranslateNote} from '../lang/LanguageMenu'
import {TranslateModeProvider} from '../lang/TranslateMode'
import {languageMenu} from '../lang/lang-model'
import {googleWidgetEnabled,translateModeFor} from '../lang/translate-switch'
import {PROTECTED_NAMES} from '../lang/protected-names'
import {NO_TRANSLATE_REGIONS,restoreOnDevice,unwrapProtectedNames,wrapProtectedNames,type DeviceEnv,type TranslatorApi} from '../lang/translate-device'
import {restorePage,translatePage} from '../lang/translate-page'
import {readGoogtrans,translateInPlace,validPair} from '../lang/translate-widget'
import {GOOGLE_TRANSLATE_CSP,payloadPublicPolicy} from '../../proxy'

const env0={...process.env}
afterEach(()=>{process.env={...env0}})

describe('the launch safety switch',()=>{
  it('is ON when unset and OFF only for "off" (any case, trimmed)',()=>{
    expect(googleWidgetEnabled({})).toBe(true)
    expect(googleWidgetEnabled({H2O_TRANSLATE_GOOGLE_WIDGET:'on'})).toBe(true)
    expect(googleWidgetEnabled({H2O_TRANSLATE_GOOGLE_WIDGET:''})).toBe(true)
    for(const v of ['off','OFF',' Off '])expect(googleWidgetEnabled({H2O_TRANSLATE_GOOGLE_WIDGET:v})).toBe(false)
  })
  it('maps staff, static builds and the switch to a mode',()=>{
    expect(translateModeFor({staff:false,payloadContent:true,env:{}})).toBe('full')
    expect(translateModeFor({staff:false,payloadContent:true,env:{H2O_TRANSLATE_GOOGLE_WIDGET:'off'}})).toBe('no-google')
    expect(translateModeFor({staff:false,payloadContent:false,env:{}})).toBe('no-google') // static hash policy: no widget (N3)
    expect(translateModeFor({staff:true,payloadContent:true,env:{}})).toBe('links') // N1
    expect(translateModeFor({staff:true,payloadContent:false,env:{H2O_TRANSLATE_GOOGLE_WIDGET:'off'}})).toBe('links')
  })
  it('emits the Google CSP additions only while the switch is on',()=>{
    const on=payloadPublicPolicy('n','/a/')
    for(const list of Object.values(GOOGLE_TRANSLATE_CSP))for(const src of list)expect(on).toContain(src)
    process.env.H2O_TRANSLATE_GOOGLE_WIDGET='off'
    const off=payloadPublicPolicy('n','/a/')
    expect(off).not.toMatch(/google|gstatic/)
    const dir=(name:string)=>off.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+' '))!
    expect(dir('style-src')).toBe("style-src 'self' 'unsafe-inline'");expect(dir('img-src')).toBe("img-src 'self' data:");expect(dir('connect-src')).toBe("connect-src 'self'")
  })
  it('the menu tells the truth for each mode',()=>{
    const menu=languageMenu('/about-ics/',{})
    const html=(mode:'full'|'no-google'|'links')=>renderToStaticMarkup(<TranslateModeProvider mode={mode}><LanguageMenu data={menu} variant="desktop"/></TranslateModeProvider>)
    expect(html('full')).toContain('Otherwise Google Translate is used, which sends the page text to Google.')
    expect(html('no-google')).toContain('Otherwise Google Translate opens in a new tab.')
    expect(html('no-google')).not.toContain('sends the page text to Google')
    expect(html('links')).toContain('Google Translate opens in a new tab.')
    expect(html('links')).not.toContain('runs in your browser')
    expect(DISCLOSURE.full).not.toBe(DISCLOSURE['no-google'])
  })
})

describe('N2: the googtrans cookie is trusted only for an offered pair',()=>{
  it('accepts page language → the five translation languages and nothing else',()=>{
    for(const to of ['es','zh-CN','ko','ms','ar'])expect(validPair('en',to)).toBe(true)
    expect(validPair('th','es')).toBe(true)
    for(const [from,to] of [['en','fr'],['xx','es'],['en','en'],['es','en'],['en','zh-TW'],['en','es;domain=evil']])expect(validPair(from,to),`${from}/${to}`).toBe(false)
  })
  it('readGoogtrans ignores a cookie that names anything else',()=>{
    for(const [value,expected] of [['/en/es',{from:'en',to:'es'}],['/en/fr',null],['/auto/es',null],['/en/zh-CN',{from:'en',to:'zh-CN'}],['junk',null]] as const){
      document.cookie=`googtrans=${value}; path=/`
      expect(readGoogtrans(document),value).toEqual(expected)
      document.cookie='googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    }
  })
})

function widgetEnv(){
  const listeners:Array<(e:unknown)=>void>=[];const opened:string[]=[];const appended:Array<{src:string;onerror:null|(()=>void)}>=[]
  const doc=Object.create(document,{
    head:{value:{appendChild:(el:{src:string;onerror:null|(()=>void)})=>{appended.push(el)}}},
    addEventListener:{value:(type:string,fn:(e:unknown)=>void)=>{if(type==='securitypolicyviolation')listeners.push(fn)}},
  }) as Document
  const win={location:{pathname:'/a/',hostname:'www.example.com',protocol:'https:',assign:(u:string)=>opened.push('assign '+u),reload:()=>opened.push('reload')},open:(u:string)=>{opened.push('open '+u);return {}},setTimeout:()=>0,clearTimeout:()=>undefined,innerHeight:900}
  return {env:{doc,win} as unknown as DeviceEnv,opened,appended,listeners}
}
describe('N3: where the page policy cannot run the widget script',()=>{
  it('goes straight to the new-tab link on a script-src violation for the widget, without waiting for the timeout',()=>{
    const w=widgetEnv()
    translateInPlace({to:'es',fallbackHref:'https://translate.google.com/translate?tl=es',env:w.env})
    expect(w.listeners).toHaveLength(1)
    w.listeners[0]!({effectiveDirective:'script-src-elem',blockedURI:'https://translate.google.com/translate_a/element.js?cb=x'})
    expect(w.opened).toEqual(['open https://translate.google.com/translate?tl=es'])
    document.cookie='googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
  it('ignores violations that are not the widget script (an image, our own chunk)',()=>{
    const w=widgetEnv()
    translateInPlace({to:'es',fallbackHref:'https://t/x',env:w.env})
    w.listeners[0]!({effectiveDirective:'img-src',blockedURI:'https://www.google.com/images/cleardot.gif'})
    w.listeners[0]!({effectiveDirective:'script-src-elem',blockedURI:'http://127.0.0.1:3441/_next/static/chunks/x.js'})
    expect(w.opened).toEqual([])
    document.cookie='googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
  it('an unoffered language never reaches Google',()=>{
    const w=widgetEnv()
    translateInPlace({to:'fr',fallbackHref:'https://t/x',env:w.env})
    expect(w.appended).toHaveLength(0);expect(w.opened).toEqual(['open https://t/x']);expect(document.cookie).not.toContain('googtrans')
  })
})

const PAGE=`<header><nav class="site-nav"><a href="/parts/">Parts</a></nav></header>
<main><h1>ICS cooling tower repair</h1><div class="dr3-clients"><ul><li><span>Shell</span></li></ul></div>
<p id="p1">Shell and KBR trust our fill. We also stock Marley and Baltimore Aircoil parts, not shelling or ICSX.</p>
<p id="p2">A plain sentence.</p></main><footer><nav class="sp-footer-list"><a href="/x/">Useful Links</a></nav><p>Copyright notice</p></footer>`
const fakeApi=():{api:TranslatorApi;seen:string[]}=>{const seen:string[]=[];return {seen,api:{availability:async()=>'available',create:async()=>({translate:async(t:string)=>{seen.push(t);return `«${t}»`}})}}}
const devEnv=(api:TranslatorApi):DeviceEnv=>({doc:document,win:{Translator:api,innerHeight:900,setTimeout:(fn:()=>void,ms?:number)=>setTimeout(fn,ms??0),clearTimeout:(id:number)=>clearTimeout(id)} as unknown as DeviceEnv['win']})
const settle=()=>new Promise(r=>setTimeout(r,80))

describe('T1 + T2: names stay, only the body is translated',()=>{
  beforeEach(()=>{document.body.innerHTML=PAGE;document.documentElement.removeAttribute('data-translated');document.documentElement.removeAttribute('data-translated-by')})
  afterEach(()=>{restoreOnDevice(document)})
  it('keeps client, brand and ICS names, whole words only',async()=>{
    const {api,seen}=fakeApi()
    await translatePage({to:'es',fallbackHref:'x',env:devEnv(api)});await settle()
    const p=document.getElementById('p1')!
    expect(p.textContent).toContain('Shell');expect(p.textContent).toContain('KBR');expect(p.textContent).toContain('Marley');expect(p.textContent).toContain('Baltimore Aircoil')
    expect(p.querySelectorAll('span[data-lang-keep]')).toHaveLength(4)
    expect(seen.join('|')).not.toMatch(/Shell and|KBR|Marley|Baltimore|ICS cooling/)
    expect(seen.some(t=>/shelling/.test(t)&&/ICSX/.test(t))).toBe(true) // "shelling" and "ICSX" contain a name but are not the name
    expect(document.querySelector('h1')!.firstChild!.nodeType).toBe(1) // the ICS span leads the heading
    expect(document.querySelector('h1')!.textContent).toContain('ICS')
  })
  it('does not touch the header navigation, the footer lists or the client strip, but translates body and other footer text',async()=>{
    const {api,seen}=fakeApi()
    await translatePage({to:'es',fallbackHref:'x',env:devEnv(api)});await settle()
    expect(document.querySelector('.site-nav a')!.textContent).toBe('Parts')
    expect(document.querySelector('.sp-footer-list a')!.textContent).toBe('Useful Links')
    expect(document.querySelector('.dr3-clients')!.textContent).toBe('Shell')
    expect(document.getElementById('p2')!.textContent).toBe('«A plain sentence.»')
    expect(seen).toContain('Copyright notice')
    for(const part of ['.site-nav','.sp-footer-list','.dr3-clients'])expect(NO_TRANSLATE_REGIONS).toContain(part)
  })
  it('restores the page exactly, names and all',async()=>{
    const before=document.body.innerHTML
    const {api}=fakeApi()
    await translatePage({to:'zh-CN',fallbackHref:'x',env:devEnv(api)});await settle()
    expect(document.body.innerHTML).not.toBe(before)
    restorePage(devEnv(api))
    expect(document.body.innerHTML).toBe(before)
  })
  it('the spaces beside a name stay with the name, so a trimmed fragment cannot glue words together',()=>{
    document.body.innerHTML='<main><h1>About ICS</h1><p>We thank KBR, and ICS builds.</p></main>'
    wrapProtectedNames(document)
    const h1=document.querySelector('h1')!
    expect(h1.childNodes[0]!.nodeValue).toBe('About')
    expect(h1.querySelector('span')!.textContent).toBe(' ICS')
    expect([...document.querySelectorAll('p span')].map(e=>e.textContent)).toEqual([' KBR',' ICS '])
    unwrapProtectedNames(document)
    expect(document.querySelector('h1')!.innerHTML).toBe('About ICS')
  })
  it('wrap and unwrap are inverse, and the list holds the About-page clients',()=>{
    const before=document.body.innerHTML
    expect(wrapProtectedNames(document)).toBeGreaterThan(3)
    unwrapProtectedNames(document)
    expect(document.body.innerHTML).toBe(before)
    for(const name of ['Shell','Star Energy','Shintech','Shin-Etsu','TTCL','PTT Group','Pertamina','Mitsubishi','Marubeni','ICS'])expect(PROTECTED_NAMES).toContain(name)
  })
})

describe('T3 + the device help line',()=>{
  afterEach(()=>{document.documentElement.removeAttribute('data-translated');document.documentElement.removeAttribute('data-translated-by')})
  it('the language control names the language being shown, and EN again when the page is original',()=>{
    const menu=languageMenu('/about-ics/',{})
    const html=()=>renderToStaticMarkup(createElement(LanguageMenu,{data:menu,variant:'desktop'}))
    expect(html()).toContain('>EN<')
    // server render has no document status: the control reads EN until hydration, then follows data-translated
    expect(html()).not.toContain('>ES<')
  })
  it('shows the help line only on the on-device path',()=>{
    // renderToStaticMarkup renders the server snapshot (no status), so the note itself is covered by the browser run; here the strings are asserted from source
    const src=readFileSync(path.join(process.cwd(),'src/site/lang/LanguageMenu.tsx'),'utf8')
    expect(src).toContain('Translation applies to this page. Choose a language again on other pages.')
    expect(src).toMatch(/by==='device'&&!progress\?<span className="translate-help">/)
    expect(renderToStaticMarkup(createElement(TranslateNote,{pageLanguage:'en'}))).toBe('')
  })
})

describe('modes in translatePage',()=>{
  const g=()=>{const w=widgetEnv();return w}
  it('links mode (staff): opens the new-tab link only, no on-device pass, no widget',async()=>{
    const {api,seen}=fakeApi();const w=g()
    ;(w.env.win as unknown as {Translator:TranslatorApi}).Translator=api
    expect(await translatePage({to:'es',fallbackHref:'https://t/es',env:w.env,mode:'links'})).toBe('link')
    expect(w.opened).toEqual(['open https://t/es']);expect(w.appended).toHaveLength(0);expect(seen).toHaveLength(0)
  })
  it('no-google mode: on-device first; without it the new-tab link, never the widget or the cookie',async()=>{
    const w=g()
    expect(await translatePage({to:'ko',fallbackHref:'https://t/ko',env:w.env,mode:'no-google'})).toBe('link')
    expect(w.opened).toEqual(['open https://t/ko']);expect(w.appended).toHaveLength(0);expect(document.cookie).not.toContain('googtrans')
    document.body.innerHTML=PAGE
    const {api}=fakeApi()
    expect(await translatePage({to:'ko',fallbackHref:'https://t/ko',env:devEnv(api),mode:'no-google'})).toBe('device')
    restoreOnDevice(document)
  })
})

describe('the owner-approved legal wording (LANG-2.2)',()=>{
  const read=(f:string)=>readFileSync(path.join(process.cwd(),'content/legal',f),'utf8')
  it('Cookie Notice: device clause, googtrans only when Google Translate is used, no Google-domain row',()=>{
    const text=read('cookie-notice.md')
    expect(text).toContain('In supported browsers, translation runs on your device and no translation cookie is set.')
    expect(text).toContain('set only when Google Translate is used')
    expect(text).not.toContain('Google-domain cookies (if set or read)')
  })
  it('Privacy Notice: the Google-only sentence',()=>{
    expect(read('privacy-policy.md')).toContain('When you choose a translation language and your browser cannot translate on your device, the page text is sent to Google to translate it.')
  })
})
