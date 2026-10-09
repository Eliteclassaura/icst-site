/**
 * FOOTER-ALIGN-1 (owner request via CT 2026-10-08): the Locations row starts on the grid's left edge with even spacing; the copyright
 * line and the four legal links share one row and baseline, copyright left and links right, stacked and left-aligned on phones.
 * CSS only: the footer markup, copy and links are unchanged (the legal row stays; see footer-fix-1 and the LEGAL tests).
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {describe,expect,it} from 'vitest'

const css=(file:string)=>readFileSync(path.join(process.cwd(),'src/app/(site)',file),'utf8')
const block=(sheet:string,selector:string)=>sheet.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\>]/g,'\\$&')} \\{([^}]*)\\}`))?.[1]??''

describe('FOOTER-ALIGN-1',()=>{
  const families=css('salmon-families.css'),r5=css('design-r5.css')
  it('the legal row: left-aligned copyright, links pushed to the right edge, one baseline',()=>{
    const row=block(families,'.global-chrome .sp-footer-legal')
    expect(row).toContain('align-items: baseline')
    expect(row).toContain('justify-content: flex-start')
    expect(row).toContain('text-align: start')
    expect(row).not.toContain('text-align: center')
    expect(block(families,'.global-chrome .sp-footer-legal > a:first-of-type')).toContain('margin-inline-start: auto')
  })
  it('below 900 px the copyright takes its own line and the links start on the left edge',()=>{
    expect(families).toMatch(/@media \(max-width: 899\.98px\) \{\s*\.global-chrome \.sp-footer-legal > span \{\s*flex: 0 0 100%;/)
    expect(families).toMatch(/@media \(max-width: 899\.98px\)[\s\S]*?\.sp-footer-legal > a:first-of-type \{\s*margin-inline-start: -4px;/)
  })
  it('the Locations links have no minimum width (even spacing) and hang their padding outside the edge on phones',()=>{
    const link=block(r5,'.global-chrome .sp-footer-locations a')
    expect(link).not.toContain('min-inline-size')
    expect(link).toContain('min-block-size: 44px')
    expect(r5).toMatch(/@media \(max-width: 600px\) \{\s*\.global-chrome \.sp-footer-locations ul \{\s*margin-inline-start: -4px;/)
  })
})

describe('FOOTER-ALIGN-1.1: the last row clears the corner launcher',()=>{
  const families=css('salmon-families.css')
  const launcher=readFileSync(path.join(process.cwd(),'src/rfq-native/NativeRfq.module.css'),'utf8')
  const px=(sheet:string,selector:string,prop:string)=>Number(new RegExp(`${prop}: (?:max\\()?(\\d+)px`).exec(block(sheet,selector))?.[1])
  it('the footer end padding from 768px is at least the launcher height plus its bottom offset (read from the launcher CSS)',()=>{
    const height=px(launcher,'.launcher','min-block-size'),offset=px(launcher,'.launcher','inset-block-end')
    expect(height).toBeGreaterThanOrEqual(48)
    expect(offset).toBeGreaterThanOrEqual(20)
    const m=/@media \(min-width: 768px\) \{\s*\.global-chrome \.sp-footer \{\s*padding-block-end: calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)/.exec(families)
    expect(m,'footer end padding rule').toBeTruthy()
    expect(Number(m![1])).toBeGreaterThanOrEqual(height+offset+8)
  })
})
