/**
 * LANG-2: in-page Google Translate, strictly opt-in. Nothing from Google before a language is chosen; the googtrans cookie is
 * set only after opt-in and cleared on English; a failed widget falls back to the new-tab link; the CSP additions are the
 * minimum (no unsafe-inline/eval for scripts, no script host) and apply to the Payload policy only.
 */
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {createElement} from 'react'
import {basePolicy,payloadPublicPolicy,GOOGLE_TRANSLATE_CSP} from '../../proxy'
import {LanguageMenu,TranslateNote} from '../lang/LanguageMenu'
import {languageMenu,TRANSLATE} from '../lang/lang-model'
import {EXCLUDED_PATH,clearGoogtrans,readGoogtrans,resumeIfOptedIn,restoreEnglish,setGoogtrans,translateInPlace} from '../lang/translate-widget'

type Jar=Map<string,string>
/** A just-enough document: a cookie jar (host-only and domain cookies, expiry honoured), head/body appends and attributes. */
function fakeEnv(pathname='/about-ics/',hostname='www.example.com'){
  const jar:Jar=new Map()
  const appended:Array<{tag:string;src?:string;id?:string;attrs:Record<string,string>;onerror?:()=>void}>=[]
  const rootAttrs:Record<string,string>={}
  const make=(tag:string)=>{const el={tag,attrs:{} as Record<string,string>,src:'',id:'',hidden:false,className:'',async:false,onerror:undefined as undefined|(()=>void),setAttribute(k:string,v:string){el.attrs[k]=v},getAttribute:(k:string)=>el.attrs[k]??null};return el}
  const doc={
    get cookie(){return [...jar.entries()].map(([k,v])=>`${k.split('|')[0]}=${v}`).join('; ')},
    set cookie(line:string){
      const [pair,...rest]=line.split(';').map(s=>s.trim());const [name,value]=pair!.split('=') as [string,string]
      const domain=rest.find(r=>r.startsWith('domain='))?.slice(7)??''
      const expired=rest.some(r=>/^expires=.*1970/.test(r))
      const key=`${name}|${domain}`
      if(expired)jar.delete(key);else jar.set(key,value)
    },
    documentElement:{setAttribute:(k:string,v:string)=>{rootAttrs[k]=v},removeAttribute:(k:string)=>{delete rootAttrs[k]},getAttribute:(k:string)=>rootAttrs[k]??null},
    head:{appendChild:(el:{tag:string})=>{appended.push(el as never)}},
    body:{appendChild:(el:{tag:string})=>{appended.push(el as never)}},
    createElement:make,
    getElementById:(id:string)=>appended.find(a=>a.id===id)??null,
    querySelector:(sel:string)=>sel==='script[data-lang-widget]'?appended.find(a=>a.tag==='script')??null:null,
    querySelectorAll:()=>[],
  }
  const opened:string[]=[]
  const timers:Array<()=>void>=[]
  const win={
    location:{pathname,hostname,protocol:'https:',assign:(u:string)=>{opened.push('assign '+u)},reload:()=>{opened.push('reload')}},
    open:(u:string)=>{opened.push('open '+u);return {}},
    setTimeout:(fn:()=>void)=>{timers.push(fn);return 0},
  }
  return {env:{doc:doc as unknown as Document,win:win as unknown as Window},jar,appended,rootAttrs,opened,timers}
}

describe('before opt-in',()=>{
  it('loads nothing from Google and sets no cookie when the page only renders',()=>{
    const t=fakeEnv()
    resumeIfOptedIn('en',t.env)
    expect(t.appended).toHaveLength(0)
    expect(t.jar.size).toBe(0)
  })
  it('a page rendered for a visitor with no choice contains no Google URL except the visible fallback links',()=>{
    const html=renderToStaticMarkup(createElement(TranslateNote,{pageLanguage:'en'}))
    expect(html).not.toContain('google')
  })
})

describe('opt-in',()=>{
  it('sets the googtrans session cookie and adds the widget script only after the choice',()=>{
    const t=fakeEnv()
    translateInPlace({to:'es',fallbackHref:'https://translate.google.com/translate?sl=en&tl=es&u=x',env:t.env})
    expect(readGoogtrans(t.env.doc)).toEqual({from:'en',to:'es'})
    const script=t.appended.find(a=>a.tag==='script')!
    expect(script.src).toBe('https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit')
    expect(t.jar.get('googtrans|')).toBe('/en/es') // host-only (no domain attribute), no expiry: a session cookie
  })
  it('keeps a visitor\'s choice on the next page and never on the private areas',()=>{
    const t=fakeEnv()
    setGoogtrans(t.env.doc,'en','ko',true)
    resumeIfOptedIn('en',t.env)
    expect(t.appended.some(a=>a.tag==='script')).toBe(true)
    for(const p of ['/admin/','/crm/leads','/api/x'])expect(EXCLUDED_PATH.test(p),p).toBe(true)
    const admin=fakeEnv('/admin/login')
    setGoogtrans(admin.env.doc,'en','ko',true)
    resumeIfOptedIn('en',admin.env)
    expect(admin.appended).toHaveLength(0)
  })
})

describe('English and failure',()=>{
  it('clears the cookie (host and parent-domain copies) and reloads the original',()=>{
    const t=fakeEnv()
    setGoogtrans(t.env.doc,'en','es',true)
    t.env.doc.cookie='googtrans=/en/es; path=/; domain=example.com'
    expect(t.jar.size).toBe(2)
    restoreEnglish(t.env)
    expect(t.jar.size).toBe(0)
    expect(t.opened).toEqual(['reload'])
    expect(t.rootAttrs['data-translated']).toBeUndefined()
  })
  it('falls back to the new-tab Google Translate link when the widget fails to load',()=>{
    const t=fakeEnv()
    translateInPlace({to:'zh-CN',fallbackHref:'https://translate.google.com/translate?sl=en&tl=zh-CN&u=x',env:t.env})
    t.appended.find(a=>a.tag==='script')!.onerror!()
    expect(t.opened).toEqual(['open https://translate.google.com/translate?sl=en&tl=zh-CN&u=x'])
    expect(t.jar.size).toBe(0)
  })
  it('falls back when the widget never answers within the timeout',()=>{
    const t=fakeEnv()
    translateInPlace({to:'ar',fallbackHref:'https://translate.google.com/x',env:t.env})
    t.timers[0]!()
    expect(t.opened).toEqual(['open https://translate.google.com/x'])
  })
  it('clearGoogtrans expires every parent-domain variant', ()=>{
    const t=fakeEnv('/','a.b.example.co.uk')
    for(const d of ['','b.example.co.uk','example.co.uk','co.uk'])t.env.doc.cookie=`googtrans=/en/es; path=/${d?`; domain=${d}`:''}`
    clearGoogtrans(t.env.doc,'a.b.example.co.uk')
    expect(t.jar.size).toBe(0)
  })
})

describe('the language menu',()=>{
  const menu=languageMenu('/about-ics/',{})
  it('carries the translate target on each machine-translation item',()=>{
    expect(menu.translate.map(i=>(i as {tl:string}).tl)).toEqual(TRANSLATE.map(i=>i.tl))
  })
  it('discloses the Google transfer before any selection, links both notices, and keeps a neutral note',()=>{
    const html=renderToStaticMarkup(createElement(LanguageMenu,{data:menu,variant:'desktop'}))
    expect(html).toContain('Translation runs in your browser where supported. Otherwise Google Translate is used, which sends the page text to Google.')
    expect(html).toContain('href="/cookie-notice/"')
    expect(html).toContain('href="/privacy-policy/"')
    expect(html).toContain('Machine translation. ICS does not review it.')
    expect(html).not.toContain('opens in a new tab')
  })
})

describe('the CSP',()=>{
  const policy=payloadPublicPolicy('abc123','/about-ics/')
  const dir=(name:string)=>policy.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+' '))!
  it('keeps nonce + strict-dynamic and allows no script host and no unsafe-eval / unsafe-inline for scripts',()=>{
    expect(dir('script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(dir('script-src')).not.toMatch(/unsafe-|https?:/)
  })
  it('adds only the path-restricted Google Translate sources to style, img and connect',()=>{
    expect(dir('style-src')).toBe("style-src 'self' 'unsafe-inline' https://www.gstatic.com/_/translate_http/")
    expect(dir('img-src')).toBe(`img-src 'self' data: ${GOOGLE_TRANSLATE_CSP.img.join(' ')}`)
    expect(dir('connect-src')).toBe("connect-src 'self' https://translate-pa.googleapis.com/v1/ https://www.gstatic.com/_/translate_http/")
    expect(dir('font-src')).toBe("font-src 'self'")
    expect(dir('frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(policy).not.toMatch(/(?:script-src|default-src)[^;]*translate/)
  })
  it('leaves the static (hash) policy untouched',()=>{
    expect(basePolicy(['sha256-x'])).not.toMatch(/google|gstatic/)
  })
})
