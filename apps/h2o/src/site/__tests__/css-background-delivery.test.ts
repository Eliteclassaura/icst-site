/**
 * CSS background delivery (Control Tower, 2026-10-02): stylesheet backgrounds bypass deliverySrc(), so every frozen
 * salmon-parity.css background that has a verified derivative is delivered by an exact-selector override in
 * salmon-parity-overrides.css (loaded right after it). No other stylesheet may reference a mapped original.
 */
import {describe,expect,it} from 'vitest'
import {readdirSync,readFileSync} from 'node:fs'
import path from 'node:path'

const dir=path.join(process.cwd(),'src/app/(site)')
const css=(file:string)=>readFileSync(path.join(dir,file),'utf8')
const items=(JSON.parse(readFileSync(path.join(process.cwd(),'content/media-derivatives.json'),'utf8')) as {items:Array<{src:string;derivative:string}>}).items
const derivative=new Map(items.map(item=>[item.src,item.derivative]))
const selectorList=(raw:string)=>raw.split(',').map(part=>part.trim()).join(',\n')

describe('CSS background delivery',()=>{
  it('every frozen Salmon background with a derivative has an exact-selector override to that derivative',()=>{
    const frozen=css('salmon-parity.css'),overrides=css('salmon-parity-overrides.css')
    const found=[...frozen.matchAll(/(?:^|})([^{}@]+)\{[^{}]*?background-image:url\("([^"]+)"\)/g)].filter(([,,url])=>derivative.has(url!))
    expect(found.length).toBe(10)
    for(const [,selector,url] of found)expect(overrides,url).toContain(`${selectorList(selector!)} {\n  background-image: url("${derivative.get(url!)}");\n}`)
    expect(css('salmon-parity-overrides.css').match(/\/media\/derivatives\//g)).toHaveLength(found.length)
  })
  it('no other stylesheet references a mapped original',()=>{
    for(const file of readdirSync(dir).filter(name=>name.endsWith('.css')&&name!=='salmon-parity.css'))for(const src of derivative.keys())expect(css(file),`${file}: ${src}`).not.toContain(src)
  })
  it('the overrides load immediately after the frozen stylesheet',()=>{
    expect(readFileSync(path.join(dir,'layout.tsx'),'utf8')).toMatch(/import '\.\/salmon-parity\.css'\nimport '\.\/salmon-parity-overrides\.css'\n/)
  })
})
