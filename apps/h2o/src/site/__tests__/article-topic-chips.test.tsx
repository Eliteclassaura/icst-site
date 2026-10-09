// @vitest-environment happy-dom
/**
 * ARTICLE-LAYOUT-1: the index topic chips, in a DOM. Default (URL scheme off): a click filters the cards on the page, updates the
 * count and keeps the topic in the fragment; no navigation. Scheme on: the links are plain navigation and nothing is filtered.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {ArticleTopicChips} from '../ArticleTopicChips'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
const topics=[{slug:'a',name:'Topic A',count:2},{slug:'b',name:'Topic B',count:1}]
let host:HTMLElement,root:Root
const mount=async(urls:boolean)=>{
  document.body.innerHTML='<span data-article-count>3 articles</span><ul><li data-article-card data-topic="a"></li><li data-article-card data-topic="a"></li><li data-article-card data-topic="b"></li><li data-article-card></li></ul><div id="host"></div>'
  host=document.getElementById('host')!
  root=createRoot(host)
  await act(async()=>{root.render(<ArticleTopicChips label="Browse by topic" allLabel="All topics" countTemplate="{n} articles" topics={topics} total={4} urls={urls}/>)})
}
const cards=()=>[...document.querySelectorAll<HTMLElement>('[data-article-card]')]
beforeEach(()=>{window.location.hash=''})
afterEach(async()=>{await act(async()=>root.unmount())})

describe('topic chips',()=>{
  it('are real links, "All topics" first, none pressed but All',async()=>{
    await mount(false)
    const links=[...host.querySelectorAll('a')]
    expect(links.map(a=>a.textContent)).toEqual(['All topics','Topic A','Topic B'])
    expect(links.map(a=>a.getAttribute('href'))).toEqual(['/tech-articles/','/tech-articles/#topic-a','/tech-articles/#topic-b'])
    expect(host.querySelector('[aria-current="true"]')?.textContent).toBe('All topics')
  })
  it('filter the cards, update the count and keep the topic in the fragment',async()=>{
    await mount(false)
    await act(async()=>{host.querySelectorAll('a')[1]!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}))})
    expect(cards().map(c=>c.hidden)).toEqual([false,false,true,true])
    expect(document.querySelector('[data-article-count]')!.textContent).toBe('2 articles')
    expect(window.location.hash).toBe('#topic-a')
    expect(host.querySelector('[aria-current="true"]')?.textContent).toBe('Topic A')
    await act(async()=>{host.querySelectorAll('a')[0]!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}))})
    expect(cards().every(c=>!c.hidden)).toBe(true)
    expect(document.querySelector('[data-article-count]')!.textContent).toBe('4 articles')
    expect(window.location.hash).toBe('')
  })
  it('apply a topic that is already in the address on load',async()=>{
    window.location.hash='#topic-b'
    await mount(false)
    expect(cards().map(c=>c.hidden)).toEqual([true,true,false,true])
    expect(document.querySelector('[data-article-count]')!.textContent).toBe('1 articles')
  })
  it('scheme on: topic URLs, plain navigation, no filtering',async()=>{
    await mount(true)
    expect([...host.querySelectorAll('a')].map(a=>a.getAttribute('href'))).toEqual(['/tech-articles/','/tech-articles/topic/a/','/tech-articles/topic/b/'])
    const click=new MouseEvent('click',{bubbles:true,cancelable:true,button:0})
    await act(async()=>{host.querySelectorAll('a')[1]!.dispatchEvent(click)})
    expect(click.defaultPrevented).toBe(false)
    expect(cards().every(c=>!c.hidden)).toBe(true)
  })
})
