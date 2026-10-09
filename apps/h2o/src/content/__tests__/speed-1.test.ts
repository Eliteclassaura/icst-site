/**
 * SPEED-1: (1) one page read per request: metadata and page share one `resolvePublicPath` result; (2) the staging-only server-timing meta
 * tag: durations only, never on the production origin.
 */
import {beforeEach,describe,expect,it,vi} from 'vitest'

const find=vi.fn()
const getPayload=vi.fn(async()=>({find,db:{}}))
vi.mock('payload',()=>({getPayload:(...a:unknown[])=>getPayload(...(a as []))}))
vi.mock('@payload-config',()=>({default:{}}))
vi.mock('next/headers',()=>({draftMode:async()=>({isEnabled:false}),headers:async()=>new Headers()}))
vi.mock('../revocation',()=>({computeRevocations:vi.fn(async()=>({routeIds:new Set(),paths:new Set(),pending:0,oldestPendingAt:null,releaseId:null}))}))
// outside a server render React's `cache` is a plain call; a memoiser stands in for one render's cache scope
vi.mock('react',async(orig)=>({...((await orig()) as Record<string,unknown>),cache:<F extends (...a:never[])=>unknown>(fn:F)=>{const m=new Map<string,unknown>();return ((...a:never[])=>{const k=JSON.stringify(a);if(!m.has(k))m.set(k,fn(...a));return m.get(k)}) as F}}))

const record={routeId:'SALMON-pages-1891',path:'/contact-us/',family:'salmon',routeClass:'pages',title:'Contact',seo:{},_status:'published',disposition:{state:'PUBLIC',export:true},document:{routeId:'SALMON-pages-1891',children:[],seo:{}},source:{},slots:[],restoredSections:[]}
beforeEach(()=>{find.mockReset();getPayload.mockClear();find.mockResolvedValue({docs:[record]});process.env.H2O_CONTENT_SOURCE='payload'})

describe('SPEED-1: one read per request',()=>{
  it('two resolutions of the same path in one request read the database once; another path reads again',async()=>{
    const {resolvePublicPath}=await import('../page-bridge')
    const a=await resolvePublicPath('/contact-us/')
    const b=await resolvePublicPath('/contact-us/')
    expect(a).toBe(b)
    expect(a?.record.path).toBe('/contact-us/')
    expect(find).toHaveBeenCalledTimes(1)
    await resolvePublicPath('/fans/')
    expect(find).toHaveBeenCalledTimes(2)
  })
})

describe('SPEED-1: staging-only server-timing meta',()=>{
  it('is enabled for every policy except "production"',async()=>{
    const {serverTimingEnabled}=await import('../server-timing')
    for(const v of [undefined,'','private','staging','Production','off'])expect(serverTimingEnabled({H2O_INDEXING_POLICY:v} as never),String(v)).toBe(true)
    expect(serverTimingEnabled({H2O_INDEXING_POLICY:'production'} as never)).toBe(false)
  })
  it('timings use the Server-Timing syntax, durations only, in first-recorded order',async()=>{
    const {Timings}=await import('../server-timing')
    const t=new Timings()
    expect(t.value()).toBeUndefined()
    t.add('db',12.34);t.add('compose',1.2);t.add('db',0.66)
    expect(t.value()).toBe('db;dur=13.0, compose;dur=1.2')
  })
  it('withServerTiming adds the meta tag outside production and never in production or when nothing was timed',async()=>{
    const {Timings,withServerTiming}=await import('../server-timing')
    const t=new Timings();t.add('db',5)
    const m={title:'x',other:{a:'b'}}
    expect(withServerTiming(m,t,{H2O_INDEXING_POLICY:'private'} as never)).toEqual({title:'x',other:{a:'b','h2o-server-timing':'db;dur=5.0'}})
    expect(withServerTiming(m,t,{H2O_INDEXING_POLICY:'production'} as never)).toBe(m)
    expect(withServerTiming(m,new Timings(),{} as never)).toBe(m)
  })
  it('timed records the duration (and still returns the value or rethrows) only when enabled',async()=>{
    const {Timings,timed}=await import('../server-timing')
    const on=new Timings(),off=new Timings()
    expect(await timed('x',()=>7,on,{} as never)).toBe(7)
    expect(on.value()).toMatch(/^x;dur=\d/)
    expect(await timed('x',()=>7,off,{H2O_INDEXING_POLICY:'production'} as never)).toBe(7)
    expect(off.value()).toBeUndefined()
    await expect(timed('boom',()=>{throw new Error('e')},on,{} as never)).rejects.toThrow('e')
    expect(on.value()).toContain('boom;dur=')
  })
  it('a resolved page records its db and compose durations in the request collector',async()=>{
    delete process.env.H2O_INDEXING_POLICY
    const {resolvePublicPath}=await import('../page-bridge')
    const {requestTimings}=await import('../server-timing')
    await resolvePublicPath('/contact-us/')
    const value=requestTimings().value()??''
    for(const name of ['payload','revocations','db','compose'])expect(value,name).toMatch(new RegExp(`${name};dur=\\d+\\.\\d`))
    expect(value).not.toMatch(/contact|SALMON|slug|path/) // durations only
  })
})
