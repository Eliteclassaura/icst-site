/**
 * LANG-2.2 N1 (Security Auditor): a signed-in staff session is marked by the proxy, from the Payload auth cookie's presence only,
 * so the layout renders the language menu as plain links. Node environment (the cookie header is forbidden in a DOM Request).
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mkdirSync,mkdtempSync,renameSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

const env0={...process.env}
afterEach(()=>{process.env={...env0}})

describe('N1: a signed-in staff session (proxy → layout)',()=>{
  const O='https://h2ocooling.com'
  beforeEach(()=>{
    vi.resetModules()
    const root=mkdtempSync(path.join(tmpdir(),'h2o-lang22-'))
    mkdirSync(path.join(root,'generations','g'),{recursive:true})
    writeFileSync(path.join(root,'generations','g','ledger.json'),JSON.stringify({routes:[{path:'/a/',routeId:'T',state:'PUBLIC',export:true,indexable:true,sitemap:true,canonical:O+'/a/',routeClass:'pages',previousCanonical:'',sourceRobots:'index, follow',matchedArticle:false,sourceFile:'x',sourceSha256:null,releaseOverride:null,redirect:null}],redirects:[]}))
    mkdirSync(path.join(root,'releases'),{recursive:true})
    writeFileSync(path.join(root,'releases','r-g.json'),JSON.stringify({format:1,id:'r-g',content:'g',search:'s-g'}))
    symlinkSync('releases/r-g.json',path.join(root,'release.tmp'));renameSync(path.join(root,'release.tmp'),path.join(root,'release'))
    Object.assign(process.env,{H2O_CONTENT_SOURCE:'payload',CONTENT_SNAPSHOT_DIR:root})
  })
  const call=async(cookie?:string,forged?:string)=>{
    const {proxy}=await import('../../proxy');const {NextRequest}=await import('next/server')
    const headers:Record<string,string>={...(cookie?{cookie}:{}),...(forged?{'x-h2o-staff':forged}:{})}
    return proxy(new NextRequest(`${O}/a/`,{headers}))
  }
  it('marks the request staff only when the Payload auth cookie is present, never from a client-supplied header, and keeps staff pages out of caches',async()=>{
    const anon=await call(undefined,'1')
    expect(anon.headers.get('x-middleware-request-x-h2o-staff')).toBe('0')
    expect(anon.headers.get('cache-control')).not.toBe('private, no-store')
    const staff=await call('payload-token=abc')
    expect(staff.headers.get('x-middleware-request-x-h2o-staff')).toBe('1')
    expect(staff.headers.get('cache-control')).toBe('private, no-store')
  })
})

