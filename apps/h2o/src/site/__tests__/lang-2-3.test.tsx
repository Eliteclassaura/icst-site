// @vitest-environment happy-dom
/**
 * LANG-2.3 (Auditor N-a, N-b): the translation never wraps text inside the React-managed native RFQ panel, and the Google path
 * keeps at most one securitypolicyviolation listener per page and drops it once the widget is up.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {SKIP_SELECTOR,collectTextNodes,wrapProtectedNames} from '../lang/translate-device'
import {translateInPlace} from '../lang/translate-widget'

afterEach(()=>{document.body.innerHTML='';document.head.innerHTML='';document.documentElement.removeAttribute('data-translated');document.documentElement.removeAttribute('data-translated-by')})

describe('N-a: the native RFQ panel is left alone',()=>{
  it('does not wrap protected names inside the panel or the launcher, so React can still unmount them',()=>{
    document.body.innerHTML='<p id="page">About ICS</p><button data-rfq-launcher>Ask ICS</button><div id="host"><div data-rfq-panel><p>Your project at Keramasan, ICS</p><button id="step">Next</button></div></div>'
    const panel=document.querySelector('[data-rfq-panel]')!
    const before=panel.innerHTML
    wrapProtectedNames(document)
    expect(panel.innerHTML).toBe(before)
    expect(document.querySelector('[data-rfq-launcher]')!.innerHTML).toBe('Ask ICS')
    expect(document.querySelectorAll('#page [data-lang-keep]')).toHaveLength(1) // the page body is still protected
    // a framework-style removal of the panel's own text node and of the panel itself must not throw
    const text=panel.querySelector('p')!.firstChild!
    expect(()=>{text.parentNode!.removeChild(text);document.getElementById('host')!.removeChild(panel)}).not.toThrow()
  })
  it('keeps the panel out of the on-device walk too',()=>{
    document.body.innerHTML='<p>Hello</p><div data-rfq-panel><p>Step one</p></div>'
    expect(SKIP_SELECTOR).toContain('[data-rfq-panel]')
    expect(collectTextNodes(document).map(n=>n.nodeValue)).toEqual(['Hello'])
  })
})

describe('N-b: one violation listener, removed when the widget is up',()=>{
  const violation=()=>Object.assign(new Event('securitypolicyviolation'),{effectiveDirective:'script-src-elem',blockedURI:'https://translate.google.com/translate_a/element.js'})
  function setup(){
    const opened:string[]=[]
    let listeners=0
    const appendHead=document.head.appendChild.bind(document.head)
    // keep the script element (the code looks for it) but never let happy-dom try to fetch it
    document.head.appendChild=(<T extends Node>(n:T)=>{(n as unknown as HTMLScriptElement).removeAttribute?.('src');return appendHead(n)}) as typeof document.head.appendChild
    const add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document)
    document.addEventListener=((t:string,f:EventListenerOrEventListenerObject,o?:boolean|AddEventListenerOptions)=>{if(t==='securitypolicyviolation')listeners++;add(t,f,o)}) as typeof document.addEventListener
    document.removeEventListener=((t:string,f:EventListenerOrEventListenerObject,o?:boolean|EventListenerOptions)=>{if(t==='securitypolicyviolation')listeners--;remove(t,f,o)}) as typeof document.removeEventListener
    const win={location:{pathname:'/about-ics/',hostname:'www.example.com',protocol:'https:',assign:(u:string)=>{opened.push('assign '+u)},reload:()=>{}},open:(u:string)=>{opened.push('open '+u);return {}},setTimeout:()=>0,google:undefined as unknown} as unknown as Window
    return {win,opened,count:()=>listeners,restore:()=>{document.head.appendChild=appendHead as never;document.addEventListener=add as never;document.removeEventListener=remove as never}}
  }
  it('a violation after a successful load does not navigate',()=>{
    const t=setup()
    try{
      translateInPlace({to:'es',fallbackHref:'https://translate.google.com/x',env:{doc:document,win:t.win}})
      expect(t.count()).toBe(1)
      ;(t.win as unknown as {google:unknown}).google={translate:{TranslateElement:class{}}}
      ;(t.win as unknown as Record<string,()=>void>).googleTranslateElementInit!()
      expect(t.count()).toBe(0)
      document.dispatchEvent(violation())
      expect(t.opened).toEqual([])
      expect(document.documentElement.getAttribute('data-translated')).toBe('es')
    }finally{t.restore()}
  })
  it('a violation while the widget is still loading goes straight to the new tab, once, and drops the listener',()=>{
    const t=setup()
    try{
      translateInPlace({to:'ko',fallbackHref:'https://translate.google.com/y',env:{doc:document,win:t.win}})
      document.dispatchEvent(violation());document.dispatchEvent(violation())
      expect(t.opened).toEqual(['open https://translate.google.com/y'])
      expect(t.count()).toBe(0)
    }finally{t.restore()}
  })
})
