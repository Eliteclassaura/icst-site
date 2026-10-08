/**
 * LEGAL-1.1 (Design Director VISUAL_REVISE, CSS only, 2026-10-08): the legal pages get their gutter and top space, the tables stack
 * on a phone, the cookie names break only after dots, and the footer legal links are 44 px tap targets.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {markdownBlocks} from '../markdown-lite'

const env={...process.env}
afterEach(()=>{process.env={...env}})
const css=readFileSync(path.join(process.cwd(),'src/app/(site)/design-r5.css'),'utf8')
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))

describe('LEGAL-1.1',()=>{
  it('L1/L2: the legal main carries a 16 px gutter at 390 and the top space, at a specificity that beats the page reset',()=>{
    expect(css).toMatch(/\.luxury-site \.legal-main \{[^}]*padding-block: clamp\(32px, 3\.4vw, 48px\) clamp\(48px, 6vw, 80px\);[^}]*padding-inline: clamp\(16px, 4vw, 48px\);/)
    // clamp(16px, 4vw, 48px) is 16 px at 390 (4vw = 15.6) and 48 px at 1440; the top space is 32 px at 390 and 48 px at 1440
    expect(Math.max(16,Math.min(390*0.04,48))).toBe(16)
    expect(Math.round(Math.max(32,Math.min(390*0.034,48)))).toBe(32)
    expect(Math.round(Math.max(32,Math.min(1440*0.034,48)))).toBe(48)
  })
  it('L3: a table row carries its column label, and the stacked rows are defined for a phone',()=>{
    const html=renderToStaticMarkup(<>{markdownBlocks('| Office | Location |\n|---|---|\n| USA | Lakewood |\n')}</>)
    expect(html).toContain('<th scope="row">USA</th><td data-label="Location">Lakewood</td>')
    expect(css).toMatch(/@media \(width <= 600px\) \{\s*\.legal-table \{\s*overflow-x: visible;/)
    expect(css).toMatch(/\.legal-table :is\(table, tbody, tr, th, td\) \{\s*display: block;/)
    expect(css).toMatch(/\.legal-table td\[data-label\]::before \{[^}]*content: attr\(data-label\) ': ';/)
  })
  it('S1: a cookie name breaks only after a dot',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const html=await render('/cookie-notice/')
    expect(html).toContain('<code>h2o.<wbr/>rfq.<wbr/>draft.<wbr/>v1</code>')
    expect(html).toContain('<code>h2o.<wbr/>rfq.<wbr/>attribution.<wbr/>v1</code>')
    expect(css).toMatch(/\.legal-doc code \{[^}]*overflow-wrap: normal;[^}]*word-break: keep-all;/)
  },240000)
  it('S2: the footer legal links are 44 px tap targets',()=>{
    expect(css).toMatch(/\.global-chrome \.sp-footer-legal a \{\s*align-items: center;\s*display: inline-flex;\s*min-block-size: 44px;/)
  })
})
