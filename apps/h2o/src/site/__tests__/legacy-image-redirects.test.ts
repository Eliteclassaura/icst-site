/**
 * LEGACY-IMG-REDIRECTS (IMG-SEO-1 phase A, CT 2026-10-08): every old WordPress upload URL our media manifests name answers 301 to the
 * file served today (any size variant too); an unknown upload path stays a 404; nothing chains; nothing shadows a file served in place.
 */
import {afterEach,describe,expect,it,vi} from 'vitest'
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {legacyImageKey,legacyImageTarget} from '../../content/legacy-image-redirects'

const APP=process.cwd()
const read=<T>(file:string):T=>JSON.parse(readFileSync(path.join(APP,'content/salmon',file),'utf8')) as T
const map=(JSON.parse(readFileSync(path.join(APP,'content/release/legacy-image-redirects.json'),'utf8')) as {entries:Record<string,string>}).entries
const report=JSON.parse(readFileSync(path.join(APP,'ops/img-seo/legacy-image-redirects.report.json'),'utf8')) as {unresolved:string[];servedInPlace:string[];extensionlessTargetsLeftOut:string[]}
const pathOf=(url:string)=>new URL(url,'https://h2ocooling.com').pathname
const isUpload=(url:string)=>/\/wp-content\/uploads\//i.test(pathOf(url))

const inPlace=new Set<string>()
const walk=(dir:string)=>{if(!existsSync(dir))return;for(const name of readdirSync(dir)){const p=path.join(dir,name);if(statSync(p).isDirectory())walk(p);else inPlace.add(legacyImageKey(`/wp-content/uploads/${path.relative(path.join(APP,'public/wp-content/uploads'),p)}`)!)}}
walk(path.join(APP,'public/wp-content/uploads'))

/** Every upload URL the held-binary manifests name. */
const manifestUrls=():string[]=>{
  const urls:string[]=[]
  for(const r of read<Array<{url:string;file?:string}>>('media-identities.json'))if(r.file&&isUpload(r.url))urls.push(r.url)
  for(const r of read<{rows:Array<{url:string;file?:string}>}>('r24-recovered-media-identities.json').rows)if(r.file&&isUpload(r.url))urls.push(r.url)
  for(const r of read<Array<{url:string;file?:string}>>('chrome-media-supplement.json'))if(r.file&&isUpload(r.url))urls.push(r.url)
  for(const r of read<{rows:Array<{url:string;file?:string}>}>('legacy-uploads-recovered-media-identities.json').rows)if(r.file&&isUpload(r.url))urls.push(r.url)
  for(const r of read<Array<{sourceUrl:string}>>('original-library.json'))if(isUpload(r.sourceUrl))urls.push(r.sourceUrl)
  for(const p of read<Array<{src?:string;srcset?:string;source_url?:string;binary?:{file?:string}}>>('media-placements.json'))if(p.binary?.file)for(const u of [p.src,p.source_url,...(p.srcset??'').split(',').map(s=>s.trim().split(/\s+/)[0])])if(u&&isUpload(u))urls.push(u)
  return urls
}

describe('the map',()=>{
  it('is data: every entry is a served file that exists, never another legacy URL (no chains), never a path served in place',()=>{
    const keys=Object.keys(map)
    expect(keys.length).toBeGreaterThan(1500)
    for(const [key,target] of Object.entries(map)){
      expect(target,key).toMatch(/^\/media\/[^/]+(?:\/[^/]+)*\.[a-z0-9]+$/)
      expect(target,key).not.toContain('/wp-content/')
      expect(existsSync(path.join(APP,'public',target)),`${key} -> ${target}`).toBe(true)
      expect(inPlace.has(key),`${key} is served in place`).toBe(false)
    }
  })
  it('every upload URL in the manifests resolves (exact path and every size variant), except what is served in place',()=>{
    const urls=manifestUrls()
    expect(urls.length).toBeGreaterThan(10000)
    const missing:string[]=[]
    for(const url of urls){
      const key=legacyImageKey(pathOf(url))!
      if(inPlace.has(key)||report.extensionlessTargetsLeftOut.some(l=>l.startsWith(`${key} ->`)))continue
      if(!legacyImageTarget(pathOf(url)))missing.push(pathOf(url))
    }
    // a placement whose own bytes are withheld by the owner's ruling is the only allowed gap (none today)
    expect(missing.slice(0,10)).toEqual([])
  })
  it('the report names what is NOT mapped: live image URLs with no held bytes (404 as before)',()=>{
    expect(report.unresolved.length).toBeGreaterThan(0)
    for(const line of report.unresolved){
      const key=line.split('  <- ')[0]!
      expect(legacyImageTarget(`/wp-content/uploads/${key}`),key).toBeUndefined()
    }
  })
})

describe('LEGACY-IMG-REDIRECTS-1.1: the uploads recovered from the owner\'s local WordPress backups',()=>{
  const recovered=read<{rows:Array<{url:string;sha256:string;bytes:number;file:string;width:number;height:number;format:string;authority:string;source:string}>}>('legacy-uploads-recovered-media-identities.json').rows
  it('625 held binaries: stored as <sha256>.<ext> byte-for-byte, with their size and source recorded',()=>{
    expect(recovered).toHaveLength(625)
    for(const r of recovered){
      expect(r.file,r.url).toBe(`media/${r.sha256}.${r.file.split('.').pop()}`)
      const bytes=readFileSync(path.join(APP,'public/media/salmon',path.basename(r.file)))
      expect(bytes.length,r.url).toBe(r.bytes)
      expect(createHash('sha256').update(bytes).digest('hex'),r.url).toBe(r.sha256)
      expect(r.width,r.url).toBeGreaterThan(0);expect(r.height,r.url).toBeGreaterThan(0)
      expect(r.authority).toBe('LEGACY_IMG_REDIRECTS_1_1_LOCAL_BACKUP_RECOVERED')
      expect(r.source).toContain('wp-content/uploads/')
    }
  })
  it('every one redirects, its size variants too, to its own file',()=>{
    for(const r of recovered){
      const p=pathOf(r.url)
      expect(legacyImageTarget(p),r.url).toBeDefined()
      expect(existsSync(path.join(APP,'public',legacyImageTarget(p)!)),r.url).toBe(true)
      expect(legacyImageTarget(p.replace(/(\.[a-z0-9]+)$/i,'-1024x768$1')),r.url).toBe(legacyImageTarget(p))
    }
  })
  it('only six named uploads remain unmapped (not in the backups)',()=>{
    expect(report.unresolved.map(l=>l.split('  <- ')[0]).sort()).toEqual([
      '2025/08/closed-loop-vs-open-loop-cooling-tower-industrial-comparison.jpg','2026/02/cooling-tower-approach-guide.jpg','2026/03/cooling-tower-efficiency-calculation-step-by-step-guide.jpg',
      '2026/06/1132264e6386fadd5aac512b23f03b076434cb2d.png','2026/06/5a81791e8dc3945fd3b289874b92376d1d93eaa8.png','2026/06/b95ce15eb0570fbdab96fe91ac9655e21ade1ff1.png'])
  })
  it('pages do not read the recovered manifest: no page gains or loses an image',()=>{
    expect(readFileSync(path.join(APP,'src/site/salmon.ts'),'utf8')).not.toContain('legacy-uploads-recovered')
  })
})

describe('the key and the lookup',()=>{
  const some=Object.keys(map).find(k=>/\.jpe?g$/.test(k)&&!/-\d+x\d+|scaled/.test(k))!
  it('drops the WordPress size suffix, -scaled and the appended .webp; case and percent-escapes do not matter',()=>{
    const [stem,ext]=[some.replace(/\.[a-z0-9]+$/,''),some.match(/\.[a-z0-9]+$/)![0]]
    const target=map[some]!
    for(const variant of [`${stem}${ext}`,`${stem}-1024x768${ext}`,`${stem}-300x200${ext}`,`${stem}-scaled${ext}`,`${stem}${ext}.webp`,`${stem}-768x432${ext}.webp`,`${stem}${ext}`.toUpperCase()])
      expect(legacyImageTarget(`/wp-content/uploads/${variant}`),variant).toBe(target)
    expect(legacyImageTarget(`https://h2ocooling.com/wp-content/uploads/${stem}-150x150${ext}?x=1`.replace('https://h2ocooling.com',''))).toBe(target)
  })
  it('maps the two images CT named: the PTT cracker project photo and the PTT purchase-order tile, at the sizes the old site used',()=>{
    expect(legacyImageTarget('/wp-content/uploads/2024/06/PTT-Cracker-1024x768.jpg')).toBe('/media/projects/f71c20c68113f3dd4d6cfec8b409b0148d200872692d62d800a89730c74f74bc.jpg')
    expect(legacyImageTarget('/wp-content/uploads/2024/06/PTT-Cracker-scaled.jpg')).toBe('/media/projects/f71c20c68113f3dd4d6cfec8b409b0148d200872692d62d800a89730c74f74bc.jpg')
    expect(legacyImageTarget('/wp-content/uploads/2025/02/ICS-PTT-PO-July-16.jpeg')).toBe('/media/client-review/d88ec30b8ddc425c-ICS-PTT-PO-July-16.jpeg')
  })
  it('an unknown upload path and a non-upload path are untouched',()=>{
    expect(legacyImageTarget('/wp-content/uploads/2019/01/never-existed-1024x768.jpg')).toBeUndefined()
    expect(legacyImageTarget('/wp-content/plugins/x.js')).toBeUndefined()
    expect(legacyImageTarget('/about-ics/')).toBeUndefined()
    expect(legacyImageKey('/media/salmon/abc.png')).toBeUndefined()
  })
})

describe('the proxy',()=>{
  const env0={...process.env}
  afterEach(()=>{process.env={...env0};vi.resetModules()})
  const O='https://h2ocooling.com'
  const known=Object.keys(map)[0]!
  const ask=async(p:string,payload:boolean)=>{
    vi.resetModules()
    if(payload)Object.assign(process.env,{H2O_CONTENT_SOURCE:'payload'});else delete process.env.H2O_CONTENT_SOURCE
    const {proxy}=await import('../../proxy');const {NextRequest}=await import('next/server')
    return proxy(new NextRequest(`${O}${p}`))
  }
  for(const payload of [false,true])it(`301s a known legacy URL to the served file (${payload?'Payload':'repository'} mode), with the variant`,async()=>{
    const res=await ask(`/wp-content/uploads/${known.replace(/(\.[a-z0-9]+)$/,'-1024x768$1')}`,payload)
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe(`${O}${map[known]}`)
    expect(res.headers.get('cache-control')).toContain('max-age')
  })
  it('does not redirect an unknown upload path',async()=>{
    const res=await ask('/wp-content/uploads/2019/01/never-existed.jpg',false)
    expect(res.status).not.toBe(301)
    expect(res.headers.get('location')).toBeNull()
  })
})
