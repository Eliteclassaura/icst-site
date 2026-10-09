// @vitest-environment happy-dom
/**
 * LANG-PROXY-NAV-1: on Google's translation proxy host the in-site link clicks keep the `_x_tr_*` parameters (Next's client router drops
 * them, and Google then says "Can't translate this page"); on any other host, and for any click that is not an ordinary same-origin link
 * click, nothing is touched.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {handleProxyClick,onTranslateProxy,proxyDestination} from '../lang/TranslateProxyNav'

const PROXY='https://staging-h2ocooling-org.translate.goog'
const QUERY='?_x_tr_sl=en&_x_tr_tl=th&_x_tr_hl=en-US&_x_tr_hist=true'
const win=(host:string,origin:string,search:string,pathname='/')=>({location:{hostname:host,origin,search,pathname,assign:vi.fn()}})
let link:HTMLAnchorElement
beforeEach(()=>{document.body.innerHTML='<div id="root"></div>'})
afterEach(()=>{document.body.innerHTML=''})
const makeLink=(href:string,attrs:Record<string,string>={})=>{
  link=document.createElement('a');link.setAttribute('href',href);link.textContent='x'
  for(const [k,v] of Object.entries(attrs))link.setAttribute(k,v)
  document.getElementById('root')!.append(link);return link
}
const click=(w:ReturnType<typeof win>,init:MouseEventInit={},el:Element=link)=>{
  const event=new MouseEvent('click',{bubbles:true,cancelable:true,button:0,...init})
  const stop=vi.spyOn(event,'stopImmediatePropagation')
  Object.defineProperty(event,'target',{value:el})
  handleProxyClick(event,w)
  return {event,stop}
}

describe('LANG-PROXY-NAV-1',()=>{
  it('recognises only the translation proxy host',()=>{
    expect(onTranslateProxy('staging-h2ocooling-org.translate.goog')).toBe(true)
    expect(onTranslateProxy('h2ocooling-com.translate.goog')).toBe(true)
    for(const h of ['h2ocooling.com','staging.h2ocooling.org','translate.goog.evil.example','evil-translate.goog.example','localhost'])expect(onTranslateProxy(h),h).toBe(false)
  })
  it('on the proxy, an internal link click loads the destination with every _x_tr_* parameter of the current address',()=>{
    const w=win('staging-h2ocooling-org.translate.goog',PROXY,QUERY)
    makeLink('/fans/')
    const {event,stop}=click(w)
    expect(event.defaultPrevented).toBe(true)
    expect(stop).toHaveBeenCalled()
    const url=new URL(w.location.assign.mock.calls[0]![0] as string)
    expect(url.origin+url.pathname).toBe(`${PROXY}/fans/`)
    expect(Object.fromEntries(url.searchParams)).toEqual({_x_tr_sl:'en',_x_tr_tl:'th',_x_tr_hl:'en-US',_x_tr_hist:'true'})
  })
  it('keeps the link\'s own query and fragment, never overwrites a parameter the link already has, and adds only _x_tr_* parameters',()=>{
    const w=win('staging-h2ocooling-org.translate.goog',PROXY,`${QUERY}&utm=1&_x_tr_pto=wapp`)
    makeLink('/product-category/fans/?page=2&_x_tr_tl=ja#top')
    click(w)
    const url=new URL(w.location.assign.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/product-category/fans/')
    expect(url.hash).toBe('#top')
    expect(Object.fromEntries(url.searchParams)).toEqual({page:'2',_x_tr_tl:'ja',_x_tr_sl:'en',_x_tr_hl:'en-US',_x_tr_hist:'true',_x_tr_pto:'wapp'})
  })
  it('takes over a click on an element inside the link (the heading or icon in a card)',()=>{
    const w=win('staging-h2ocooling-org.translate.goog',PROXY,QUERY)
    const a=makeLink('/about-ics/');const inner=document.createElement('span');a.append(inner)
    click(w,{},inner)
    expect(w.location.assign).toHaveBeenCalledTimes(1)
  })
  it('leaves untouched: an external link, a new-tab link, a download, a modifier or non-left click, mailto, tel, a same-page hash link',()=>{
    const w=win('staging-h2ocooling-org.translate.goog',PROXY,QUERY,'/fans/')
    const cases:Array<[string,string,Record<string,string>,MouseEventInit]>=[
      ['external','https://www.linkedin.com/company/x',{},{}],
      ['other host on the proxy suffix','https://evil-h2ocooling-org.translate.goog/x/',{},{}],
      ['target blank','/fans/',{target:'_blank'},{}],
      ['download','/files/a.pdf',{download:''},{}],
      ['meta key','/fans/',{},{metaKey:true}],
      ['ctrl key','/fans/',{},{ctrlKey:true}],
      ['shift key','/fans/',{},{shiftKey:true}],
      ['alt key','/fans/',{},{altKey:true}],
      ['middle button','/fans/',{},{button:1}],
      ['mailto','mailto:sales@h2ocooling.org',{},{}],
      ['tel','tel:+6626617723',{},{}],
      ['hash only','#main',{},{}],
      ['same path hash','/fans/#brands',{},{}],
    ]
    for(const [name,href,attrs,init] of cases){
      makeLink(href,attrs)
      const {event,stop}=click(w,init)
      expect(event.defaultPrevented,name).toBe(false)
      expect(stop,name).not.toHaveBeenCalled()
    }
    expect(w.location.assign).not.toHaveBeenCalled()
  })
  it('does nothing on any other host: normal visitors keep client-side navigation',()=>{
    for(const [host,origin] of [['h2ocooling.com','https://h2ocooling.com'],['staging.h2ocooling.org','https://staging.h2ocooling.org'],['localhost','http://localhost:3000']]){
      const w=win(host,origin,QUERY)
      makeLink('/fans/')
      const {event}=click(w)
      expect(event.defaultPrevented,host).toBe(false)
      expect(w.location.assign,host).not.toHaveBeenCalled()
    }
  })
  it('a click already handled (defaultPrevented) is left alone; a form post is not a link click',()=>{
    const w=win('staging-h2ocooling-org.translate.goog',PROXY,QUERY)
    makeLink('/fans/')
    const e=new MouseEvent('click',{bubbles:true,cancelable:true,button:0});e.preventDefault();Object.defineProperty(e,'target',{value:link})
    handleProxyClick(e,w)
    expect(w.location.assign).not.toHaveBeenCalled()
    const button=document.createElement('button');document.getElementById('root')!.append(button)
    click(w,{},button)
    expect(w.location.assign).not.toHaveBeenCalled()
  })
  it('proxyDestination ignores a malformed href and a javascript: link',()=>{
    makeLink('javascript:void(0)')
    expect(proxyDestination(link,{origin:PROXY,search:QUERY,pathname:'/'})).toBeNull()
  })
  it('is mounted once in the root layout, as bundled client code (no inline script, no CSS)',()=>{
    const layout=readFileSync(path.join(process.cwd(),'src/app/(site)/layout.tsx'),'utf8')
    expect(layout.match(/<TranslateProxyNav\/>/g)).toHaveLength(1)
    const src=readFileSync(path.join(process.cwd(),'src/site/lang/TranslateProxyNav.tsx'),'utf8')
    expect(src.startsWith("'use client'")).toBe(true)
    expect(src).not.toMatch(/dangerouslySetInnerHTML|<script|eval\(/)
  })
})
