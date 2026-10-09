/**
 * MEDIA-CACHE-1 (CT 2026-10-09): /media/* is cacheable for a year only where the URL changes when the bytes do (a file named by its own
 * sha256, a descriptive image URL ending in the file's sha256 prefix); every other media file revalidates daily. Both runtimes.
 */
import {afterEach,describe,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readdirSync,readFileSync,statSync} from 'node:fs'
import path from 'node:path'

const env={...process.env}
afterEach(()=>{process.env={...env};vi.resetModules()})
type Rule={source:string;headers:Array<{key:string;value:string}>}
const IMMUTABLE='public, max-age=31536000, immutable'
const DAILY='public, max-age=86400, stale-while-revalidate=604800'
/** The Cache-Control Next would send for a path: every matching rule applies, the last one wins. */
type Matcher=(source:string)=>(pathname:string)=>unknown
const loadMatch=async():Promise<Matcher>=>((await import('next/dist/compiled/path-to-regexp' as string)) as {match:Matcher}).match
const cacheControl=(match:Matcher,rules:Rule[],pathname:string):string|undefined=>{
  let value:string|undefined
  for(const rule of rules)if(match(rule.source)(pathname))for(const h of rule.headers)if(h.key==='Cache-Control')value=h.value
  return value
}
const rulesFor=async(payload:boolean)=>{
  vi.resetModules()
  if(payload)process.env.H2O_CONTENT_SOURCE='payload';else delete process.env.H2O_CONTENT_SOURCE
  return await ((await import('../../../next.config')).default as unknown as {headers:()=>Promise<Rule[]>}).headers()
}
const SHA='db4b499ce9310eb66da11a8706dada37bd0a0df146c012ca255db7379bbfd49a'

describe('MEDIA-CACHE-1',()=>{
  for(const payload of [true,false])it(`${payload?'Payload':'repository'} runtime: content-addressed media is immutable, named media revalidates daily, other paths untouched`,async()=>{
    const rules=await rulesFor(payload),match=await loadMatch()
    // physical files named by their sha256
    for(const p of [`/media/salmon/${SHA}.jpg`,`/media/derivatives/${SHA}.webp`,`/media/projects/${SHA}.png`])expect(cacheControl(match,rules,p),p).toBe(IMMUTABLE)
    // descriptive image URLs: slug + sha256 prefix
    for(const p of ['/media/complete-industrial-cooling-solutions-built-for-reliability-db4b499c.jpg','/media/ics-industrial-cooling-image-722f8613.png','/media/a-b-00ff00ff.webp'])expect(cacheControl(match,rules,p),p).toBe(IMMUTABLE)
    // named assets that can be replaced under the same name, a 7-hex tail, a subdirectory file that only looks descriptive, video
    for(const p of ['/media/design-r4/thermal-hero-1448.webp','/media/figma-testimonials/4dd64efea521919a-sarah-mitchell.png','/media/client-review/d88ec30b8ddc425c-ICS-PTT-PO-July-16.jpeg','/media/video/ics-installation-highlights.mp4','/media/slug-0123456.jpg','/media/design-r4/hero-abcdef12.webp',`/media/salmon/${SHA.slice(1)}.jpg`])
      expect(cacheControl(match,rules,p),p).toBe(DAILY)
    expect(cacheControl(match,rules,'/'),'pages are not touched').toBeUndefined()
    expect(cacheControl(match,rules,'/fans/'),'pages are not touched').toBeUndefined()
    expect(cacheControl(match,rules,'/api/media/file/x.png'),'the Payload media collection is not touched').toBeUndefined()
    // the robots / admin rules are still there
    if(payload)expect(rules.find(r=>r.source==='/admin/:path*')).toBeTruthy()
    else expect(rules.find(r=>r.source==='/:path*'&&r.headers.some(h=>h.key==='X-Robots-Tag'))).toBeTruthy()
  })
  it('the immutable rule is only used for names the bytes decide: every <64 hex>.<ext> file under public/media is the sha256 of its own bytes',()=>{
    const root=path.join(process.cwd(),'public/media')
    let checked=0
    const walk=(dir:string)=>{
      for(const name of readdirSync(dir)){
        const full=path.join(dir,name)
        if(statSync(full).isDirectory()){walk(full);continue}
        const m=/^([0-9a-f]{64})\.[a-z0-9]+$/.exec(name)
        if(!m)continue
        const bytes=readFileSync(full)
        if(bytes.subarray(0,40).toString().startsWith('version https://git-lfs'))continue
        expect(createHash('sha256').update(bytes).digest('hex'),full).toBe(m[1])
        checked++
      }
    }
    walk(root)
    expect(checked).toBeGreaterThan(1000)
  },120000)
})
