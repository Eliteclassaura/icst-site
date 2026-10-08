// @vitest-environment happy-dom
/**
 * LANG-2.1: translation on the visitor's device first (the browser's Translator API), Google widget second, new tab last.
 * The built-in path makes no request and sets no cookie; English restores the original text exactly; untranslatable regions
 * and form values are never touched.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {createElement} from 'react'
import {TranslateNote} from '../lang/LanguageMenu'
import {collectTextNodes,deviceCode,pieces,restoreOnDevice,runOnDevice,translateStatus,type DeviceEnv,type TranslatorApi} from '../lang/translate-device'
import {restorePage,translatePage} from '../lang/translate-page'

const PAGE=`<header><nav><a href="/about-ics/">About</a></nav></header>
<main><h1>Cooling tower repair</h1><p id="p1">We rebuild fill and fans.  Call <span translate="no">+662-661-7723</span> today.</p>
<p id="p2">  Leading and trailing space kept.  </p><div class="notranslate"><p id="skip">Do not translate this</p></div>
<form><label for="e">Work email</label><input id="e" name="email" type="email" placeholder="you@company.com"><textarea id="n"></textarea></form>
<code>pnpm build</code><script>var x = "Script text"</script></main>
<div data-lang-menu="desktop"><p>Language menu text</p></div>`

type Calls={availability:number;create:number;translate:string[];progress?:(n:number)=>void;release?:()=>void}
function fakeApi(availability:string,opts:{failTranslate?:boolean;failCreate?:boolean}={}):{api:TranslatorApi;calls:Calls}{
  const calls:Calls={availability:0,create:0,translate:[]}
  const api:TranslatorApi={
    availability:async()=>{calls.availability++;return availability},
    create:async({monitor})=>{
      calls.create++
      if(opts.failCreate)throw new Error('no model')
      if(monitor){const target=new EventTarget();monitor(target);calls.progress=(loaded)=>target.dispatchEvent(Object.assign(new Event('downloadprogress'),{loaded}));await new Promise<void>(r=>{calls.release=r})}
      return {translate:async(text:string)=>{calls.translate.push(text);if(opts.failTranslate)throw new Error('fail');return `«${text.toUpperCase()}»`}}
    },
  }
  return {api,calls}
}
const envWith=(api?:TranslatorApi):DeviceEnv=>({doc:document,win:{Translator:api,innerHeight:900,setTimeout:(fn:()=>void,ms?:number)=>setTimeout(fn,ms===undefined?0:ms),clearTimeout:(id:number)=>clearTimeout(id)} as unknown as DeviceEnv['win']})
const settle=()=>new Promise(r=>setTimeout(r,60))

beforeEach(()=>{document.body.innerHTML=PAGE;document.documentElement.removeAttribute('data-translated');document.documentElement.removeAttribute('data-translated-by')})
afterEach(()=>{restoreOnDevice(document)})

describe('what is collected',()=>{
  it('takes visible text and skips translate="no", .notranslate, code, scripts, form fields and our own menu',()=>{
    const texts=collectTextNodes(document).map(n=>n.nodeValue!.trim())
    expect(texts).toContain('Cooling tower repair')
    expect(texts).toContain('Work email')
    for(const bad of ['+662-661-7723','Do not translate this','pnpm build','Language menu text'])expect(texts).not.toContain(bad)
    expect(texts.join(' ')).not.toMatch(/Script text/)
  })
  it('maps zh-CN to the API code and splits long text into sentence pieces',()=>{
    expect(deviceCode('zh-CN')).toBe('zh');expect(deviceCode('es')).toBe('es')
    const long=Array.from({length:60},(_,i)=>`Sentence number ${i} is here.`).join(' ')
    const parts=pieces(long,200)
    expect(parts.length).toBeGreaterThan(5);expect(parts.every(p=>p.length<=200)).toBe(true);expect(parts.join(' ')).toBe(long)
  })
})

describe('supported: the page is translated on the device',()=>{
  it('translates in place, with no Google script, no cookie, and the phone number and form values untouched',async()=>{
    const {api,calls}=fakeApi('available')
    const input=document.getElementById('e') as HTMLInputElement
    input.value='jane.doe@example.com'
    const how=await translatePage({to:'es',fallbackHref:'x',env:envWith(api)})
    await settle()
    expect(how).toBe('device')
    expect(calls.availability).toBe(1)
    expect(document.querySelector('h1')!.textContent).toBe('«COOLING TOWER REPAIR»')
    expect(document.querySelector('[translate="no"]')!.textContent).toBe('+662-661-7723')
    expect(document.getElementById('skip')!.textContent).toBe('Do not translate this')
    expect(input.value).toBe('jane.doe@example.com')
    expect(document.cookie).toBe('')
    expect(document.querySelector('script[data-lang-widget]')).toBeNull()
    expect(translateStatus()).toBe('es|device|')
    expect(document.documentElement.getAttribute('data-translated-by')).toBe('device')
  })
  it('keeps the original whitespace around each text node',async()=>{
    const {api}=fakeApi('available')
    await translatePage({to:'es',fallbackHref:'x',env:envWith(api)});await settle()
    expect(document.getElementById('p2')!.textContent).toBe('  «LEADING AND TRAILING SPACE KEPT.»  ')
  })
  it('restores the original text exactly on English, without a reload',async()=>{
    const before=document.body.innerHTML
    const {api}=fakeApi('available')
    await translatePage({to:'zh-CN',fallbackHref:'x',env:envWith(api)});await settle()
    expect(document.body.innerHTML).not.toBe(before)
    restorePage(envWith(api))
    expect(document.body.innerHTML).toBe(before)
    expect(translateStatus()).toBeNull()
  })
  it('a second language starts again from the original text, never from the first translation',async()=>{
    const {api,calls}=fakeApi('available')
    await translatePage({to:'es',fallbackHref:'x',env:envWith(api)});await settle()
    calls.translate.length=0
    await translatePage({to:'ko',fallbackHref:'x',env:envWith(api)});await settle()
    expect(calls.translate).toContain('Cooling tower repair')
    expect(calls.translate.some(t=>t.includes('«'))).toBe(false)
  })
  it('stops a pending pass when the visitor goes back to English',async()=>{
    const {api,calls}=fakeApi('available')
    await translatePage({to:'es',fallbackHref:'x',env:envWith(api)})
    restorePage(envWith(api));const n=calls.translate.length;await settle()
    expect(calls.translate.length).toBe(n)
    expect(document.querySelector('h1')!.textContent).toBe('Cooling tower repair')
  })
})

describe('downloadable: a calm progress note while the model downloads',()=>{
  it('shows progress, then the translated note',async()=>{
    const {api,calls}=fakeApi('downloadable')
    const done=translatePage({to:'es',fallbackHref:'x',env:envWith(api)})
    await new Promise(r=>setTimeout(r,5))
    calls.progress?.(0.4)
    expect(translateStatus()).toBe('es|device|40')
    calls.release?.()
    expect(renderToStaticMarkup(createElement(TranslateNote,{pageLanguage:'en'}))).toBe('')
    await done;await settle()
    expect(translateStatus()).toBe('es|device|')
  })
})

describe('unavailable or failing: Google, then the new tab',()=>{
  const googleEnv=()=>{
    const timers:Array<()=>void>=[];const opened:string[]=[];const appended:Array<{src:string;onerror:null|(()=>void)}>=[]
    const win={Translator:undefined as unknown,location:{pathname:'/about-ics/',hostname:'www.example.com',protocol:'https:',assign:(u:string)=>opened.push('assign '+u),reload:()=>opened.push('reload')},open:(u:string)=>{opened.push('open '+u);return {}},setTimeout:(fn:()=>void)=>{timers.push(fn);return 0},clearTimeout:()=>undefined,innerHeight:900}
    const head={appendChild:(el:{src:string;onerror:null|(()=>void)})=>{appended.push(el)}}
    const doc=Object.create(document,{head:{value:head}}) as Document
    return {env:{doc,win} as unknown as DeviceEnv,opened,appended,win,timers}
  }
  it('no Translator in the browser: the Google widget path starts (script added, cookie set)',async()=>{
    const g=googleEnv()
    const how=await translatePage({to:'es',fallbackHref:'https://t/x',env:g.env})
    expect(how).toBe('google')
    expect(g.appended[0]!.src).toContain('translate.google.com/translate_a/element.js')
    expect(document.cookie).toContain('googtrans=/en/es')
    document.cookie='googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
  it('availability "unavailable": Google; and a throwing availability: Google',async()=>{
    for(const api of [fakeApi('unavailable').api,{availability:async()=>{throw new Error('x')},create:async()=>({translate:async(t:string)=>t})} as TranslatorApi]){
      const g=googleEnv();g.win.Translator=api
      expect(await translatePage({to:'ar',fallbackHref:'https://t/x',env:g.env})).toBe('google')
      expect(g.appended).toHaveLength(1)
      document.cookie='googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    }
  })
  it('a Translator that never answers does not hold the visitor: after the timeout Google takes over',async()=>{
    const g=googleEnv();g.win.Translator={availability:()=>new Promise(()=>undefined),create:async()=>({translate:async(t:string)=>t})} as unknown
    const result=translatePage({to:'es',fallbackHref:'https://t/x',env:g.env})
    await new Promise(r=>setTimeout(r,5))
    g.timers[0]!() // the 3 s availability timeout
    expect(await result).toBe('google')
    expect(g.appended).toHaveLength(1)
    document.cookie='googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
  it('model creation or the first translation fails: the page is put back and Google takes over',async()=>{
    for(const failure of [{failCreate:true},{failTranslate:true}]){
      document.body.innerHTML=PAGE
      const before=document.body.innerHTML
      const {api}=fakeApi('available',failure)
      const g=googleEnv();g.win.Translator=api
      Object.defineProperty(g.env.doc,'body',{value:document.body,configurable:true})
      expect(await runOnDevice('es','en',g.env)).toBe(false)
      expect(document.body.innerHTML).toBe(before)
      expect(translateStatus()).toBeNull()
    }
  })
  it('both fail (no on-device Translator, widget script fails to load): the new-tab Google Translate link opens and no cookie is left',async()=>{
    const g=googleEnv()
    await translatePage({to:'ko',fallbackHref:'https://translate.google.com/translate?tl=ko',env:g.env})
    g.appended[0]!.onerror!()
    expect(g.opened).toEqual(['open https://translate.google.com/translate?tl=ko'])
    expect(document.cookie).not.toContain('googtrans')
  })
})

describe('the note',()=>{
  it('says what happened: on-device or Google, with the way back',()=>{
    const note=(status:string)=>{
      const [to,by]=status.split('|');document.documentElement.setAttribute('data-translated',to!);document.documentElement.setAttribute('data-translated-by',by!)
      return translateStatus()
    }
    expect(note('es|device')).toBe('es|device|')
    expect(note('es|google')).toBe('es|google|')
  })
})
