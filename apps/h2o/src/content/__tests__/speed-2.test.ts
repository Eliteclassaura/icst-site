/**
 * SPEED-2: the per-instance cache of composed public pages. A staff edit or publish is visible on the next request; preview/draft reads are never
 * cached; H2O_PAGE_CACHE=off disables it without a rebuild; any cache error falls through to the normal read; bounded in entries, bytes and age.
 */
import {beforeEach,describe,expect,it,vi} from 'vitest'

type Rec=Record<string,unknown>
let db:Rec,lightFails=false,previewUser:unknown=null
const calls={light:0,full:0}
const find=vi.fn(async(args:{select:Record<string,boolean>})=>{
  const light=Object.keys(args.select).length<=3&&!args.select.document
  if(light){calls.light++;if(lightFails)throw new Error('db hiccup');return {docs:[{updatedAt:db.updatedAt,_status:db._status,disposition:db.disposition}]}}
  calls.full++
  return {docs:[structuredClone(db)]}
})
vi.mock('payload',()=>({getPayload:async()=>({find:(a:never)=>find(a),db:{},auth:async()=>({user:previewUser})})}))
vi.mock('@payload-config',()=>({default:{}}))
vi.mock('next/headers',()=>({draftMode:async()=>({isEnabled:previewUser!==null}),headers:async()=>new Headers()}))
vi.mock('../access',()=>({isEditorialReader:()=>true}))
vi.mock('../revocation',()=>({computeRevocations:vi.fn(async()=>({routeIds:new Set(),paths:new Set(),pending:0,oldestPendingAt:null,releaseId:null}))}))
vi.mock('../release',()=>({currentRelease:()=>({id:'rel-1'})}))
vi.mock('react',async(orig)=>({...((await orig()) as Record<string,unknown>),cache:<F>(fn:F)=>fn})) // each call stands for its own request

const base=(over:Rec={}):Rec=>({routeId:'SALMON-pages-1891',path:'/contact-us/',family:'salmon',routeClass:'pages',title:'Contact',seo:{},_status:'published',disposition:{state:'PUBLIC',export:true},source:{},slots:[],restoredSections:[],updatedAt:'2026-10-09T10:00:00.000Z',document:{routeId:'SALMON-pages-1891',title:'Contact',children:['x'],seo:{}},...over})
const title=(r:{doc?:unknown}|null)=>((r?.doc??null) as {title?:string}|null)?.title
beforeEach(async()=>{
  db=base();lightFails=false;previewUser=null;calls.light=0;calls.full=0;find.mockClear()
  delete process.env.H2O_PAGE_CACHE
  const {pageCache}=await import('../page-cache');pageCache.clear()
})
const resolve=async(p='/contact-us/')=>(await import('../page-bridge')).resolvePublicPath(p)

describe('SPEED-2: reuse while unchanged, fresh on the next request after an edit or publish',()=>{
  it('first request composes (light + full read); the next ones with an unchanged record read only the version and reuse the composed page',async()=>{
    const a=await resolve();expect(calls).toEqual({light:1,full:1})
    const b=await resolve();expect(calls).toEqual({light:2,full:1})
    await resolve();expect(calls).toEqual({light:3,full:1})
    expect(a?.dispatchPath).toBe(b?.dispatchPath);expect(b?.record.path).toBe('/contact-us/')
  })
  it('edit → read-back: a changed updatedAt shows the new content on the very next request; an unpublish is a 404 at once; a republish is current at once',async()=>{
    expect(title(await resolve())).toBeUndefined() // salmon family: the page document, not an editorial one
    const d1=(await resolve())
    expect((d1?.record as {title:string}).title).toBe('Contact')
    // a staff edit: new record version (title changed, updatedAt moved)
    db=base({title:'Contact ICS',updatedAt:'2026-10-09T10:00:07.000Z'})
    const edited=await resolve()
    expect((edited?.record as {title:string}).title).toBe('Contact ICS')
    expect(calls.full).toBe(2)
    // unpublish
    db=base({title:'Contact ICS',_status:'draft',updatedAt:'2026-10-09T10:00:09.000Z'})
    expect(await resolve()).toBeNull()
    // republish with new words
    db=base({title:'Contact us now',updatedAt:'2026-10-09T10:00:12.000Z'})
    expect(((await resolve())?.record as {title:string}).title).toBe('Contact us now')
  })
  it('a new release id is a miss; the cached copy is isolated (mutating a served page never reaches the next request)',async()=>{
    const {pageCache}=await import('../page-cache')
    await resolve()
    const hit=await resolve() as {doc?:Record<string,unknown>}|null
    ;(hit as unknown as {record:{title:string}}).record.title='MUTATED'
    const again=await resolve()
    expect((again?.record as {title:string}).title).not.toBe('MUTATED')
    expect(pageCache.get('/contact-us/','2026-10-09T10:00:00.000Z','rel-2')).toBeUndefined()
  })
})

describe('SPEED-2: never cached, kill switch, fail open',()=>{
  it('a signed-in preview/draft read is never cached and never uses the cache',async()=>{
    previewUser={id:1,role:'editor'}
    const {pageCache}=await import('../page-cache')
    await resolve();await resolve()
    expect(calls).toEqual({light:0,full:2})
    expect(pageCache.size).toBe(0)
  })
  it('H2O_PAGE_CACHE=off: every request takes the normal read, no version read, nothing stored',async()=>{
    process.env.H2O_PAGE_CACHE='off'
    const {pageCache}=await import('../page-cache')
    await resolve();await resolve()
    expect(calls).toEqual({light:0,full:2})
    expect(pageCache.size).toBe(0)
    delete process.env.H2O_PAGE_CACHE
    await resolve();await resolve()
    expect(calls.full).toBe(3) // on again: one miss, then a hit
  })
  it('fail open: an error in the version read falls through to the normal read and still serves the page',async()=>{
    await resolve()
    lightFails=true
    const r=await resolve()
    expect((r?.record as {title:string}).title).toBe('Contact')
    expect(calls.full).toBe(2)
  })
  it('alias, search and withdrawn pages are not cached',async()=>{
    const {pageCache}=await import('../page-cache')
    db=base({family:'alias'});await resolve();expect(pageCache.size).toBe(0)
    db=base({family:'search'});expect(await resolve()).toBeNull();expect(pageCache.size).toBe(0)
  })
})

describe('SPEED-2: PageCache bounds',()=>{
  const page=(n:string)=>({record:{routeId:n,path:n,family:'salmon',title:n} as never,doc:{n}})
  it('entry count: the least recently used entry goes first',async()=>{
    const {PageCache}=await import('../page-cache')
    const c=new PageCache(3,1e9,1e9,1e9)
    for(const k of ['a','b','c'])c.set(k,'v1','r',page(k),10)
    expect(c.get('a','v1','r')).toBeDefined() // a becomes the most recent
    c.set('d','v1','r',page('d'),10)
    expect(c.get('b','v1','r')).toBeUndefined()
    expect(['a','c','d'].map(k=>Boolean(c.get(k,'v1','r')))).toEqual([true,true,true])
    expect(c.size).toBe(3)
  })
  it('bytes: total stays under the cap; an entry larger than the entry cap is not stored',async()=>{
    const {PageCache}=await import('../page-cache')
    const c=new PageCache(100,100,60,1e9)
    expect(c.set('big','v','r',page('big'),61)).toBe(false)
    c.set('a','v','r',page('a'),50);c.set('b','v','r',page('b'),50);c.set('c','v','r',page('c'),50)
    expect(c.bytes).toBeLessThanOrEqual(100)
    expect(c.get('a','v','r')).toBeUndefined()
    expect(c.get('c','v','r')).toBeDefined()
  })
  it('age: an entry older than the TTL is a miss; a changed version or release is a miss; no version (empty updatedAt) is never stored',async()=>{
    const {PageCache}=await import('../page-cache')
    const c=new PageCache(10,1e9,1e9,1000)
    c.set('p','v1','r',page('p'),10,0)
    expect(c.get('p','v1','r',999)).toBeDefined()
    expect(c.get('p','v1','r',1001)).toBeUndefined()
    c.set('p','v1','r',page('p'),10,0)
    expect(c.get('p','v2','r',1)).toBeUndefined()
    c.set('p','v1','r',page('p'),10,0)
    expect(c.get('p','v1','r2',1)).toBeUndefined()
    expect(c.set('q','','r',page('q'),10)).toBe(false)
  })
})
