/**
 * Design R3.2 (owner-approved favicon B, CT 2026-10-06): the ICS drop mark on an ICS-blue tile. The files come byte-for-byte
 * from outputs/H2O_FAVICON_B_2026-10-06.zip (public/icon.svg is its icon-small.svg, the tab-size cut). The site, the CRM
 * workspace and the Payload admin link the same set; the proxy passes each file through like favicon.ico (no page CSP, no
 * ledger lookup) with the policy's robots floor.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,renameSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

const APP=process.cwd()
const O='https://h2ocooling.com'
const FILES:Record<string,string>={
  'favicon.ico':'970c7093d601e3a81b5ea130616e88fe6e14873f109cbf8a9135ebbcb1bc9199',
  'icon.svg':'9214440612dc75b37b5c99a1f2a1eb8ddc5f14495a26fc3fd49506580125512a',
  'apple-touch-icon.png':'9fa6d0e95b009823263469f3f07b8b1bd98c3ab469eb4c1ac068ec4457ca24b5',
  'icon-192.png':'7d3b7eef5698d6b4afa1986d0151b85b26ef3ce870c67b6bc3674786d1753d7e',
  'icon-512.png':'81270bd825c8137c56918f95a3e0e1af43105a805d1a42750b8025a236703cf8',
  'site.webmanifest':'a234bb78bf96d5a36c3ae59fec3cca52d0d9e59b7d698ab955be74e6101a4a02',
}
const read=(f:string)=>readFileSync(path.join(APP,'public',f))
const pngSize=(b:Buffer)=>[b.readUInt32BE(16),b.readUInt32BE(20)]

describe('the favicon files',()=>{
  it('are the approved bytes',()=>{
    for(const [f,sha] of Object.entries(FILES))expect(createHash('sha256').update(read(f)).digest('hex'),f).toBe(sha)
  })
  it('favicon.ico holds 16, 32 and 48; the PNGs have their sizes; the manifest names both home-screen icons',()=>{
    const ico=read('favicon.ico')
    expect(ico.readUInt16LE(2)).toBe(1)
    const count=ico.readUInt16LE(4)
    expect([...Array(count).keys()].map(i=>ico[6+i*16]||256).sort((a,b)=>a-b)).toEqual([16,32,48])
    expect(pngSize(read('apple-touch-icon.png'))).toEqual([180,180])
    expect(pngSize(read('icon-192.png'))).toEqual([192,192])
    expect(pngSize(read('icon-512.png'))).toEqual([512,512])
    const manifest=JSON.parse(read('site.webmanifest').toString('utf8')) as {icons:Array<{src:string;sizes:string;type:string}>;theme_color:string}
    expect(manifest.icons).toEqual([{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png'}])
    expect(manifest.theme_color).toBe('#1B60A8')
    expect(read('icon.svg').toString('utf8')).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 256 256">/)
    // the emblem source stays as it was
    expect(createHash('sha256').update(read('brand/ics-emblem-favicon-source.png')).digest('hex')).toMatch(/^[0-9a-f]{64}$/)
  })
  it('the site, the CRM workspace and the Payload admin link the same set',async()=>{
    const {metadata}=await import('../../app/(site)/layout')
    expect(metadata.icons).toEqual({icon:[{url:'/favicon.ico',sizes:'any'},{url:'/icon.svg',type:'image/svg+xml'}],apple:'/apple-touch-icon.png'})
    expect(metadata.manifest).toBe('/site.webmanifest')
    const crm=readFileSync(path.join(APP,'src/app/(crm)/layout.tsx'),'utf8')
    expect(crm).toContain("icons: {icon: [{url: '/favicon.ico', sizes: 'any'}, {url: '/icon.svg', type: 'image/svg+xml'}], apple: '/apple-touch-icon.png'}")
    const payload=readFileSync(path.join(APP,'src/payload.config.ts'),'utf8')
    for(const url of ['/icon.svg','/favicon.ico','/apple-touch-icon.png'])expect(payload).toContain(`url: '${url}'`)
  })
})

describe('the proxy passes the favicon set through (payload runtime)',()=>{
  const env={...process.env}
  beforeEach(()=>{
    vi.resetModules()
    const root=mkdtempSync(path.join(tmpdir(),'h2o-favicon-'))
    mkdirSync(path.join(root,'generations','g'),{recursive:true})
    // a ledger redirect on one of the names would be ignored: the files are answered before any ledger lookup
    writeFileSync(path.join(root,'generations','g','ledger.json'),JSON.stringify({routes:[{path:'/',routeId:'T-home',state:'PUBLIC',export:true,indexable:true,sitemap:true,canonical:`${O}/`,routeClass:'pages'}],redirects:[{source:'/icon.svg',destination:'/',status:301}]}))
    mkdirSync(path.join(root,'releases'),{recursive:true})
    writeFileSync(path.join(root,'releases','r-g.json'),JSON.stringify({format:1,id:'r-g',content:'g',search:'s-g'}))
    symlinkSync('releases/r-g.json',path.join(root,'release.tmp'))
    renameSync(path.join(root,'release.tmp'),path.join(root,'release'))
    Object.assign(process.env,{H2O_CONTENT_SOURCE:'payload',CONTENT_SNAPSHOT_DIR:root})
    delete process.env.H2O_INDEXING_POLICY
  })
  afterEach(()=>{process.env={...env}})
  for(const policy of [undefined,'production'])it(`policy ${policy??'private'}: every file passes to the static server with the robots floor and no page CSP`,async()=>{
    if(policy)process.env.H2O_INDEXING_POLICY=policy
    const {proxy}=await import('../../proxy')
    const {NextRequest}=await import('next/server')
    for(const f of Object.keys(FILES)){
      const res=proxy(new NextRequest(`${O}/${f}`))
      expect(res.headers.get('x-middleware-next'),f).toBe('1')
      expect(res.status,f).toBe(200)
      expect(res.headers.get('location'),f).toBeNull()
      expect(res.headers.get('content-security-policy'),f).toBeNull()
      expect(res.headers.get('x-robots-tag'),f).toBe(policy==='production'?null:'noindex, nofollow')
    }
  })
  it('repository mode passes them through too',async()=>{
    delete process.env.H2O_CONTENT_SOURCE
    const {proxy}=await import('../../proxy')
    const {NextRequest}=await import('next/server')
    for(const f of Object.keys(FILES))expect(proxy(new NextRequest(`${O}/${f}`)).headers.get('x-middleware-next'),f).toBe('1')
  })
})
