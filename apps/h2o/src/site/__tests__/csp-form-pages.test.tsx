/**
 * CSP check for the pages that serve the quote form and the chat launcher (CT 2026-10-08): in Payload mode (staging, production) the
 * policy is nonce-based with 'strict-dynamic' and no 'unsafe-inline' for scripts, and the page itself carries no executable inline
 * <script> of its own (Next stamps its own scripts with the request nonce); only the non-executable ld+json data blocks are inline.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {payloadPublicPolicy} from '../../proxy'

const env={...process.env}
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const FORM_PAGES=['/','/contact-us/','/product/frp-angles/','/cooling-tower-thailand/','/cooling-tower-parts-online/','/about-ics/']

describe('pages that serve the RFQ form and launcher',()=>{
  it('are answered with a nonce-based script policy (strict-dynamic, no unsafe-inline for scripts)',()=>{
    process.env.H2O_NATIVE_INTAKE='on'
    for(const p of FORM_PAGES){
      const policy=payloadPublicPolicy('N0nce',p)
      const script=policy.split(';').map(s=>s.trim()).find(s=>s.startsWith('script-src'))!
      expect(script,p).toContain("'nonce-N0nce'")
      expect(script,p).toContain("'strict-dynamic'")
      expect(script,p).not.toContain("'unsafe-inline'")
      expect(script,p).not.toContain("'unsafe-eval'")
    }
  })
  it('carry no executable inline script of their own: every <script> is src-loaded or ld+json data',async()=>{
    process.env.H2O_NATIVE_INTAKE='on'
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const p of FORM_PAGES){
      const html=await render(p)
      for(const tag of html.matchAll(/<script\b([^>]*)>/g)){
        const attrs=tag[1]!
        expect(/\bsrc=/.test(attrs)||/type="application\/ld\+json"/.test(attrs),`${p}: an inline executable script would be blocked by the CSP: <script${attrs}>`).toBe(true)
      }
    }
  },600000)
})
