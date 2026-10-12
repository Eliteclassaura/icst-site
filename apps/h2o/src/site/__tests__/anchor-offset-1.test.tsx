/** F9 ANCHOR-OFFSET-1: the jump to #request-a-quote on /contact-us/ shows the section heading, not only the form. */
import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {ANCHOR_MARGIN,scrollTopFor} from '../QuoteAnchorOffset'
import {DesignR3StickyBar} from '../DesignR3StickyBar'

describe('ANCHOR-OFFSET-1',()=>{
  it('puts the heading a small margin below the top edge, whatever its distance (QA: heading top -559 after the jump)',()=>{
    expect(scrollTopFor(-559,1200)).toBe(1200-559-ANCHOR_MARGIN)
    expect(scrollTopFor(40,0)).toBe(40-ANCHOR_MARGIN)
    expect(scrollTopFor(-900,300)).toBe(0) // never above the page top
  })
  it('is mounted on /contact-us/ only, against the section heading id that the contact composition renders',()=>{
    const bar=readFileSync(path.join(process.cwd(),'src/site/DesignR3StickyBar.tsx'),'utf8')
    expect(bar).toContain(`routePath==='/contact-us/'?<QuoteAnchorOffset hash="#request-a-quote" headingId="dr3-start-title"/>`)
    expect(readFileSync(path.join(process.cwd(),'src/site/ContactComposition.tsx'),'utf8')).toContain('id="dr3-start-title"')
    expect(readFileSync(path.join(process.cwd(),'src/rfq-native/NativeRfqForm.tsx'),'utf8')).toContain('id="request-a-quote"')
    expect(()=>renderToStaticMarkup(<DesignR3StickyBar routePath="/contact-us/"/>)).not.toThrow()
    expect(()=>renderToStaticMarkup(<DesignR3StickyBar routePath="/fans/"/>)).not.toThrow()
  })
})
